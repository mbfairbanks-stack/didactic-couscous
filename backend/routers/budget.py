"""Budget targets, auto-populate/copy/rollover tools, and budget templates."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct, text, nullslast
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, List
import datetime
import tempfile, os, io, json, csv, re, math
from collections import defaultdict

import models
from database import get_db

router = APIRouter()

class BudgetTargetCreate(BaseModel):
    category: str
    year: int
    month: Optional[int] = None
    amount: float


class BudgetTargetOut(BudgetTargetCreate):
    id: int
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Budget targets
# ---------------------------------------------------------------------------

@router.get("/budget-targets", response_model=list[BudgetTargetOut])
def list_budget_targets(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = select(models.BudgetTarget)
    if year:
        q = q.where(models.BudgetTarget.year == year)
    if month is not None:
        q = q.where(models.BudgetTarget.month == month)
    return db.execute(q).scalars().all()


@router.post("/budget-targets", response_model=BudgetTargetOut, status_code=201)
def create_budget_target(body: BudgetTargetCreate, db: Session = Depends(get_db)):
    target = models.BudgetTarget(**body.model_dump())
    try:
        db.add(target)
        db.commit()
        db.refresh(target)
        return target
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate entry — record already exists")


@router.put("/budget-targets/{target_id}", response_model=BudgetTargetOut)
def update_budget_target(target_id: int, body: BudgetTargetCreate, db: Session = Depends(get_db)):
    target = db.get(models.BudgetTarget, target_id)
    if not target:
        raise HTTPException(404, "Budget target not found")
    for field, val in body.model_dump().items():
        setattr(target, field, val)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/budget-targets/{target_id}", status_code=204)
def delete_budget_target(target_id: int, db: Session = Depends(get_db)):
    target = db.get(models.BudgetTarget, target_id)
    if not target:
        raise HTTPException(404, "Budget target not found")
    db.delete(target)
    db.commit()


# ---------------------------------------------------------------------------
# Budget auto-populate from historical averages
# ---------------------------------------------------------------------------

class AutoPopulateRequest(BaseModel):
    year: int
    month: int
    lookback_months: int = 3
    overwrite: bool = False


@router.post("/budget-targets/auto-populate")
def auto_populate_budget(body: AutoPopulateRequest, db: Session = Depends(get_db)):
    """Create budget targets for a month based on historical spending averages."""
    # Determine the N months before the target month
    target = body.year * 12 + body.month
    history_months = []
    for i in range(1, body.lookback_months + 1):
        val = target - i
        history_months.append((val // 12, val % 12 if val % 12 != 0 else 12))
        if val % 12 == 0:
            history_months[-1] = (val // 12 - 1, 12)

    # Sum per category per month in the lookback window
    cat_totals: dict[str, list[float]] = defaultdict(list)
    for yr, mo in history_months:
        rows = db.execute(
            select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
            .where(models.Transaction.year == yr, models.Transaction.month == mo)
            .group_by(models.Transaction.category)
        ).all()
        for r in rows:
            cat_totals[r.category].append(r.total)

    created = 0
    skipped = 0
    for category, monthly_vals in cat_totals.items():
        avg = round(sum(monthly_vals) / len(monthly_vals), 2)
        existing = db.execute(
            select(models.BudgetTarget).where(
                models.BudgetTarget.category == category,
                models.BudgetTarget.year == body.year,
                models.BudgetTarget.month == body.month,
            )
        ).scalar_one_or_none()

        if existing:
            if body.overwrite:
                existing.amount = avg
                created += 1
            else:
                skipped += 1
        else:
            db.add(models.BudgetTarget(category=category, year=body.year, month=body.month, amount=avg))
            created += 1

    db.commit()
    return {"set": created, "skipped": skipped, "months_analyzed": len(history_months)}


class CopyBudgetRequest(BaseModel):
    from_year: int
    from_month: int
    to_year: int
    to_month: int
    overwrite: bool = False


@router.post("/budget-targets/copy-from-month")
def copy_budget_from_month(body: CopyBudgetRequest, db: Session = Depends(get_db)):
    """Copy budget targets from one month to another."""
    source = db.execute(
        select(models.BudgetTarget).where(
            models.BudgetTarget.year == body.from_year,
            models.BudgetTarget.month == body.from_month,
        )
    ).scalars().all()
    copied = 0
    skipped = 0
    for t in source:
        existing = db.execute(
            select(models.BudgetTarget).where(
                models.BudgetTarget.category == t.category,
                models.BudgetTarget.year == body.to_year,
                models.BudgetTarget.month == body.to_month,
            )
        ).scalar_one_or_none()
        if existing and not body.overwrite:
            skipped += 1
            continue
        if existing:
            existing.amount = t.amount
        else:
            db.add(models.BudgetTarget(
                category=t.category, year=body.to_year,
                month=body.to_month, amount=t.amount,
            ))
        copied += 1
    db.commit()
    return {"copied": copied, "skipped": skipped}


class RolloverRequest(BaseModel):
    year: int
    month: int
    carry_remainder: bool = True


@router.post("/budget-targets/rollover")
def rollover_budget(body: RolloverRequest, db: Session = Depends(get_db)):
    """Copy prior month's budget targets to current month. Optionally add unspent amount."""
    prior_month = body.month - 1 if body.month > 1 else 12
    prior_year = body.year if body.month > 1 else body.year - 1

    prior_targets = db.execute(
        select(models.BudgetTarget).where(
            models.BudgetTarget.year == prior_year,
            models.BudgetTarget.month == prior_month,
        )
    ).scalars().all()

    # Prior month actuals per category
    prior_actuals = {}
    if body.carry_remainder:
        rows = db.execute(
            select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
            .where(models.Transaction.year == prior_year, models.Transaction.month == prior_month)
            .group_by(models.Transaction.category)
        ).all()
        prior_actuals = {r.category: r.total for r in rows}

    existing_cats = {t.category for t in db.execute(
        select(models.BudgetTarget).where(
            models.BudgetTarget.year == body.year,
            models.BudgetTarget.month == body.month,
        )
    ).scalars().all()}

    copied = 0
    for t in prior_targets:
        if t.category in existing_cats:
            continue
        rollover_amount = t.amount
        if body.carry_remainder:
            actual = prior_actuals.get(t.category, 0)
            unspent = t.amount - actual
            if unspent > 0:
                rollover_amount = t.amount + unspent
        db.add(models.BudgetTarget(category=t.category, year=body.year, month=body.month, amount=round(rollover_amount, 2)))
        copied += 1

    db.commit()
    return {"copied": copied}


