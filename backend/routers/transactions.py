"""Transactions: CRUD, CSV export, categorization, anomalies, splits, recurring, merchant rules."""
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
    linked_debt_id: Optional[int] = None
    debt_direction: Optional[str] = None  # "payment" or "charge"


class TransactionUpdate(BaseModel):
    date: Optional[datetime.date] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    is_fixed: Optional[bool] = None
    is_recurring: Optional[bool] = None
    notes: Optional[str] = None
    linked_debt_id: Optional[int] = None
    debt_direction: Optional[str] = None


class TransactionOut(TransactionCreate):
    id: int
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=500, le=10000),
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


@router.get("/transactions/export")
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


@router.post("/transactions/auto-categorize")
def auto_categorize_transactions(db: Session = Depends(get_db)):
    """Auto-categorize transactions where category is null or 'Uncategorized'."""
    # Get all uncategorized transactions
    uncategorized = db.execute(
        select(models.Transaction).where(
            (models.Transaction.category == None) | (models.Transaction.category == "Uncategorized")
        )
    ).scalars().all()

    if not uncategorized:
        return {"updated": 0, "skipped": 0}

    # Get unique merchants that need categorization
    merchants = list({txn.merchant for txn in uncategorized})

    # Single query: for each merchant, find the most common category
    from sqlalchemy import case
    rows = db.execute(
        select(
            models.Transaction.merchant,
            models.Transaction.category,
            func.count(models.Transaction.id).label("cnt"),
        )
        .where(
            models.Transaction.merchant.in_(merchants),
            models.Transaction.category != None,
            models.Transaction.category != "Uncategorized",
        )
        .group_by(models.Transaction.merchant, models.Transaction.category)
        .order_by(func.count(models.Transaction.id).desc())
    ).all()

    # Build merchant -> best category map (first row for each merchant wins due to ORDER BY)
    merchant_cat: dict = {}
    for row in rows:
        if row.merchant not in merchant_cat:
            merchant_cat[row.merchant] = row.category

    updated = 0
    skipped = 0
    for txn in uncategorized:
        cat = merchant_cat.get(txn.merchant)
        if cat:
            txn.category = cat
            updated += 1
        else:
            skipped += 1

    db.commit()
    return {"updated": updated, "skipped": skipped}


def _sync_year_month(data: dict) -> dict:
    """If a date is present, always derive year/month from it."""
    if "date" in data and data["date"]:
        try:
            d = data["date"]
            if hasattr(d, "year"):
                data["year"] = d.year
                data["month"] = d.month
            else:
                parsed = datetime.date.fromisoformat(str(d))
                data["year"] = parsed.year
                data["month"] = parsed.month
        except (ValueError, AttributeError):
            pass
    return data


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionCreate, db: Session = Depends(get_db)):
    data = _sync_year_month(body.model_dump())
    txn = models.Transaction(**data)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
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


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    db.delete(txn)
    db.commit()


# ---------------------------------------------------------------------------
# Category Audit
# ---------------------------------------------------------------------------

@router.get("/merchant-categories")
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


@router.post("/transactions/bulk-category")
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

@router.post("/transactions/set-merchant-category")
def set_merchant_category(body: SetMerchantCategoryRequest, db: Session = Depends(get_db)):
    """Reassign ALL transactions for a merchant to a single category."""
    result = db.execute(
        text("UPDATE transactions SET category = :cat WHERE merchant = :merchant"),
        {"cat": body.category, "merchant": body.merchant}
    )
    db.commit()
    return {"updated": result.rowcount}


@router.get("/transactions/anomalies")
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


@router.post("/transactions/{txn_id}/split")
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


@router.get("/transactions/recurring-suggestions")
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


# ── Merchant Category Rules ──────────────────────────────────────────────────

class MerchantRuleUpsert(BaseModel):
    merchant_pattern: str
    category: str

@router.post("/merchant-rules", status_code=200)
def upsert_merchant_rule(body: MerchantRuleUpsert, db: Session = Depends(get_db)):
    """Save or update a merchant→category rule (called after user corrects category)."""
    existing = db.execute(
        select(models.MerchantRule).where(models.MerchantRule.merchant_pattern == body.merchant_pattern)
    ).scalar_one_or_none()
    if existing:
        existing.category = body.category
        existing.updated_at = datetime.date.today().isoformat()
    else:
        rule = models.MerchantRule(
            merchant_pattern=body.merchant_pattern,
            category=body.category,
            updated_at=datetime.date.today().isoformat(),
        )
        db.add(rule)
    db.commit()
    return {"ok": True}

@router.get("/merchant-rules")
def list_merchant_rules(db: Session = Depends(get_db)):
    rules = db.execute(select(models.MerchantRule).order_by(models.MerchantRule.merchant_pattern)).scalars().all()
    return [{"id": r.id, "merchant_pattern": r.merchant_pattern, "category": r.category, "updated_at": r.updated_at} for r in rules]

@router.delete("/merchant-rules/{rule_id}", status_code=204)
def delete_merchant_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(models.MerchantRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()


# ── Recurring Transaction Detection ─────────────────────────────────────────

@router.get("/transactions/missing-recurring")
def missing_recurring(db: Session = Depends(get_db)):
    """Find merchants that appeared in each of the last 3 months but not the current month."""
    today = datetime.date.today()
    current_year, current_month = today.year, today.month

    # Get the last 3 months
    check_months = []
    for i in range(1, 4):
        m = current_month - i
        y = current_year
        while m <= 0:
            m += 12
            y -= 1
        check_months.append((y, m))

    # Find merchants present in ALL 3 prior months
    merchant_months: dict = {}
    for y, m in check_months:
        rows = db.execute(
            select(models.Transaction.merchant, func.sum(models.Transaction.amount).label("total"))
            .where(models.Transaction.year == y, models.Transaction.month == m)
            .group_by(models.Transaction.merchant)
        ).all()
        for r in rows:
            if r.merchant not in merchant_months:
                merchant_months[r.merchant] = {"months": 0, "avg_amount": 0, "amounts": []}
            merchant_months[r.merchant]["months"] += 1
            merchant_months[r.merchant]["amounts"].append(r.total)

    # Keep only merchants that appeared in all 3 months
    recurring = {
        m: v for m, v in merchant_months.items()
        if v["months"] >= 3
    }

    # Check which are missing from current month
    current_merchants = set(
        r[0] for r in db.execute(
            select(models.Transaction.merchant)
            .where(models.Transaction.year == current_year, models.Transaction.month == current_month)
            .distinct()
        ).all()
    )

    missing = []
    for merchant, data in recurring.items():
        if merchant not in current_merchants:
            avg = round(sum(data["amounts"]) / len(data["amounts"]), 2)
            missing.append({
                "merchant": merchant,
                "avg_amount": avg,
                "months_seen": data["months"],
            })

    missing.sort(key=lambda x: x["avg_amount"], reverse=True)
    return missing
