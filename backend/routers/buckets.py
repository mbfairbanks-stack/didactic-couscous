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
import datetime
import json

import models
import pay_projection
from buckets import (
    BUCKETS, BUCKET_BLURBS, BUCKET_LABELS, DEFAULT_PLAN, FIXED, GUILT_FREE,
    MEANINGFUL, PLAN_SETTINGS_KEY, default_bucket_for, normalize_plan,
)
from debt_math import effective_balance
from category_utils import ensure_category
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
def get_bucket_mapping(months: int = 12, db: Session = Depends(get_db)):
    """Every category with its bucket and what it actually costs.

    Reassigning buckets without knowing the amounts is guesswork — a category
    carrying $14,000 a year and one carrying nothing look identical in a plain
    list. Spend over the trailing window rides along so the list can be sorted
    by what matters, and so a bulk move can show its own consequence.
    """
    today = datetime.date.today()
    cutoff_year, cutoff_month = today.year, today.month
    span = max(int(months), 1)
    start = cutoff_year * 12 + cutoff_month - span

    def _spend(window_start: int | None):
        q = (
            select(models.Transaction.category,
                   func.sum(models.Transaction.amount).label("total"),
                   func.count(models.Transaction.id).label("n"),
                   func.max(models.Transaction.date).label("last_seen"))
            .group_by(models.Transaction.category)
        )
        if window_start is not None:
            q = q.where(models.Transaction.year * 12 + models.Transaction.month > window_start)
        return db.execute(q).all()

    spend_rows = _spend(start)
    windowed = True
    if not spend_rows:
        # Every transaction predates the window. An all-zero list would make
        # sorting by spend useless, so fall back to all time and say so.
        spend_rows = _spend(None)
        windowed = False
    spend = {
        r.category: {
            "total": round(float(r.total or 0), 2),
            "count": int(r.n or 0),
            "last_seen": r.last_seen.isoformat() if r.last_seen else None,
        }
        for r in spend_rows
    }
    blank = {"total": 0.0, "count": 0, "last_seen": None}

    rows = db.execute(select(models.Category).order_by(models.Category.name)).scalars().all()
    known = {r.name for r in rows}
    out = [
        {
            "name": r.name,
            "bucket": r.bucket or default_bucket_for(r.name, r.group_name),
            "group": r.group_name,
            "is_hidden": bool(r.is_hidden),
            "is_legacy": bool(r.is_legacy),
            **spend.get(r.name, blank),
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
                        "is_hidden": False, "is_legacy": False, "unregistered": True,
                        **spend.get(name, blank)})

    out.sort(key=lambda c: (-c["total"], c["name"]))
    return {
        "categories": out,
        "labels": BUCKET_LABELS,
        "months": span if windowed else None,
    }


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
    """Projected gross and net for the period.

    income.amount is GROSS. Take-home is income.net_amount when it was entered,
    otherwise projected from the person's pay schedule. The plan base is built
    from net — adding RRSP/ESPP back to *gross* would double-count them, since
    they are deducted before the deposit lands.
    """
    return pay_projection.summarize(db, year, m0, m1)


# ---------------------------------------------------------------------------
# Committed outflows — money already spoken for before the month starts
# ---------------------------------------------------------------------------

_FREQUENCY_TO_MONTHLY = {
    "weekly": 52 / 12,
    "biweekly": 26 / 12,
    "semimonthly": 2.0,
    "monthly": 1.0,
    "quarterly": 1 / 3,
    "annual": 1 / 12,
    "yearly": 1 / 12,
}


def _committed_outflows(db: Session, mapping: dict[str, str]) -> dict:
    """Recurring bills and debt payments, as a monthly figure per bucket.

    Debt minimums are a fixed cost — they arrive whether or not you think about
    them. Extra principal is meaningful savings: it buys down a liability, which
    grows net worth exactly like an investment contribution does.
    """
    totals = {b: 0.0 for b in BUCKETS}
    items: dict[str, list] = {b: [] for b in BUCKETS}

    bills = db.execute(
        select(models.RecurringBill).where(models.RecurringBill.is_active == True)  # noqa: E712
    ).scalars().all()
    for bill in bills:
        per_month = float(bill.amount or 0) * _FREQUENCY_TO_MONTHLY.get(
            (bill.frequency or "monthly").lower(), 1.0
        )
        bucket = mapping.get(bill.category or "", GUILT_FREE)
        if bucket not in BUCKETS:
            bucket = GUILT_FREE
        totals[bucket] += per_month
        items[bucket].append({
            "label": bill.name,
            "amount": round(per_month, 2),
            "category": bill.category,
            "source": "bill",
            "id": bill.id,
        })

    for debt in db.execute(select(models.Debt)).scalars().all():
        if effective_balance(debt, db) <= 0:
            continue
        minimum = float(debt.monthly_payment or 0)
        extra = float(debt.monthly_extra or 0)
        if minimum > 0:
            totals[FIXED] += minimum
            items[FIXED].append({
                "label": f"{debt.name} — minimum",
                "amount": round(minimum, 2),
                "category": "Debt Payment",
                "source": "debt",
                "id": debt.id,
            })
        if extra > 0:
            totals[MEANINGFUL] += extra
            items[MEANINGFUL].append({
                "label": f"{debt.name} — extra principal",
                "amount": round(extra, 2),
                "category": "Extra Debt Principal",
                "source": "debt_extra",
                "id": debt.id,
            })

    return {
        "totals": {b: round(totals[b], 2) for b in BUCKETS},
        "items": {b: sorted(items[b], key=lambda i: -i["amount"]) for b in BUCKETS},
    }