# ---------------------------------------------------------------------------
# Budget templates
# ---------------------------------------------------------------------------

class SaveTemplateRequest(BaseModel):
    name: str
    year: int
    month: int


class ApplyTemplateRequest(BaseModel):
    name: str
    year: int
    month: int
    overwrite: bool = False


@router.get("/budget-templates")
def list_budget_templates(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.AppSettings).where(
            models.AppSettings.key.like("budget_template:%")
        )
    ).scalars().all()
    templates = []
    for r in rows:
        name = r.key[len("budget_template:"):]
        try:
            items = json.loads(r.value)
        except Exception:
            items = []
        templates.append({"name": name, "count": len(items)})
    return templates


@router.post("/budget-templates/save")
def save_budget_template(body: SaveTemplateRequest, db: Session = Depends(get_db)):
    targets = db.execute(
        select(models.BudgetTarget).where(
            models.BudgetTarget.year == body.year,
            models.BudgetTarget.month == body.month,
        )
    ).scalars().all()
    items = [{"category": t.category, "amount": t.amount} for t in targets]
    key = f"budget_template:{body.name}"
    existing = db.get(models.AppSettings, key)
    if existing:
        existing.value = json.dumps(items)
    else:
        db.add(models.AppSettings(key=key, value=json.dumps(items)))
    db.commit()
    return {"name": body.name, "count": len(items)}


@router.post("/budget-templates/apply")
def apply_budget_template(body: ApplyTemplateRequest, db: Session = Depends(get_db)):
    key = f"budget_template:{body.name}"
    setting = db.get(models.AppSettings, key)
    if not setting:
        raise HTTPException(404, "Template not found")
    items = json.loads(setting.value)
    existing = {t.category: t for t in db.execute(
        select(models.BudgetTarget).where(
            models.BudgetTarget.year == body.year,
            models.BudgetTarget.month == body.month,
        )
    ).scalars().all()}
    applied = 0
    for item in items:
        if item["category"] in existing:
            if body.overwrite:
                existing[item["category"]].amount = item["amount"]
                applied += 1
        else:
            db.add(models.BudgetTarget(category=item["category"], year=body.year, month=body.month, amount=item["amount"]))
            applied += 1
    db.commit()
    return {"applied": applied}


@router.delete("/budget-templates/{name}", status_code=204)
def delete_budget_template(name: str, db: Session = Depends(get_db)):
    key = f"budget_template:{name}"
    setting = db.get(models.AppSettings, key)
    if not setting:
        raise HTTPException(404, "Template not found")
    db.delete(setting)
    db.commit()
