"""The bucket plan: fixed costs, short-term savings, meaningful savings, guilt-free.

A bucket summary answers one question per bucket — "is this number where it
should be?" — for a month or a range of months. Spending comes from
transactions; savings that never reach the chequing account (payroll RRSP and
ESPP deductions) are folded into meaningful savings, because they are savings
the household actually made.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
import json

import models
from buckets import (
    BUCKETS, BUCKET_BLURBS, BUCKET_LABELS, DEFAULT_PLAN, GUILT_FREE, MEANINGFUL,
    PLAN_SETTINGS_KEY, default_bucket_for, normalize_plan,
)
from database import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Plan (target % per bucket)
# ---------------------------------------------------------------------------

def _load_plan(db: Session) -> dict:
    row = db.get(models.AppSettings, PLAN_SETTINGS_KEY)
    if not row:
        return dict(DEFAULT_PLAN)
    try:
        return normalize_plan(json.loads(row.value))
    except (TypeError, ValueError):
        return dict(DEFAULT_PLAN)


class BucketPlan(BaseModel):
    fixed: float
    short_term: float
    meaningful: float
    guilt_free: float


@router.get("/buckets/plan")
def get_bucket_plan(db: Session = Depends(get_db)):
    plan = _load_plan(db)
    return {
        "plan": plan,
        "total_pct": round(sum(plan.values()), 1),
        "labels": BUCKET_LABELS,
        "blurbs": BUCKET_BLURBS,
        "defaults": DEFAULT_PLAN,
    }


@router.put("/buckets/plan")
def put_bucket_plan(body: BucketPlan, db: Session = Depends(get_db)):
    plan = normalize_plan(body.model_dump())
    row = db.get(models.AppSettings, PLAN_SETTINGS_KEY)
    if row:
        row.value = json.dumps(plan)
    else:
        db.add(models.AppSettings(key=PLAN_SETTINGS_KEY, value=json.dumps(plan)))
    db.commit()
    return {"plan": plan, "total_pct": round(sum(plan.values()), 1)}


# ---------------------------------------------------------------------------
# Category → bucket mapping
# ---------------------------------------------------------------------------

def bucket_map(db: Session) -> dict[str, str]:
    """category name → bucket, for every category the app knows about."""
    rows = db.execute(select(models.Category)).scalars().all()
    return {r.name: (r.bucket or default_bucket_for(r.name, r.group_name)) for r in rows}


@router.get("/buckets/mapping")
def get_bucket_mapping(db: Session = Depends(get_db)):
    """Every category with its bucket, plus any category only seen on transactions."""
    rows = db.execute(select(models.Category).order_by(models.Category.name)).scalars().all()
    known = {r.name for r in rows}
    out = [
        {
            "name": r.name,
            "bucket": r.bucket or default_bucket_for(r.name, r.group_name),
            "group": r.group_name,
            "is_hidden": bool(r.is_hidden),
            "is_legacy": bool(r.is_legacy),
        }
        for r in rows
    ]
    orphan_q = (
        select(models.Transaction.category)
        .where(models.Transaction.category != "")
        .group_by(models.Transaction.category)
    )
    if known:
        orphan_q = orphan_q.where(models.Transaction.category.notin_(known))
    for name in db.execute(orphan_q).scalars().all():
        if name:
            out.append({"name": name, "bucket": GUILT_FREE, "group": "Other",
                        "is_hidden": False, "is_legacy": False, "unregistered": True})
    return {"categories": out, "labels": BUCKET_LABELS}


class MappingEntry(BaseModel):
    name: str
    bucket: str


class MappingUpdate(BaseModel):
    entries: list[MappingEntry]


@router.put("/buckets/mapping")
def put_bucket_mapping(body: MappingUpdate, db: Session = Depends(get_db)):
    """Reassign categories to buckets. Unknown categories are registered first."""
    updated = 0
    for entry in body.entries:
        if entry.bucket not in BUCKETS:
            raise HTTPException(400, f"Unknown bucket '{entry.bucket}'")
        cat = db.execute(
            select(models.Category).where(models.Category.name == entry.name)
        ).scalar_one_or_none()
        if cat is None:
            cat = models.Category(name=entry.name, group_name="Other", is_legacy=False)
            db.add(cat)
        cat.bucket = entry.bucket
        updated += 1
    db.commit()
    return {"updated": updated}


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def _month_range(year: int, month: Optional[int],
                 start_month: Optional[int], end_month: Optional[int]) -> tuple[int, int]:
    if start_month and end_month:
        return max(1, start_month), min(12, end_month)
    if month:
        return month, month
    return 1, 12


def _spend_by_category(db: Session, year: int, m0: int, m1: int) -> dict[str, float]:
    rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year,
               models.Transaction.month >= m0,
               models.Transaction.month <= m1)
        .group_by(models.Transaction.category)
    ).all()
    return {r.category: float(r.total or 0) for r in rows}


def _income_for(db: Session, year: int, m0: int, m1: int) -> dict:
    rows = db.execute(
        select(models.Income)
        .where(models.Income.year == year,
               models.Income.month >= m0,
               models.Income.month <= m1)
    ).scalars().all()
    return {
        "take_home": round(sum(float(r.amount or 0) for r in rows), 2),
        "payroll_rrsp_employee": round(sum(float(r.rrsp_employee or 0) for r in rows), 2),
        "payroll_rrsp_employer": round(sum(float(r.rrsp_employer or 0) for r in rows), 2),
        "payroll_espp": round(sum(float(r.espp_deduction or 0) for r in rows), 2),
    }


def build_bucket_summary(db: Session, year: int, m0: int, m1: int) -> dict:
    """Shared by the API and the AI insights context builder."""
    mapping = bucket_map(db)
    spend = _spend_by_category(db, year, m0, m1)
    income = _income_for(db, year, m0, m1)
    num_months = max(m1 - m0 + 1, 1)

    totals = {b: 0.0 for b in BUCKETS}
    categories: dict[str, list] = {b: [] for b in BUCKETS}
    unmapped = []

    for cat, amount in spend.items():
        bucket = mapping.get(cat)
        if bucket not in BUCKETS:
            bucket = GUILT_FREE
            unmapped.append({"category": cat, "amount": round(amount, 2)})
        totals[bucket] += amount
        categories[bucket].append({"category": cat, "amount": round(amount, 2)})

    # Savings deducted at source never appear as transactions, but they are
    # savings the household made — count them in meaningful savings.
    payroll_savings = income["payroll_rrsp_employee"] + income["payroll_espp"]
    if payroll_savings:
        totals[MEANINGFUL] += payroll_savings
        categories[MEANINGFUL].append({
            "category": "Payroll RRSP + ESPP",
            "amount": round(payroll_savings, 2),
            "from_payroll": True,
        })

    # The plan base is everything the household had to allocate: money that
    # landed in the bank plus money diverted to savings before it got there.
    plan_base = income["take_home"] + payroll_savings
    plan = _load_plan(db)
    allocated = sum(totals.values())

    out_buckets = []
    for b in BUCKETS:
        actual = round(totals[b], 2)
        target_amount = round(plan_base * plan[b] / 100, 2)
        out_buckets.append({
            "bucket": b,
            "label": BUCKET_LABELS[b],
            "blurb": BUCKET_BLURBS[b],
            "actual": actual,
            "actual_monthly": round(actual / num_months, 2),
            "target_pct": plan[b],
            "target_amount": target_amount,
            "target_monthly": round(target_amount / num_months, 2),
            "actual_pct": round(actual / plan_base * 100, 1) if plan_base else 0.0,
            "variance": round(actual - target_amount, 2),
            "categories": sorted(categories[b], key=lambda c: -c["amount"]),
        })

    return {
        "year": year,
        "start_month": m0,
        "end_month": m1,
        "months": num_months,
        "plan": plan,
        "income": income,
        "plan_base": round(plan_base, 2),
        "plan_base_monthly": round(plan_base / num_months, 2),
        "allocated": round(allocated, 2),
        "unallocated": round(plan_base - allocated, 2),
        "buckets": out_buckets,
        "unmapped_categories": sorted(unmapped, key=lambda c: -c["amount"]),
    }


@router.get("/buckets/summary")
def bucket_summary(
    year: int,
    month: Optional[int] = None,
    start_month: Optional[int] = None,
    end_month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    m0, m1 = _month_range(year, month, start_month, end_month)
    return build_bucket_summary(db, year, m0, m1)


@router.get("/buckets/trend")
def bucket_trend(year: int, months: int = 12, db: Session = Depends(get_db)):
    """Per-month bucket totals for the year — feeds the trend chart."""
    mapping = bucket_map(db)
    rows = db.execute(
        select(models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.month, models.Transaction.category)
    ).all()

    by_month: dict[int, dict[str, float]] = {
        m: {b: 0.0 for b in BUCKETS} for m in range(1, 13)
    }
    for r in rows:
        bucket = mapping.get(r.category)
        if bucket not in BUCKETS:
            bucket = GUILT_FREE
        by_month[r.month][bucket] += float(r.total or 0)

    payroll = db.execute(
        select(models.Income.month,
               func.sum(models.Income.rrsp_employee).label("rrsp"),
               func.sum(models.Income.espp_deduction).label("espp"),
               func.sum(models.Income.amount).label("take_home"))
        .where(models.Income.year == year)
        .group_by(models.Income.month)
    ).all()
    income_by_month = {}
    for r in payroll:
        contributed = float(r.rrsp or 0) + float(r.espp or 0)
        by_month[r.month][MEANINGFUL] += contributed
        income_by_month[r.month] = round(float(r.take_home or 0) + contributed, 2)

    return [
        {
            "month": m,
            "plan_base": income_by_month.get(m, 0.0),
            **{b: round(by_month[m][b], 2) for b in BUCKETS},
        }
        for m in range(1, 13)
        if income_by_month.get(m) or any(by_month[m][b] for b in BUCKETS)
    ]