def build_bucket_summary(db: Session, year: int, m0: int, m1: int) -> dict:
    """Shared by the API and the AI insights context builder."""
    mapping = bucket_map(db)
    spend = _spend_by_category(db, year, m0, m1)
    income = _income_for(db, year, m0, m1)
    committed = _committed_outflows(db, mapping)
    num_months = max(m1 - m0 + 1, 1)

    totals = {b: 0.0 for b in BUCKETS}
    categories: dict[str, list] = {b: [] for b in BUCKETS}
    unmapped = []

    # Every category assigned to a bucket, spending or not. The spend lists
    # below only cover categories with transactions this period, which is not
    # the same question as "what is in this bucket".
    assigned: dict[str, list] = {b: [] for b in BUCKETS}
    for cat_name, cat_bucket in sorted(mapping.items()):
        if cat_bucket in BUCKETS:
            assigned[cat_bucket].append({
                "category": cat_name,
                "amount": round(spend.get(cat_name, 0.0), 2),
            })

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

    # The plan base is what the household had to allocate: what actually landed
    # in the bank, plus what was diverted to savings before it got there.
    plan_base = income["net"] + payroll_savings
    plan = _load_plan(db)
    allocated = sum(totals.values())

    out_buckets = []
    for b in BUCKETS:
        actual = round(totals[b], 2)
        target_amount = round(plan_base * plan[b] / 100, 2)
        committed_monthly = committed["totals"][b]
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
            "committed_monthly": committed_monthly,
            "committed_items": committed["items"][b],
            # What the target leaves once the unavoidable commitments are met.
            "uncommitted_monthly": round(target_amount / num_months - committed_monthly, 2),
            "categories": sorted(categories[b], key=lambda c: -c["amount"]),
            "assigned_categories": sorted(
                assigned[b], key=lambda c: (-c["amount"], c["category"])
            ),
        })

    committed_total = round(sum(committed["totals"].values()), 2)

    return {
        "year": year,
        "start_month": m0,
        "end_month": m1,
        "months": num_months,
        "plan": plan,
        "income": income,
        "plan_base": round(plan_base, 2),
        "plan_base_monthly": round(plan_base / num_months, 2),
        "committed_monthly": committed_total,
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


# ---------------------------------------------------------------------------
# Recurring bills — the set payments behind the committed figures above
# ---------------------------------------------------------------------------

BILL_FREQUENCIES = set(_FREQUENCY_TO_MONTHLY)


class RecurringBillBody(BaseModel):
    name: str
    merchant: Optional[str] = None
    amount: float
    frequency: str = "monthly"
    due_day: Optional[int] = None
    category: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


def _bill_out(b: models.RecurringBill, mapping: dict[str, str]) -> dict:
    per_month = float(b.amount or 0) * _FREQUENCY_TO_MONTHLY.get(
        (b.frequency or "monthly").lower(), 1.0
    )
    return {
        "id": b.id,
        "name": b.name,
        "merchant": b.merchant,
        "amount": b.amount,
        "frequency": b.frequency,
        "monthly_equivalent": round(per_month, 2),
        "due_day": b.due_day,
        "category": b.category,
        "bucket": mapping.get(b.category or "", GUILT_FREE),
        "is_active": bool(b.is_active),
        "last_seen": b.last_seen,
        "notes": b.notes,
    }


@router.get("/recurring-bills")
def list_recurring_bills(db: Session = Depends(get_db)):
    mapping = bucket_map(db)
    rows = db.execute(
        select(models.RecurringBill).order_by(models.RecurringBill.name)
    ).scalars().all()
    return [_bill_out(r, mapping) for r in rows]


@router.post("/recurring-bills", status_code=201)
def create_recurring_bill(body: RecurringBillBody, db: Session = Depends(get_db)):
    if (body.frequency or "").lower() not in BILL_FREQUENCIES:
        raise HTTPException(400, f"Unknown frequency '{body.frequency}'")
    # Register the category so it carries a real bucket. Without this a
    # mortgage entered here would fall through to guilt-free.
    category = ensure_category(db, body.category) if body.category else None
    bill = models.RecurringBill(**{**body.model_dump(),
                                   "category": category,
                                   "merchant": body.merchant or body.name})
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _bill_out(bill, bucket_map(db))


@router.put("/recurring-bills/{bill_id}")
def update_recurring_bill(bill_id: int, body: RecurringBillBody, db: Session = Depends(get_db)):
    bill = db.get(models.RecurringBill, bill_id)
    if not bill:
        raise HTTPException(404, "Recurring bill not found")
    if (body.frequency or "").lower() not in BILL_FREQUENCIES:
        raise HTTPException(400, f"Unknown frequency '{body.frequency}'")
    for field, val in body.model_dump().items():
        setattr(bill, field, val)
    bill.category = ensure_category(db, body.category) if body.category else None
    bill.merchant = body.merchant or body.name
    db.commit()
    db.refresh(bill)
    return _bill_out(bill, bucket_map(db))


@router.delete("/recurring-bills/{bill_id}", status_code=204)
def delete_recurring_bill(bill_id: int, db: Session = Depends(get_db)):
    bill = db.get(models.RecurringBill, bill_id)
    if not bill:
        raise HTTPException(404, "Recurring bill not found")
    db.delete(bill)
    db.commit()


@router.get("/buckets/commitments")
def list_commitments(db: Session = Depends(get_db)):
    """Everything already spoken for each month, grouped by bucket."""
    committed = _committed_outflows(db, bucket_map(db))
    return {
        "totals": committed["totals"],
        "items": committed["items"],
        "total_monthly": round(sum(committed["totals"].values()), 2),
        "labels": BUCKET_LABELS,
    }
