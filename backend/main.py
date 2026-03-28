from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct
from pydantic import BaseModel
from typing import Optional
from datetime import date
import tempfile, os, io, json
from collections import defaultdict

import models, database
from database import engine, get_db, run_migrations
from importer import import_xlsx

models.Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title="Budget App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    date: date
    merchant: str
    amount: float
    category: str
    year: int
    month: int
    is_fixed: bool = False
    notes: Optional[str] = None
    source: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    is_fixed: Optional[bool] = None
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
    pay_date: Optional[date] = None


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
    q = q.order_by(models.Transaction.date.desc()).offset(skip).limit(limit)
    return db.execute(q).scalars().all()


@app.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionCreate, db: Session = Depends(get_db)):
    txn = models.Transaction(**body.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@app.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(txn_id: int, body: TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    for field, val in body.model_dump(exclude_none=True).items():
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
    return [{"category": r.category, "total": r.total, "count": r.count} for r in rows]


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
    return [{"year": r.year, "month": r.month, "total": r.total} for r in rows]


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


def _build_insights_context(year: int, month: int, db: Session) -> str:
    # Current month spending by category
    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year, models.Transaction.month == month)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    # Current month income
    income_rows = db.execute(
        select(models.Income.person, models.Income.income_type, models.Income.amount)
        .where(models.Income.year == year, models.Income.month == month)
        .order_by(models.Income.person)
    ).all()
    total_income = sum(r.amount for r in income_rows)

    # Budget targets for this year (month=None = annual default)
    target_rows = db.execute(
        select(models.BudgetTarget.category, models.BudgetTarget.amount)
        .where(models.BudgetTarget.year == year, models.BudgetTarget.month == None)
    ).all()
    targets = {r.category: r.amount for r in target_rows}

    # Historical category averages (all data excluding current month)
    # Historical category averages (excluding current month)
    hist_totals = defaultdict(list)
    raw_hist = db.execute(
        select(
            models.Transaction.year,
            models.Transaction.month,
            models.Transaction.category,
            func.sum(models.Transaction.amount).label("total"),
        )
        .where(
            ~((models.Transaction.year == year) & (models.Transaction.month == month))
        )
        .group_by(models.Transaction.year, models.Transaction.month, models.Transaction.category)
    ).all()
    for r in raw_hist:
        hist_totals[r.category].append(r.total)
    hist_avg = {cat: sum(vals) / len(vals) for cat, vals in hist_totals.items()}

    # YTD totals
    ytd_exp = db.execute(
        select(func.sum(models.Transaction.amount))
        .where(models.Transaction.year == year, models.Transaction.month <= month)
    ).scalar() or 0
    ytd_inc = db.execute(
        select(func.sum(models.Income.amount))
        .where(models.Income.year == year, models.Income.month <= month)
    ).scalar() or 0

    # Build prompt
    month_label = MONTH_NAMES[month] if 1 <= month <= 12 else str(month)
    total_expenses = sum(r.total for r in cat_rows)

    lines = [
        f"You are a personal finance advisor analyzing a Canadian household budget.",
        f"",
        f"## Period: {month_label} {year}",
        f"",
        f"### Income",
    ]
    if income_rows:
        for r in income_rows:
            lines.append(f"- {r.person} ({r.income_type}): ${r.amount:,.0f}")
    else:
        lines.append("- No income recorded for this month")
    lines.append(f"- **Total household income: ${total_income:,.0f}**")
    lines.append("")
    lines.append(f"### Spending by Category (total: ${total_expenses:,.0f})")
    lines.append("| Category | This Month | Budget Target | Hist. Avg | vs Budget | vs Avg |")
    lines.append("|---|---|---|---|---|---|")
    for r in cat_rows:
        budget = targets.get(r.category)
        avg = hist_avg.get(r.category)
        vs_budget = f"+${r.total - budget:,.0f} over" if budget and r.total > budget else (f"${budget - r.total:,.0f} under" if budget else "N/A")
        vs_avg = f"+${r.total - avg:,.0f} ({((r.total/avg)-1)*100:.0f}%)" if avg else "N/A"
        lines.append(
            f"| {r.category} | ${r.total:,.0f} | {'$'+f'{budget:,.0f}' if budget else 'N/A'} | {'$'+f'{avg:,.0f}' if avg else 'N/A'} | {vs_budget} | {vs_avg} |"
        )

    savings = total_income - total_expenses
    savings_rate = (savings / total_income * 100) if total_income else 0
    lines += [
        "",
        f"### Month Summary",
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


@app.get("/insights")
async def get_insights(year: int, month: int, db: Session = Depends(get_db)):
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
