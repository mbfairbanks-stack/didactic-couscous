from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct, text
from pydantic import BaseModel
from typing import Optional, List
import datetime
import hashlib
import tempfile, os, io, json, csv, re
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv()

import models, database
from database import engine, get_db, run_migrations, DEMO_MODE
from importer import import_xlsx

models.Base.metadata.create_all(bind=engine)
run_migrations()

BUDGET_PASSWORD = os.getenv("BUDGET_PASSWORD", "")
_pw_hash = hashlib.sha256(BUDGET_PASSWORD.encode()).hexdigest() if BUDGET_PASSWORD else ""

app = FastAPI(title="BudgetBot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Skip auth when no password is configured
    if not BUDGET_PASSWORD:
        return await call_next(request)
    # Always allow CORS preflight and the login endpoint
    if request.method == "OPTIONS" or request.url.path == "/auth/login":
        return await call_next(request)
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if token != _pw_hash:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    password: str


@app.post("/auth/login")
def auth_login(body: LoginRequest):
    if not BUDGET_PASSWORD:
        return {"token": ""}
    if hashlib.sha256(body.password.encode()).hexdigest() != _pw_hash:
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": _pw_hash}


@app.get("/auth/check")
def auth_check():
    """Returns 200 if the caller is authenticated (or no auth is required)."""
    return {"ok": True, "demo": DEMO_MODE}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    date: datetime.date
    merchant: str
    amount: float
    category: str
    year: int
    month: int
    is_fixed: Optional[bool] = False
    is_recurring: Optional[bool] = False
    notes: Optional[str] = None
    source: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[datetime.date] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    is_fixed: Optional[bool] = None
    is_recurring: Optional[bool] = None
    notes: Optional[str] = None


class TransactionOut(TransactionCreate):
    id: int
    model_config = {"from_attributes": True}


class IncomeCreate(BaseModel):
    year: int
    month: int
    person: str
    income_type: str
    amount: float
    pay_date: Optional[datetime.date] = None
    rrsp_employee: float = 0.0
    rrsp_employer: float = 0.0
    espp_deduction: float = 0.0


class IncomeOut(IncomeCreate):
    id: int
    model_config = {"from_attributes": True}


class BudgetTargetCreate(BaseModel):
    category: str
    year: int
    month: Optional[int] = None
    amount: float


class BudgetTargetOut(BudgetTargetCreate):
    id: int
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    q = select(models.Transaction)
    if year:
        q = q.where(models.Transaction.year == year)
    if month:
        q = q.where(models.Transaction.month == month)
    if category:
        q = q.where(models.Transaction.category == category)
    if source:
        q = q.where(models.Transaction.source == source)
    q = q.order_by(models.Transaction.date.desc()).offset(skip).limit(limit)
    return db.execute(q).scalars().all()


@app.get("/transactions/export")
def export_transactions_csv(
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Export transactions as a CSV file."""
    q = select(models.Transaction)
    if year:
        q = q.where(models.Transaction.year == year)
    if month:
        q = q.where(models.Transaction.month == month)
    if category:
        q = q.where(models.Transaction.category == category)
    if source:
        q = q.where(models.Transaction.source == source)
    q = q.order_by(models.Transaction.date.desc())
    txns = db.execute(q).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "merchant", "amount", "category", "is_fixed", "is_recurring", "notes", "source"])
    for t in txns:
        writer.writerow([t.date, t.merchant, t.amount, t.category, t.is_fixed, t.is_recurring, t.notes, t.source])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@app.post("/transactions/auto-categorize")
def auto_categorize_transactions(db: Session = Depends(get_db)):
    """Auto-categorize transactions where category is null or 'Uncategorized'."""
    uncategorized = db.execute(
        select(models.Transaction).where(
            (models.Transaction.category == None) | (models.Transaction.category == "Uncategorized")
        )
    ).scalars().all()

    updated = 0
    skipped = 0
    for txn in uncategorized:
        # Find the most common category for this merchant in other transactions
        rows = db.execute(
            select(
                models.Transaction.category,
                func.count(models.Transaction.id).label("cnt"),
            )
            .where(
                models.Transaction.merchant == txn.merchant,
                models.Transaction.id != txn.id,
                models.Transaction.category != None,
                models.Transaction.category != "Uncategorized",
            )
            .group_by(models.Transaction.category)
            .order_by(func.count(models.Transaction.id).desc())
            .limit(1)
        ).first()
        if rows:
            txn.category = rows.category
            updated += 1
        else:
            skipped += 1

    db.commit()
    return {"updated": updated, "skipped": skipped}


def _sync_year_month(data: dict) -> dict:
    """If a date is present, always derive year/month from it."""
    if "date" in data and data["date"]:
        parts = str(data["date"]).split("-")
        if len(parts) >= 2:
            data["year"] = int(parts[0])
            data["month"] = int(parts[1])
    return data


@app.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionCreate, db: Session = Depends(get_db)):
    data = _sync_year_month(body.model_dump())
    txn = models.Transaction(**data)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@app.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(txn_id: int, body: TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    data = _sync_year_month(body.model_dump(exclude_none=True))
    for field, val in data.items():
        setattr(txn, field, val)
    db.commit()
    db.refresh(txn)
    return txn


@app.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    db.delete(txn)
    db.commit()


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

@app.get("/income", response_model=list[IncomeOut])
def list_income(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = select(models.Income)
    if year:
        q = q.where(models.Income.year == year)
    if month:
        q = q.where(models.Income.month == month)
    q = q.order_by(models.Income.year, models.Income.month)
    return db.execute(q).scalars().all()


@app.post("/income", response_model=IncomeOut, status_code=201)
def create_income(body: IncomeCreate, db: Session = Depends(get_db)):
    existing = db.execute(
        select(models.Income).where(
            models.Income.year == body.year,
            models.Income.month == body.month,
            models.Income.person == body.person,
            models.Income.income_type == body.income_type,
            models.Income.pay_date == body.pay_date,
        )
    ).scalar_one_or_none()
    if existing:
        existing.amount = body.amount
        db.commit()
        db.refresh(existing)
        return existing
    income = models.Income(**body.model_dump())
    db.add(income)
    db.commit()
    db.refresh(income)
    return income


@app.put("/income/{income_id}", response_model=IncomeOut)
def update_income(income_id: int, body: IncomeCreate, db: Session = Depends(get_db)):
    income = db.get(models.Income, income_id)
    if not income:
        raise HTTPException(404, "Income record not found")
    for field, val in body.model_dump().items():
        setattr(income, field, val)
    db.commit()
    db.refresh(income)
    return income


@app.delete("/income/{income_id}", status_code=204)
def delete_income(income_id: int, db: Session = Depends(get_db)):
    income = db.get(models.Income, income_id)
    if not income:
        raise HTTPException(404, "Income record not found")
    db.delete(income)
    db.commit()


# ---------------------------------------------------------------------------
# Budget targets
# ---------------------------------------------------------------------------

@app.get("/budget-targets", response_model=list[BudgetTargetOut])
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


@app.post("/budget-targets", response_model=BudgetTargetOut, status_code=201)
def create_budget_target(body: BudgetTargetCreate, db: Session = Depends(get_db)):
    target = models.BudgetTarget(**body.model_dump())
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@app.put("/budget-targets/{target_id}", response_model=BudgetTargetOut)
def update_budget_target(target_id: int, body: BudgetTargetCreate, db: Session = Depends(get_db)):
    target = db.get(models.BudgetTarget, target_id)
    if not target:
        raise HTTPException(404, "Budget target not found")
    for field, val in body.model_dump().items():
        setattr(target, field, val)
    db.commit()
    db.refresh(target)
    return target


@app.delete("/budget-targets/{target_id}", status_code=204)
def delete_budget_target(target_id: int, db: Session = Depends(get_db)):
    target = db.get(models.BudgetTarget, target_id)
    if not target:
        raise HTTPException(404, "Budget target not found")
    db.delete(target)
    db.commit()


# ---------------------------------------------------------------------------
# Summary / Analytics
# ---------------------------------------------------------------------------

@app.get("/summary/monthly")
def monthly_summary(year: int, db: Session = Depends(get_db)):
    """Returns monthly totals for income and expenses for a given year."""
    # Expenses by month
    expense_rows = db.execute(
        select(
            models.Transaction.month,
            func.sum(models.Transaction.amount).label("total"),
        )
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.month)
        .order_by(models.Transaction.month)
    ).all()

    # Income by month
    income_rows = db.execute(
        select(
            models.Income.month,
            func.sum(models.Income.amount).label("total"),
        )
        .where(models.Income.year == year)
        .group_by(models.Income.month)
        .order_by(models.Income.month)
    ).all()

    months = list(range(1, 13))
    expenses = {r.month: r.total for r in expense_rows}
    income = {r.month: r.total for r in income_rows}

    return [
        {
            "month": m,
            "income": income.get(m, 0),
            "expenses": expenses.get(m, 0),
            "balance": income.get(m, 0) - expenses.get(m, 0),
        }
        for m in months
    ]


@app.get("/summary/categories")
def category_summary(year: int, month: Optional[int] = None, db: Session = Depends(get_db)):
    """Returns spending totals by category."""
    q = (
        select(
            models.Transaction.category,
            func.sum(models.Transaction.amount).label("total"),
            func.count(models.Transaction.id).label("count"),
        )
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    )
    if month:
        q = q.where(models.Transaction.month == month)
    rows = db.execute(q).all()
    return [{"category": r.category, "total": round(r.total, 2), "count": r.count} for r in rows]


@app.get("/summary/totals")
def totals_summary(year: int, month: Optional[int] = None, through_month: Optional[int] = None, db: Session = Depends(get_db)):
    """Returns high-level totals: total income, total expenses, balance."""
    q_exp = select(func.sum(models.Transaction.amount)).where(models.Transaction.year == year)
    q_inc = select(func.sum(models.Income.amount)).where(models.Income.year == year)
    if month:
        q_exp = q_exp.where(models.Transaction.month == month)
        q_inc = q_inc.where(models.Income.month == month)
    elif through_month:
        q_exp = q_exp.where(models.Transaction.month <= through_month)
        q_inc = q_inc.where(models.Income.month <= through_month)
    total_expenses = db.execute(q_exp).scalar() or 0
    total_income = db.execute(q_inc).scalar() or 0
    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": total_income - total_expenses,
        "savings_rate": round((total_income - total_expenses) / total_income * 100, 1) if total_income else 0,
    }


@app.get("/summary/category-trend")
def category_trend(category: str, db: Session = Depends(get_db)):
    """Returns monthly spending for a category across all years."""
    rows = db.execute(
        select(
            models.Transaction.year,
            models.Transaction.month,
            func.sum(models.Transaction.amount).label("total"),
        )
        .where(models.Transaction.category == category)
        .group_by(models.Transaction.year, models.Transaction.month)
        .order_by(models.Transaction.year, models.Transaction.month)
    ).all()
    return [{"year": r.year, "month": r.month, "total": round(r.total, 2)} for r in rows]


@app.get("/summary/projections")
def projections_summary(year: int, month: int, db: Session = Depends(get_db)):
    """Historical averages + year-end projections based on current run rate."""
    # Historical monthly income (all months except current)
    income_months = db.execute(
        select(models.Income.year, models.Income.month, func.sum(models.Income.amount).label("total"))
        .where(~((models.Income.year == year) & (models.Income.month == month)))
        .group_by(models.Income.year, models.Income.month)
    ).all()
    avg_monthly_income = (sum(r.total for r in income_months) / len(income_months)) if income_months else 0

    # Historical monthly expenses (all months except current)
    expense_months = db.execute(
        select(models.Transaction.year, models.Transaction.month, func.sum(models.Transaction.amount).label("total"))
        .where(~((models.Transaction.year == year) & (models.Transaction.month == month)))
        .group_by(models.Transaction.year, models.Transaction.month)
    ).all()
    avg_monthly_expenses = (sum(r.total for r in expense_months) / len(expense_months)) if expense_months else 0

    # Fixed expense categories from summary source — avg per category per month
    fixed_rows = db.execute(
        select(
            models.Transaction.category,
            models.Transaction.year,
            models.Transaction.month,
            func.sum(models.Transaction.amount).label("total"),
        )
        .where(models.Transaction.source == "summary")
        .group_by(models.Transaction.category, models.Transaction.year, models.Transaction.month)
    ).all()

    cat_monthly = defaultdict(list)
    for r in fixed_rows:
        cat_monthly[r.category].append(r.total)

    fixed_categories = sorted(
        [{"category": cat, "avg_monthly": round(sum(v) / len(v), 2)} for cat, v in cat_monthly.items()],
        key=lambda x: -x["avg_monthly"],
    )
    fixed_monthly_total = sum(c["avg_monthly"] for c in fixed_categories)

    # YTD actuals
    ytd_income = db.execute(
        select(func.sum(models.Income.amount))
        .where(models.Income.year == year, models.Income.month <= month)
    ).scalar() or 0

    ytd_expenses = db.execute(
        select(func.sum(models.Transaction.amount))
        .where(models.Transaction.year == year, models.Transaction.month <= month)
    ).scalar() or 0

    remaining = 12 - month
    projected_income = ytd_income + remaining * avg_monthly_income
    projected_expenses = ytd_expenses + remaining * avg_monthly_expenses

    return {
        "avg_monthly_income": round(avg_monthly_income, 2),
        "avg_monthly_expenses": round(avg_monthly_expenses, 2),
        "fixed_monthly_total": round(fixed_monthly_total, 2),
        "fixed_categories": fixed_categories,
        "projected_year_income": round(projected_income, 2),
        "projected_year_expenses": round(projected_expenses, 2),
        "projected_year_balance": round(projected_income - projected_expenses, 2),
    }


@app.get("/summary/forecast")
def forecast_summary(year: int, month: int, db: Session = Depends(get_db)):
    """Extrapolate month-end spending per category based on days elapsed."""
    from datetime import datetime
    import calendar

    days_in_month = calendar.monthrange(year, month)[1]
    now = datetime.now()
    if now.year == year and now.month == month:
        days_elapsed = min(now.day, days_in_month)
    else:
        days_elapsed = days_in_month

    rows = db.execute(
        select(
            models.Transaction.category,
            func.sum(models.Transaction.amount).label("actual"),
        )
        .where(models.Transaction.year == year, models.Transaction.month == month)
        .group_by(models.Transaction.category)
    ).all()

    result = []
    for r in rows:
        if r.actual and r.actual > 0:
            forecast = (r.actual / days_elapsed * days_in_month) if days_elapsed > 0 else r.actual
            result.append({
                "category": r.category,
                "actual": round(r.actual, 2),
                "forecast": round(forecast, 2),
                "days_elapsed": days_elapsed,
                "days_in_month": days_in_month,
            })

    return result


@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    rows = db.execute(select(models.AppSettings)).scalars().all()
    return {r.key: r.value for r in rows}


@app.put("/settings")
def update_settings(body: dict, db: Session = Depends(get_db)):
    for key, value in body.items():
        existing = db.get(models.AppSettings, key)
        if existing:
            existing.value = str(value)
        else:
            db.add(models.AppSettings(key=key, value=str(value)))
    db.commit()
    return {"ok": True}


@app.get("/category-definitions")
def list_category_definitions(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Category).order_by(models.Category.group_name, models.Category.name)).scalars().all()
    return [{"id": r.id, "name": r.name, "group": r.group_name, "is_legacy": bool(r.is_legacy),
             "is_hidden": bool(r.is_hidden), "parent_name": r.parent_name} for r in rows]


class CategoryCreate(BaseModel):
    name: str
    group: str
    parent_name: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    group: Optional[str] = None
    is_hidden: Optional[bool] = None
    parent_name: Optional[str] = None


@app.post("/category-definitions", status_code=201)
def create_category_definition(body: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.execute(select(models.Category).where(models.Category.name == body.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{body.name}' already exists")
    cat = models.Category(name=body.name, group_name=body.group, is_legacy=False, parent_name=body.parent_name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "group": cat.group_name, "is_legacy": False,
            "is_hidden": False, "parent_name": cat.parent_name}


@app.put("/category-definitions/{cat_id}")
def update_category_definition(cat_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.group is not None:
        cat.group_name = body.group
    if body.is_hidden is not None:
        cat.is_hidden = body.is_hidden
    if body.parent_name is not None:
        cat.parent_name = body.parent_name
    elif "parent_name" in body.model_fields_set:
        cat.parent_name = None  # explicitly clearing it
    db.commit()
    return {"id": cat.id, "name": cat.name, "group": cat.group_name, "is_legacy": bool(cat.is_legacy),
            "is_hidden": bool(cat.is_hidden), "parent_name": cat.parent_name}


@app.delete("/category-definitions/{cat_id}", status_code=204)
def delete_category_definition(cat_id: int, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    count = db.execute(
        select(func.count()).where(models.Transaction.category == cat.name)
    ).scalar()
    if count > 0:
        raise HTTPException(status_code=409, detail=f"Cannot delete: {count} transaction(s) use this category")
    db.delete(cat)
    db.commit()


class CategoryMerge(BaseModel):
    source_names: list[str]
    target_name: str


@app.post("/category-definitions/merge")
def merge_categories(body: CategoryMerge, db: Session = Depends(get_db)):
    """Reassign all transactions from source categories to target, then hide sources."""
    updated = 0
    for name in body.source_names:
        result = db.execute(
            text("UPDATE transactions SET category = :target WHERE category = :source"),
            {"target": body.target_name, "source": name},
        )
        updated += result.rowcount
        # Hide the source category
        src = db.execute(select(models.Category).where(models.Category.name == name)).scalar_one_or_none()
        if src:
            src.is_hidden = True
    db.commit()
    return {"merged_transactions": updated, "hidden": body.source_names}


@app.get("/onboarding-status")
def onboarding_status(db: Session = Depends(get_db)):
    setting = db.get(models.AppSettings, "onboarding_complete")
    has_transactions = db.execute(select(func.count()).select_from(models.Transaction)).scalar() > 0
    p1 = db.get(models.AppSettings, "person_1")
    p2 = db.get(models.AppSettings, "person_2")
    has_people = (p1 and p1.value not in ("Person 1", "")) or (p2 and p2.value not in ("Person 2", ""))
    needs_onboarding = not (setting and setting.value == "true")
    return {
        "needs_onboarding": needs_onboarding,
        "has_transactions": has_transactions,
        "has_people_configured": has_people,
    }


@app.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    rows = db.execute(
        select(distinct(models.Transaction.category))
        .order_by(models.Transaction.category)
    ).scalars().all()
    return rows


@app.get("/years")
def list_years(db: Session = Depends(get_db)):
    rows = db.execute(
        select(distinct(models.Transaction.year)).order_by(models.Transaction.year)
    ).scalars().all()
    return rows


# ---------------------------------------------------------------------------
# Deduplicate
# ---------------------------------------------------------------------------

BANK_ONLY_CATEGORIES = {
    "Mortgage", "Gas (Utility)", "Hydro",
    "Municipal Taxes", "Debt Payment", "Insurance", "Reliance",
}

@app.post("/cleanup-summary")
def cleanup_summary(db: Session = Depends(get_db)):
    """Remove all summary-source rows that aren't bank-only expenses.

    This removes any CC-covered categories that were incorrectly double-imported
    from the Summary tab (e.g. Groceries, Mobile, Internet, Security).
    """
    txns = db.execute(
        select(models.Transaction).where(models.Transaction.source == "summary")
    ).scalars().all()
    removed = 0
    for txn in txns:
        merchant_lower = (txn.merchant or "").strip().lower()
        is_bad_label = (
            "income" in merchant_lower or "saving" in merchant_lower
            or merchant_lower.startswith("total") or merchant_lower == "balance"
        )
        is_cc_covered = txn.category not in BANK_ONLY_CATEGORIES
        if is_bad_label or is_cc_covered:
            db.delete(txn)
            removed += 1
    db.commit()
    return {"removed": removed}


@app.post("/deduplicate")
def deduplicate_transactions(db: Session = Depends(get_db)):
    """
    Remove duplicate transactions keeping the lowest id for each
    (date, merchant, amount, category, year, month) group.
    """
    all_txns = db.execute(
        select(models.Transaction).order_by(models.Transaction.id)
    ).scalars().all()

    seen = {}
    to_delete = []
    for txn in all_txns:
        key = (txn.date, txn.merchant.strip().lower(), round(txn.amount, 2), txn.category, txn.year, txn.month)
        if key in seen:
            to_delete.append(txn)
        else:
            seen[key] = txn.id

    for txn in to_delete:
        db.delete(txn)
    db.commit()

    return {"duplicates_removed": len(to_delete)}


@app.get("/categories/suggested-renames")
def get_suggested_renames(db: Session = Depends(get_db)):
    """Return suggested renames filtered to only old categories that still exist in transactions."""
    from categories import SUGGESTED_RENAMES
    result = db.execute(text("SELECT DISTINCT category FROM transactions"))
    existing = {row[0] for row in result.fetchall()}
    return [
        {"from_category": k, "to_category": v}
        for k, v in SUGGESTED_RENAMES.items()
        if k in existing
    ]


@app.post("/categories/migrate")
def migrate_categories(db: Session = Depends(get_db)):
    """Apply all suggested category renames to existing transactions."""
    from categories import SUGGESTED_RENAMES
    total = 0
    for old, new in SUGGESTED_RENAMES.items():
        result = db.execute(
            text("UPDATE transactions SET category = :new WHERE category = :old"),
            {"new": new, "old": old}
        )
        total += result.rowcount
    db.commit()
    return {"updated": total}


# ---------------------------------------------------------------------------
# Debts
# ---------------------------------------------------------------------------

class DebtCreate(BaseModel):
    name: str
    creditor: str
    debt_type: str = "loan"         # "loan" or "loc"
    credit_limit: float = 0.0       # LOC only
    interest_rate: float = 0.0      # annual rate, e.g. 0.0645
    initial_balance: float = 0.0
    current_balance: float = 0.0
    monthly_payment: float = 0.0
    monthly_extra: float = 0.0
    savings: float = 0.0
    due_date: Optional[str] = None
    notes: Optional[str] = None


class DebtOut(DebtCreate):
    id: int
    model_config = {"from_attributes": True}


@app.get("/debts", response_model=list[DebtOut])
def list_debts(db: Session = Depends(get_db)):
    return db.execute(select(models.Debt).order_by(models.Debt.name)).scalars().all()


@app.post("/debts", response_model=DebtOut, status_code=201)
def create_debt(body: DebtCreate, db: Session = Depends(get_db)):
    debt = models.Debt(**body.model_dump())
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


@app.put("/debts/{debt_id}", response_model=DebtOut)
def update_debt(debt_id: int, body: DebtCreate, db: Session = Depends(get_db)):
    debt = db.get(models.Debt, debt_id)
    if not debt:
        raise HTTPException(404, "Debt not found")
    for field, val in body.model_dump().items():
        setattr(debt, field, val)
    db.commit()
    db.refresh(debt)
    return debt


@app.delete("/debts/{debt_id}", status_code=204)
def delete_debt(debt_id: int, db: Session = Depends(get_db)):
    debt = db.get(models.Debt, debt_id)
    if not debt:
        raise HTTPException(404, "Debt not found")
    db.delete(debt)
    db.commit()


# ---------------------------------------------------------------------------
# Assets (DB-backed net worth assets)
# ---------------------------------------------------------------------------

class AssetCreate(BaseModel):
    name: str
    asset_type: str = "other"
    balance: float = 0.0
    notes: Optional[str] = None
    sort_order: int = 0
    auto_sync: bool = False


class AssetOut(AssetCreate):
    id: int
    model_config = {"from_attributes": True}


ASSET_DEFAULTS = [
    {"name": "Checking", "asset_type": "cash", "sort_order": 1, "auto_sync": False},
    {"name": "Savings", "asset_type": "cash", "sort_order": 2, "auto_sync": False},
    {"name": "RRSP (Payroll)", "asset_type": "rrsp", "sort_order": 3, "auto_sync": True},
    {"name": "TFSA", "asset_type": "tfsa", "sort_order": 4, "auto_sync": False},
    {"name": "ESPP (Block)", "asset_type": "espp", "sort_order": 5, "auto_sync": True},
]


@app.get("/assets", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Asset).order_by(models.Asset.sort_order, models.Asset.name)).scalars().all()
    if not rows:
        # Seed defaults on first call
        for i, d in enumerate(ASSET_DEFAULTS):
            db.add(models.Asset(**d, balance=0.0))
        db.commit()
        rows = db.execute(select(models.Asset).order_by(models.Asset.sort_order, models.Asset.name)).scalars().all()
    return rows


@app.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(body: AssetCreate, db: Session = Depends(get_db)):
    asset = models.Asset(**body.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@app.put("/assets/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, body: AssetCreate, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, val in body.model_dump().items():
        setattr(asset, field, val)
    db.commit()
    db.refresh(asset)
    return asset


@app.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    db.delete(asset)
    db.commit()


@app.post("/assets/sync-savings")
def sync_savings_assets(db: Session = Depends(get_db)):
    """Auto-update RRSP and ESPP asset balances from tracked contribution data."""
    # All-time RRSP total (employee + employer contributions from income records)
    rrsp_total = db.execute(
        select(
            func.sum(models.Income.rrsp_employee + models.Income.rrsp_employer)
        )
    ).scalar() or 0

    # All-time ESPP deductions from income records (payroll deductions, not stock purchases)
    espp_total = db.execute(
        select(func.sum(models.Income.espp_deduction))
    ).scalar() or 0

    updated = []
    assets = db.execute(select(models.Asset).where(models.Asset.auto_sync == True)).scalars().all()
    for asset in assets:
        if asset.asset_type == "rrsp" and rrsp_total > 0:
            asset.balance = round(rrsp_total, 2)
            updated.append({"id": asset.id, "name": asset.name, "balance": asset.balance})
        elif asset.asset_type == "espp" and espp_total > 0:
            asset.balance = round(espp_total, 2)
            updated.append({"id": asset.id, "name": asset.name, "balance": asset.balance})
    db.commit()
    return {"updated": updated, "rrsp_total": round(rrsp_total, 2), "espp_total": round(espp_total, 2)}


# ---------------------------------------------------------------------------
# Savings contributions (RRSP + ESPP per paycheck)
# ---------------------------------------------------------------------------

RRSP_ANNUAL_MAX = 8400.0  # employee portion; with 50% employer match total = $12,600
RRSP_MATCH_RATE = 0.50
ESPP_DEDUCTION_RATE = 0.10
ESPP_DISCOUNT_RATE = 0.15


class SavingsContributionCreate(BaseModel):
    pay_date: str
    year: int
    month: int
    gross_income: float
    rrsp_employee: float = 0.0
    rrsp_employer: Optional[float] = None  # auto-calculated if None
    espp_deduction: Optional[float] = None  # auto-calculated if None
    notes: Optional[str] = None


class SavingsContributionOut(SavingsContributionCreate):
    id: int
    model_config = {"from_attributes": True}


class EsppPurchaseCreate(BaseModel):
    purchase_date: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_deducted: float = 0.0
    shares_purchased: float = 0.0
    purchase_price: float = 0.0
    market_price: float = 0.0
    current_price: float = 0.0
    notes: Optional[str] = None


class EsppPurchaseOut(EsppPurchaseCreate):
    id: int
    model_config = {"from_attributes": True}


@app.get("/savings-contributions", response_model=list[SavingsContributionOut])
def list_savings_contributions(year: Optional[int] = None, db: Session = Depends(get_db)):
    q = select(models.SavingsContribution).order_by(models.SavingsContribution.pay_date.desc())
    if year:
        q = q.where(models.SavingsContribution.year == year)
    return db.execute(q).scalars().all()


@app.post("/savings-contributions", response_model=SavingsContributionOut, status_code=201)
def create_savings_contribution(body: SavingsContributionCreate, db: Session = Depends(get_db)):
    data = body.model_dump()
    # Auto-calculate employer match and ESPP if not provided
    if data["rrsp_employer"] is None:
        data["rrsp_employer"] = round(data["rrsp_employee"] * RRSP_MATCH_RATE, 2)
    if data["espp_deduction"] is None:
        data["espp_deduction"] = round(data["gross_income"] * ESPP_DEDUCTION_RATE, 2)
    contrib = models.SavingsContribution(**data)
    db.add(contrib)
    db.commit()
    db.refresh(contrib)
    return contrib


@app.put("/savings-contributions/{contrib_id}", response_model=SavingsContributionOut)
def update_savings_contribution(contrib_id: int, body: SavingsContributionCreate, db: Session = Depends(get_db)):
    contrib = db.get(models.SavingsContribution, contrib_id)
    if not contrib:
        raise HTTPException(404, "Contribution not found")
    data = body.model_dump()
    if data["rrsp_employer"] is None:
        data["rrsp_employer"] = round(data["rrsp_employee"] * RRSP_MATCH_RATE, 2)
    if data["espp_deduction"] is None:
        data["espp_deduction"] = round(data["gross_income"] * ESPP_DEDUCTION_RATE, 2)
    for field, val in data.items():
        setattr(contrib, field, val)
    db.commit()
    db.refresh(contrib)
    return contrib


@app.delete("/savings-contributions/{contrib_id}", status_code=204)
def delete_savings_contribution(contrib_id: int, db: Session = Depends(get_db)):
    contrib = db.get(models.SavingsContribution, contrib_id)
    if not contrib:
        raise HTTPException(404, "Contribution not found")
    db.delete(contrib)
    db.commit()


@app.get("/savings-contributions/summary")
def savings_summary(year: int, db: Session = Depends(get_db)):
    """YTD RRSP + ESPP totals sourced from income records, plus cap progress with carryover."""
    rows = db.execute(
        select(models.Income).where(models.Income.year == year)
    ).scalars().all()

    ytd_rrsp_employee = sum(r.rrsp_employee for r in rows)
    ytd_rrsp_employer = sum(r.rrsp_employer for r in rows)
    ytd_rrsp_total = ytd_rrsp_employee + ytd_rrsp_employer
    ytd_espp = sum(r.espp_deduction for r in rows)

    # Count distinct pay dates that have any savings activity
    pay_dates_with_savings = len({r.pay_date for r in rows if (r.rrsp_employee or 0) > 0 or (r.espp_deduction or 0) > 0})

    # RRSP carryover: unused contribution room from prior years accumulates
    prior_year_totals = db.execute(
        select(models.Income.year, func.sum(models.Income.rrsp_employee).label("total"))
        .where(models.Income.year < year)
        .group_by(models.Income.year)
    ).all()
    carryover_room = sum(max(RRSP_ANNUAL_MAX - (row.total or 0), 0) for row in prior_year_totals)
    effective_rrsp_cap = RRSP_ANNUAL_MAX + carryover_room

    # ESPP: all-time deductions vs total used in purchases (to show pending balance)
    all_espp_deducted = db.execute(
        select(func.sum(models.Income.espp_deduction))
    ).scalar() or 0
    all_espp_purchased = db.execute(
        select(func.sum(models.EsppPurchase.total_deducted))
    ).scalar() or 0
    espp_pending = max(all_espp_deducted - all_espp_purchased, 0)

    # ESPP purchases this year
    purchases = db.execute(
        select(models.EsppPurchase).where(
            models.EsppPurchase.purchase_date.like(f"{year}%")
        )
    ).scalars().all()
    espp_current_value = sum(
        p.shares_purchased * (p.current_price or p.market_price)
        for p in purchases
    )

    return {
        "year": year,
        "rrsp_employee_ytd": round(ytd_rrsp_employee, 2),
        "rrsp_employer_ytd": round(ytd_rrsp_employer, 2),
        "rrsp_total_ytd": round(ytd_rrsp_total, 2),
        "rrsp_annual_max": RRSP_ANNUAL_MAX,
        "rrsp_carryover": round(carryover_room, 2),
        "rrsp_effective_cap": round(effective_rrsp_cap, 2),
        "rrsp_remaining": round(max(effective_rrsp_cap - ytd_rrsp_employee, 0), 2),
        "rrsp_pct": round(min(ytd_rrsp_employee / effective_rrsp_cap * 100, 100) if effective_rrsp_cap > 0 else 0, 1),
        "espp_deducted_ytd": round(ytd_espp, 2),
        "espp_pending_all_time": round(espp_pending, 2),
        "espp_current_value": round(espp_current_value, 2),
        "espp_discount_rate": ESPP_DISCOUNT_RATE,
        "rrsp_match_rate": RRSP_MATCH_RATE,
        "contributions": pay_dates_with_savings,
    }


# ESPP Purchases
@app.get("/espp-purchases", response_model=list[EsppPurchaseOut])
def list_espp_purchases(db: Session = Depends(get_db)):
    return db.execute(select(models.EsppPurchase).order_by(models.EsppPurchase.purchase_date.desc())).scalars().all()


@app.post("/espp-purchases", response_model=EsppPurchaseOut, status_code=201)
def create_espp_purchase(body: EsppPurchaseCreate, db: Session = Depends(get_db)):
    purchase = models.EsppPurchase(**body.model_dump())
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


@app.put("/espp-purchases/{purchase_id}", response_model=EsppPurchaseOut)
def update_espp_purchase(purchase_id: int, body: EsppPurchaseCreate, db: Session = Depends(get_db)):
    purchase = db.get(models.EsppPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    for field, val in body.model_dump().items():
        setattr(purchase, field, val)
    db.commit()
    db.refresh(purchase)
    return purchase


@app.delete("/espp-purchases/{purchase_id}", status_code=204)
def delete_espp_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.get(models.EsppPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    db.delete(purchase)
    db.commit()


# ---------------------------------------------------------------------------
# Category Audit
# ---------------------------------------------------------------------------

@app.get("/merchant-categories")
def merchant_categories(db: Session = Depends(get_db)):
    """Return merchants assigned to more than one category (inconsistencies)."""
    rows = db.execute(
        select(
            models.Transaction.merchant,
            models.Transaction.category,
            func.count(models.Transaction.id).label("cnt"),
        )
        .group_by(models.Transaction.merchant, models.Transaction.category)
        .order_by(models.Transaction.merchant)
    ).all()

    by_merchant: dict[str, dict] = defaultdict(lambda: {"categories": {}, "count": 0})
    for r in rows:
        by_merchant[r.merchant]["categories"][r.category] = r.cnt
        by_merchant[r.merchant]["count"] += r.cnt

    result = []
    for merchant, data in sorted(by_merchant.items()):
        if len(data["categories"]) > 1:
            most_common = max(data["categories"], key=data["categories"].get)
            result.append({
                "merchant": merchant,
                "categories": list(data["categories"].keys()),
                "count": data["count"],
                "most_common": most_common,
            })
    return result


class BulkCategoryUpdate(BaseModel):
    merchant: str
    from_category: str
    to_category: str


@app.post("/transactions/bulk-category")
def bulk_update_category(body: BulkCategoryUpdate, db: Session = Depends(get_db)):
    """Reassign all transactions for a merchant from one category to another."""
    txns = db.execute(
        select(models.Transaction).where(
            models.Transaction.merchant == body.merchant,
            models.Transaction.category == body.from_category,
        )
    ).scalars().all()
    for txn in txns:
        txn.category = body.to_category
    db.commit()
    return {"updated": len(txns)}


class SetMerchantCategoryRequest(BaseModel):
    merchant: str
    category: str

@app.post("/transactions/set-merchant-category")
def set_merchant_category(body: SetMerchantCategoryRequest, db: Session = Depends(get_db)):
    """Reassign ALL transactions for a merchant to a single category."""
    result = db.execute(
        text("UPDATE transactions SET category = :cat WHERE merchant = :merchant"),
        {"cat": body.category, "merchant": body.merchant}
    )
    db.commit()
    return {"updated": result.rowcount}


# ---------------------------------------------------------------------------
# Smart CSV paste import
# ---------------------------------------------------------------------------

class ParseCsvRequest(BaseModel):
    text: str
    format: str = "auto"  # "auto", "amex", "td", "rbc", "cibc"


def _parse_amount(s: str) -> Optional[float]:
    if not s:
        return None
    cleaned = re.sub(r'[$,\s]', '', str(s))
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(s: str) -> Optional[str]:
    from datetime import datetime
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%y', '%Y/%m/%d',
                '%b %d, %Y', '%B %d, %Y', '%b %d %Y', '%B %d %Y',
                '%d-%b-%Y', '%d %b %Y', '%Y%m%d'):
        try:
            return datetime.strptime(s.strip(), fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def _lookup_category(merchant: str, db: Session) -> Optional[str]:
    """Find the most common historical category for a merchant using fuzzy matching."""
    # Try exact match first
    rows = db.execute(
        select(models.Transaction.category, func.count(models.Transaction.id).label("cnt"))
        .where(models.Transaction.merchant == merchant)
        .group_by(models.Transaction.category)
        .order_by(func.count(models.Transaction.id).desc())
    ).all()
    if rows:
        return rows[0].category

    # Fuzzy: extract significant words and search
    words = [w for w in re.sub(r'[^a-z\s]', '', merchant.lower()).split() if len(w) > 3]
    if not words:
        return None
    search_word = words[0]
    rows = db.execute(
        select(models.Transaction.category, func.count(models.Transaction.id).label("cnt"))
        .where(func.lower(models.Transaction.merchant).contains(search_word))
        .group_by(models.Transaction.category)
        .order_by(func.count(models.Transaction.id).desc())
    ).all()
    return rows[0].category if rows else None


@app.post("/parse-csv")
def parse_csv(body: ParseCsvRequest, db: Session = Depends(get_db)):
    """Parse CSV from AMEX/Visa/MC and return rows with suggested categories.
    Handles both headered (comma) and headerless tab-delimited (TD) formats.
    """
    raw = body.text.strip()
    if not raw:
        return {"rows": []}

    lines = raw.splitlines()

    # Detect headerless format: tab or comma delimited, first cell is a date
    # TD format: date,merchant,debit,credit,balance  (or tab-separated)
    def _split_first(line: str):
        if '\t' in line:
            return [p.strip() for p in line.split('\t')]
        return next(csv.reader([line]))

    def _is_headerless(line: str) -> bool:
        parts = _split_first(line)
        return len(parts) >= 3 and bool(_parse_date(parts[0]))

    use_td = bool(lines) and _is_headerless(lines[0])

    parsed = []

    if use_td:
        for line in lines:
            if not line.strip():
                continue
            parts = _split_first(line)
            if len(parts) < 3:
                continue
            date_str = parts[0]
            merchant = parts[1]
            # col 2 = debit (expense), col 3 = credit (payment), col 4 = balance
            debit = _parse_amount(parts[2]) if len(parts) > 2 else None
            credit = _parse_amount(parts[3]) if len(parts) > 3 else None

            parsed_date = _parse_date(date_str)
            if not parsed_date or not merchant:
                continue

            # Only import debits (expenses); skip credits/payments
            if debit and debit > 0:
                amount = debit
            else:
                continue

            suggested = _lookup_category(merchant, db)
            parsed.append({
                "date": parsed_date,
                "merchant": merchant,
                "amount": round(amount, 2),
                "suggested_category": suggested or "",
                "confidence": "high" if suggested else "low",
            })
    else:
        # Header-based CSV (AMEX, RBC, CIBC, etc.)
        reader = csv.reader(io.StringIO(raw))
        rows = list(reader)
        if len(rows) < 2:
            return {"rows": []}

        header = [h.strip().lower().replace(' ', '_') for h in rows[0]]

        def col(names):
            for n in names:
                for i, h in enumerate(header):
                    if n in h:
                        return i
            return None

        date_col  = col(['date', 'transaction_date'])
        desc_col  = col(['description', 'desc', 'merchant', 'name', 'payee'])
        amt_col   = col(['amount'])
        debit_col = col(['debit'])
        cad_col   = col(['cad$', 'cad'])

        for row in rows[1:]:
            if not row or all(not c.strip() for c in row):
                continue
            merchant = row[desc_col].strip() if desc_col is not None and desc_col < len(row) else ""
            date_str = row[date_col].strip() if date_col is not None and date_col < len(row) else ""
            if not merchant or not date_str:
                continue

            amount = None
            if amt_col is not None and amt_col < len(row):
                amount = _parse_amount(row[amt_col])
            if (amount is None or amount <= 0) and debit_col is not None and debit_col < len(row):
                amount = _parse_amount(row[debit_col])
            if (amount is None or amount <= 0) and cad_col is not None and cad_col < len(row):
                amount = _parse_amount(row[cad_col])

            if amount is None or amount <= 0:
                continue

            parsed_date = _parse_date(date_str)
            if not parsed_date:
                continue

            suggested = _lookup_category(merchant, db)
            parsed.append({
                "date": parsed_date,
                "merchant": merchant,
                "amount": round(amount, 2),
                "suggested_category": suggested or "",
                "confidence": "high" if suggested else "low",
            })

    return {"rows": parsed}


class CsvImportRow(BaseModel):
    date: str
    merchant: str
    amount: float
    category: str
    source: Optional[str] = None


@app.post("/import-csv-rows")
def import_csv_rows(rows: List[CsvImportRow], db: Session = Depends(get_db)):
    """Import reviewed CSV rows into the transactions table, skipping exact duplicates."""
    from datetime import datetime
    imported = 0
    skipped_duplicates = 0
    for row in rows:
        try:
            d = datetime.strptime(row.date, '%Y-%m-%d').date()
        except ValueError:
            continue
        dup = db.execute(
            select(models.Transaction).where(
                models.Transaction.date == d,
                models.Transaction.merchant == row.merchant,
                func.round(models.Transaction.amount, 2) == round(row.amount, 2),
            )
        ).first()
        if dup:
            skipped_duplicates += 1
            continue
        source = getattr(row, 'source', None) or "csv_import"
        txn = models.Transaction(
            date=d,
            merchant=row.merchant,
            amount=row.amount,
            category=row.category,
            year=d.year,
            month=d.month,
            source=source,
        )
        db.add(txn)
        imported += 1
    db.commit()
    return {"imported": imported, "skipped_duplicates": skipped_duplicates}


# ---------------------------------------------------------------------------
# Budget auto-populate from historical averages
# ---------------------------------------------------------------------------

class AutoPopulateRequest(BaseModel):
    year: int
    month: int
    lookback_months: int = 3
    overwrite: bool = False


@app.post("/budget-targets/auto-populate")
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


@app.post("/budget-targets/copy-from-month")
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


@app.post("/budget-targets/rollover")
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


@app.get("/transactions/anomalies")
def transaction_anomalies(year: int, month: int, threshold: float = 2.0, db: Session = Depends(get_db)):
    """Return transactions with amount > threshold × their category's per-transaction average."""
    # Compute per-category average transaction amount from prior 3 months
    target = year * 12 + month
    prior_avgs: dict[str, list[float]] = defaultdict(list)
    for i in range(1, 4):
        val = target - i
        py = (val - 1) // 12 + 1 if val % 12 == 0 else val // 12
        pm = 12 if val % 12 == 0 else val % 12
        rows = db.execute(
            select(models.Transaction.category, func.avg(models.Transaction.amount).label("avg"))
            .where(models.Transaction.year == py, models.Transaction.month == pm)
            .group_by(models.Transaction.category)
        ).all()
        for r in rows:
            prior_avgs[r.category].append(r.avg)

    avg_per_cat = {cat: sum(v) / len(v) for cat, v in prior_avgs.items() if v}

    txns = db.execute(
        select(models.Transaction).where(
            models.Transaction.year == year,
            models.Transaction.month == month,
        )
    ).scalars().all()

    anomalies = []
    for txn in txns:
        avg = avg_per_cat.get(txn.category)
        if avg and avg > 5 and txn.amount > avg * threshold:
            anomalies.append({
                "id": txn.id,
                "category": txn.category,
                "amount": txn.amount,
                "avg": round(avg, 2),
                "ratio": round(txn.amount / avg, 1),
            })
    return anomalies


class SplitRequest(BaseModel):
    amount_a: float
    category_a: str
    amount_b: float
    category_b: str


@app.post("/transactions/{txn_id}/split")
def split_transaction(txn_id: int, body: SplitRequest, db: Session = Depends(get_db)):
    """Split a transaction into two separate transactions."""
    txn = db.get(models.Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if abs(body.amount_a + body.amount_b - txn.amount) > 0.02:
        raise HTTPException(400, f"Split amounts ({body.amount_a} + {body.amount_b}) must equal original ({txn.amount})")
    t1 = models.Transaction(
        date=txn.date, merchant=txn.merchant, amount=round(body.amount_a, 2),
        category=body.category_a, year=txn.year, month=txn.month,
        is_fixed=txn.is_fixed, is_recurring=txn.is_recurring, notes=txn.notes, source=txn.source
    )
    t2 = models.Transaction(
        date=txn.date, merchant=txn.merchant, amount=round(body.amount_b, 2),
        category=body.category_b, year=txn.year, month=txn.month,
        is_fixed=txn.is_fixed, is_recurring=txn.is_recurring, notes=txn.notes, source=txn.source
    )
    db.add(t1)
    db.add(t2)
    db.delete(txn)
    db.commit()
    return {"ok": True}


@app.get("/transactions/recurring-suggestions")
def recurring_suggestions(min_months: int = 3, db: Session = Depends(get_db)):
    """Find merchants appearing in 3+ different months at a consistent amount — likely recurring."""
    rows = db.execute(
        select(
            models.Transaction.merchant,
            models.Transaction.category,
            func.count(func.distinct(
                func.cast(models.Transaction.year * 100 + models.Transaction.month, models.Transaction.id.type)
            )).label("month_count"),
            func.avg(models.Transaction.amount).label("avg_amount"),
            func.min(models.Transaction.amount).label("min_amount"),
            func.max(models.Transaction.amount).label("max_amount"),
        )
        .group_by(models.Transaction.merchant, models.Transaction.category)
    ).all()

    suggestions = []
    for r in rows:
        month_count = r.month_count
        if month_count < min_months:
            continue
        # Consistent = max within 20% of min
        if r.min_amount > 0 and r.max_amount <= r.min_amount * 1.2:
            suggestions.append({
                "merchant": r.merchant,
                "category": r.category,
                "month_count": month_count,
                "avg_amount": round(r.avg_amount, 2),
                "is_consistent": True,
            })

    return sorted(suggestions, key=lambda x: -x["month_count"])


@app.get("/summary/multi-category-trend")
def multi_category_trend(categories: str, db: Session = Depends(get_db)):
    """Monthly spending for multiple categories. categories = comma-separated."""
    cat_list = [c.strip() for c in categories.split(",") if c.strip()]
    if not cat_list:
        return []

    rows = db.execute(
        select(
            models.Transaction.category,
            models.Transaction.year,
            models.Transaction.month,
            func.sum(models.Transaction.amount).label("total"),
        )
        .where(models.Transaction.category.in_(cat_list))
        .group_by(models.Transaction.category, models.Transaction.year, models.Transaction.month)
        .order_by(models.Transaction.year, models.Transaction.month)
    ).all()

    return [{"category": r.category, "year": r.year, "month": r.month, "total": round(r.total, 2)} for r in rows]


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


@app.get("/budget-templates")
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


@app.post("/budget-templates/save")
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


@app.post("/budget-templates/apply")
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


@app.delete("/budget-templates/{name}", status_code=204)
def delete_budget_template(name: str, db: Session = Depends(get_db)):
    key = f"budget_template:{name}"
    setting = db.get(models.AppSettings, key)
    if not setting:
        raise HTTPException(404, "Template not found")
    db.delete(setting)
    db.commit()


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@app.post("/import")
async def import_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported")

    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        counts = import_xlsx(tmp_path, db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Import failed: {type(e).__name__}: {e}")
    finally:
        os.unlink(tmp_path)

    return {
        "message": "Import complete",
        "transactions_imported": counts["transactions"],
        "income_imported": counts["income"],
        "records_updated": counts["skipped"],
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@app.get("/export")
def export_xlsx(year: int, month: Optional[int] = None, db: Session = Depends(get_db)):
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = openpyxl.Workbook()

    # Transactions sheet
    ws_txn = wb.active
    ws_txn.title = "Transactions"
    headers = ["Date", "Merchant", "Amount", "Category", "Month", "Year", "Source"]
    for col, h in enumerate(headers, 1):
        cell = ws_txn.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="4472C4")
        cell.font = Font(bold=True, color="FFFFFF")

    q = select(models.Transaction).where(models.Transaction.year == year)
    if month:
        q = q.where(models.Transaction.month == month)
    q = q.order_by(models.Transaction.date)
    txns = db.execute(q).scalars().all()

    for row_idx, txn in enumerate(txns, 2):
        ws_txn.cell(row=row_idx, column=1, value=txn.date)
        ws_txn.cell(row=row_idx, column=2, value=txn.merchant)
        ws_txn.cell(row=row_idx, column=3, value=txn.amount)
        ws_txn.cell(row=row_idx, column=4, value=txn.category)
        ws_txn.cell(row=row_idx, column=5, value=txn.month)
        ws_txn.cell(row=row_idx, column=6, value=txn.year)
        ws_txn.cell(row=row_idx, column=7, value=txn.source)

    # Monthly Summary sheet
    ws_sum = wb.create_sheet("Monthly Summary")
    sum_headers = ["Month", "Income", "Expenses", "Balance"]
    for col, h in enumerate(sum_headers, 1):
        cell = ws_sum.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True)

    monthly = monthly_summary(year, db)
    for row_idx, m in enumerate(monthly, 2):
        month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        ws_sum.cell(row=row_idx, column=1, value=month_names[m["month"]])
        ws_sum.cell(row=row_idx, column=2, value=m["income"])
        ws_sum.cell(row=row_idx, column=3, value=m["expenses"])
        ws_sum.cell(row=row_idx, column=4, value=m["balance"])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"budget_{year}.xlsx" if not month else f"budget_{year}_{month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# AI Insights
# ---------------------------------------------------------------------------

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def _build_insights_context(year: int, month: Optional[int], db: Session) -> str:
    """Build the AI prompt context. month=None means full-year annual analysis."""

    if month:
        return _build_monthly_context(year, month, db)
    return _build_annual_context(year, db)


def _build_monthly_context(year: int, month: int, db: Session) -> str:
    """Single-month analysis context."""
    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year, models.Transaction.month == month)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    income_rows = db.execute(
        select(models.Income.person, models.Income.income_type, models.Income.amount)
        .where(models.Income.year == year, models.Income.month == month)
        .order_by(models.Income.person)
    ).all()
    total_income = sum(r.amount for r in income_rows)

    target_rows = db.execute(
        select(models.BudgetTarget.category, models.BudgetTarget.amount)
        .where(models.BudgetTarget.year == year, models.BudgetTarget.month == month)
    ).all()
    targets = {r.category: r.amount for r in target_rows}

    # Historical averages excluding current month
    hist_totals = defaultdict(list)
    for r in db.execute(
        select(models.Transaction.year, models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(~((models.Transaction.year == year) & (models.Transaction.month == month)))
        .group_by(models.Transaction.year, models.Transaction.month, models.Transaction.category)
    ).all():
        hist_totals[r.category].append(r.total)
    hist_avg = {cat: sum(v) / len(v) for cat, v in hist_totals.items()}

    ytd_exp = db.execute(select(func.sum(models.Transaction.amount))
        .where(models.Transaction.year == year, models.Transaction.month <= month)).scalar() or 0
    ytd_inc = db.execute(select(func.sum(models.Income.amount))
        .where(models.Income.year == year, models.Income.month <= month)).scalar() or 0

    total_expenses = sum(r.total for r in cat_rows)
    savings = total_income - total_expenses
    savings_rate = (savings / total_income * 100) if total_income else 0
    month_label = MONTH_NAMES[month]

    lines = [
        "You are a personal finance advisor analyzing a Canadian household budget.",
        "",
        f"## Period: {month_label} {year}",
        "",
        "### Income",
    ]
    if income_rows:
        for r in income_rows:
            lines.append(f"- {r.person} ({r.income_type}): ${r.amount:,.0f}")
    else:
        lines.append("- No income recorded for this month")
    lines.append(f"- **Total household income: ${total_income:,.0f}**")
    lines += [
        "",
        f"### Spending by Category (total: ${total_expenses:,.0f})",
        "| Category | This Month | Budget | Hist. Avg | vs Budget | vs Avg |",
        "|---|---|---|---|---|---|",
    ]
    for r in cat_rows:
        budget = targets.get(r.category)
        avg = hist_avg.get(r.category)
        vs_budget = f"+${r.total - budget:,.0f} over" if budget and r.total > budget else (f"${budget - r.total:,.0f} under" if budget else "N/A")
        vs_avg = f"+${r.total - avg:,.0f} ({((r.total / avg) - 1) * 100:.0f}%)" if avg else "N/A"
        lines.append(f"| {r.category} | ${r.total:,.0f} | {'$' + f'{budget:,.0f}' if budget else 'N/A'} | {'$' + f'{avg:,.0f}' if avg else 'N/A'} | {vs_budget} | {vs_avg} |")

    lines += [
        "",
        "### Month Summary",
        f"- Net savings: ${savings:,.0f} ({savings_rate:.1f}% savings rate)",
        f"- YTD income: ${ytd_inc:,.0f} | YTD expenses: ${ytd_exp:,.0f} | YTD balance: ${ytd_inc - ytd_exp:,.0f}",
        "",
        "---",
        "",
        "Please provide actionable, specific financial insights for this household. Include:",
        "1. **Top spending concerns** — categories that are high vs budget or historical average",
        "2. **Positive patterns** — where they are doing well",
        "3. **Concrete suggestions** — specific ways to reduce spending with realistic targets",
        "4. **Savings outlook** — comment on the savings rate and any recommendations",
        "5. **One priority action** — the single most impactful thing they could do this month",
        "",
        "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
    ]
    return "\n".join(lines)


def _build_annual_context(year: int, db: Session) -> str:
    """Full-year analysis context."""
    # All transactions this year by category
    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    # Month-by-month breakdown
    monthly_exp = db.execute(
        select(models.Transaction.month, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.month)
        .order_by(models.Transaction.month)
    ).all()
    monthly_inc = db.execute(
        select(models.Income.month, func.sum(models.Income.amount).label("total"))
        .where(models.Income.year == year)
        .group_by(models.Income.month)
        .order_by(models.Income.month)
    ).all()
    inc_by_month = {r.month: r.total for r in monthly_inc}
    exp_by_month = {r.month: r.total for r in monthly_exp}

    # Annual totals
    total_expenses = sum(r.total for r in cat_rows)
    total_income = db.execute(
        select(func.sum(models.Income.amount)).where(models.Income.year == year)
    ).scalar() or 0

    # Prior year for comparison
    prior_cat = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year - 1)
        .group_by(models.Transaction.category)
    ).all()
    prior_totals = {r.category: r.total for r in prior_cat}
    prior_income = db.execute(
        select(func.sum(models.Income.amount)).where(models.Income.year == year - 1)
    ).scalar() or 0
    prior_expenses = sum(r.total for r in prior_cat)

    # Budget targets for the year (use any month's targets as reference — average them)
    target_rows = db.execute(
        select(models.BudgetTarget.category, func.avg(models.BudgetTarget.amount).label("avg_amount"))
        .where(models.BudgetTarget.year == year)
        .group_by(models.BudgetTarget.category)
    ).all()
    targets = {r.category: r.avg_amount * 12 for r in target_rows}  # annualise monthly budgets

    # Peak spending month per top category
    peak_rows = db.execute(
        select(models.Transaction.category, models.Transaction.month,
               func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.category, models.Transaction.month)
    ).all()
    cat_monthly = defaultdict(dict)
    for r in peak_rows:
        cat_monthly[r.category][r.month] = r.total

    # Savings by month
    savings_by_month = {m: inc_by_month.get(m, 0) - exp_by_month.get(m, 0) for m in range(1, 13)}
    best_month = max(savings_by_month, key=savings_by_month.get)
    worst_month = min(savings_by_month, key=savings_by_month.get)

    total_savings = total_income - total_expenses
    savings_rate = (total_savings / total_income * 100) if total_income else 0

    months_with_data = [m for m in range(1, 13) if exp_by_month.get(m, 0) > 0]
    last_month_label = MONTH_NAMES[max(months_with_data)] if months_with_data else "N/A"

    lines = [
        "You are a personal finance advisor analyzing a Canadian household budget.",
        "",
        f"## Period: Full Year {year} (through {last_month_label})",
        "",
        f"### Annual Totals",
        f"- Total household income: ${total_income:,.0f}",
        f"- Total expenses: ${total_expenses:,.0f}",
        f"- Net savings: **${total_savings:,.0f}** ({savings_rate:.1f}% savings rate)",
    ]

    if prior_income or prior_expenses:
        prior_savings = prior_income - prior_expenses
        inc_chg = ((total_income - prior_income) / prior_income * 100) if prior_income else 0
        exp_chg = ((total_expenses - prior_expenses) / prior_expenses * 100) if prior_expenses else 0
        lines += [
            "",
            f"### Year-over-Year vs {year - 1}",
            f"- Income: ${total_income:,.0f} vs ${prior_income:,.0f} ({inc_chg:+.1f}%)",
            f"- Expenses: ${total_expenses:,.0f} vs ${prior_expenses:,.0f} ({exp_chg:+.1f}%)",
            f"- Savings: ${total_savings:,.0f} vs ${prior_savings:,.0f}",
        ]

    lines += [
        "",
        "### Month-by-Month Summary",
        "| Month | Income | Expenses | Savings | Rate |",
        "|---|---|---|---|---|",
    ]
    for m in range(1, 13):
        inc = inc_by_month.get(m, 0)
        exp = exp_by_month.get(m, 0)
        if inc == 0 and exp == 0:
            continue
        sav = inc - exp
        rate = f"{sav / inc * 100:.0f}%" if inc else "—"
        lines.append(f"| {MONTH_NAMES[m][:3]} | ${inc:,.0f} | ${exp:,.0f} | ${sav:,.0f} | {rate} |")

    lines += [
        "",
        f"### Spending by Category (annual total: ${total_expenses:,.0f})",
        "| Category | Annual Total | Annual Budget | vs {yr_prior} | Peak Month |".format(yr_prior=year - 1),
        "|---|---|---|---|---|",
    ]
    for r in cat_rows:
        budget = targets.get(r.category)
        prior = prior_totals.get(r.category)
        vs_prior = f"+${r.total - prior:,.0f} ({((r.total / prior) - 1) * 100:.0f}%)" if prior else "N/A"
        peak_m = max(cat_monthly.get(r.category, {1: 0}), key=cat_monthly.get(r.category, {1: 0}).get)
        peak_label = MONTH_NAMES[peak_m][:3] if cat_monthly.get(r.category) else "—"
        vs_budget = f"${budget - r.total:,.0f} under" if budget and r.total <= budget else (f"+${r.total - budget:,.0f} over" if budget else "N/A")
        lines.append(f"| {r.category} | ${r.total:,.0f} | {'$' + f'{budget:,.0f}' if budget else 'N/A'} ({vs_budget}) | {vs_prior} | {peak_label} |")

    lines += [
        "",
        f"### Savings Patterns",
        f"- Best month: {MONTH_NAMES[best_month]} (saved ${savings_by_month[best_month]:,.0f})",
        f"- Worst month: {MONTH_NAMES[worst_month]} (saved ${savings_by_month[worst_month]:,.0f})",
        "",
        "---",
        "",
        "Please provide a comprehensive annual financial review for this household. Include:",
        "1. **Annual performance summary** — overall savings rate, income vs expenses trend vs prior year",
        "2. **Top spending categories** — which categories drove the most spending and how they compare to prior year",
        "3. **Budget adherence** — where they stayed within budget and where they overspent",
        "4. **Seasonal patterns** — months with unusually high/low spending and why that might be",
        "5. **Savings rate analysis** — is the rate healthy? What would move it meaningfully?",
        "6. **Top 3 priorities for next year** — specific, actionable goals based on this year's data",
        "",
        "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
    ]
    return "\n".join(lines)


@app.get("/insights")
async def get_insights(year: int, month: Optional[int] = None, db: Session = Depends(get_db)):
    import anthropic as anthropic_sdk

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY environment variable is not set")

    context = _build_insights_context(year, month, db)

    async def stream_insights():
        client = anthropic_sdk.Anthropic(api_key=api_key)
        try:
            with client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=8192,
                thinking={"type": "enabled", "budget_tokens": 5000},
                messages=[{"role": "user", "content": context}],
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_insights(), media_type="text/event-stream")


class InsightsLogCreate(BaseModel):
    year: int
    month: int  # 0 = annual
    content: str


@app.post("/insights/log", status_code=201)
def save_insights_log(body: InsightsLogCreate, db: Session = Depends(get_db)):
    entry = models.InsightsLog(
        year=body.year,
        month=body.month,
        generated_at=datetime.datetime.now(),
        content=body.content,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "generated_at": entry.generated_at.isoformat()}


@app.get("/insights/log")
def list_insights_log(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.InsightsLog).order_by(models.InsightsLog.generated_at.desc())
    ).scalars().all()
    return [
        {
            "id": r.id,
            "year": r.year,
            "month": r.month,
            "generated_at": r.generated_at.isoformat(),
            "content": r.content,
        }
        for r in rows
    ]


@app.delete("/insights/log/{entry_id}", status_code=204)
def delete_insights_log(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(models.InsightsLog, entry_id)
    if not entry:
        raise HTTPException(404, "Not found")
    db.delete(entry)
    db.commit()
