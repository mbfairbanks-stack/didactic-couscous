"""Assets, savings contributions, ESPP, net-worth snapshots/forecast, goals, bills, milestones, emergency fund."""
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
    liquidity: str = "liquid"  # "liquid" or "illiquid"


class AssetOut(AssetCreate):
    id: int
    model_config = {"from_attributes": True}


ASSET_DEFAULTS = [
    {"name": "Checking", "asset_type": "cash", "sort_order": 1, "auto_sync": False, "liquidity": "liquid"},
    {"name": "Savings", "asset_type": "cash", "sort_order": 2, "auto_sync": False, "liquidity": "liquid"},
    {"name": "RRSP (Payroll)", "asset_type": "rrsp", "sort_order": 3, "auto_sync": True, "liquidity": "illiquid"},
    {"name": "TFSA", "asset_type": "tfsa", "sort_order": 4, "auto_sync": False, "liquidity": "liquid"},
    {"name": "ESPP (Block)", "asset_type": "espp", "sort_order": 5, "auto_sync": True, "liquidity": "liquid"},
]


@router.get("/assets", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Asset).order_by(models.Asset.sort_order, models.Asset.name)).scalars().all()
    if not rows:
        # Seed defaults on first call
        for i, d in enumerate(ASSET_DEFAULTS):
            db.add(models.Asset(**d, balance=0.0))
        db.commit()
        rows = db.execute(select(models.Asset).order_by(models.Asset.sort_order, models.Asset.name)).scalars().all()
    return rows


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(body: AssetCreate, db: Session = Depends(get_db)):
    asset = models.Asset(**body.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.put("/assets/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, body: AssetCreate, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, val in body.model_dump().items():
        setattr(asset, field, val)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    db.delete(asset)
    db.commit()


@router.post("/assets/sync-savings")
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
ESPP_DISCOUNT_RATE = 0.15


def espp_deduction_rate(pay_date: str) -> float:
    """10% of gross before May 2026, 15% from May 2026 onwards."""
    return 0.15 if pay_date >= "2026-05" else 0.10


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
    current_price: float = 0.0  # kept for DB compat; always 0 for sell-on-purchase
    notes: Optional[str] = None
    allocation_json: Optional[str] = None


class EsppPurchaseOut(EsppPurchaseCreate):
    id: int
    model_config = {"from_attributes": True}


@router.get("/savings-contributions", response_model=list[SavingsContributionOut])
def list_savings_contributions(year: Optional[int] = None, db: Session = Depends(get_db)):
    q = select(models.SavingsContribution).order_by(models.SavingsContribution.pay_date.desc())
    if year:
        q = q.where(models.SavingsContribution.year == year)
    return db.execute(q).scalars().all()


@router.post("/savings-contributions", response_model=SavingsContributionOut, status_code=201)
def create_savings_contribution(body: SavingsContributionCreate, db: Session = Depends(get_db)):
    data = body.model_dump()
    # Auto-calculate employer match and ESPP if not provided
    if data["rrsp_employer"] is None:
        data["rrsp_employer"] = round(data["rrsp_employee"] * RRSP_MATCH_RATE, 2)
    if data["espp_deduction"] is None:
        data["espp_deduction"] = round(data["gross_income"] * espp_deduction_rate(data["pay_date"]), 2)
    contrib = models.SavingsContribution(**data)
    db.add(contrib)
    db.commit()
    db.refresh(contrib)
    return contrib


@router.put("/savings-contributions/{contrib_id}", response_model=SavingsContributionOut)
def update_savings_contribution(contrib_id: int, body: SavingsContributionCreate, db: Session = Depends(get_db)):
    contrib = db.get(models.SavingsContribution, contrib_id)
    if not contrib:
        raise HTTPException(404, "Contribution not found")
    data = body.model_dump()
    if data["rrsp_employer"] is None:
        data["rrsp_employer"] = round(data["rrsp_employee"] * RRSP_MATCH_RATE, 2)
    if data["espp_deduction"] is None:
        data["espp_deduction"] = round(data["gross_income"] * espp_deduction_rate(data["pay_date"]), 2)
    for field, val in data.items():
        setattr(contrib, field, val)
    db.commit()
    db.refresh(contrib)
    return contrib


@router.delete("/savings-contributions/{contrib_id}", status_code=204)
def delete_savings_contribution(contrib_id: int, db: Session = Depends(get_db)):
    contrib = db.get(models.SavingsContribution, contrib_id)
    if not contrib:
        raise HTTPException(404, "Contribution not found")
    db.delete(contrib)
    db.commit()


@router.get("/savings-contributions/summary")
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
@router.get("/espp-purchases", response_model=list[EsppPurchaseOut])
def list_espp_purchases(db: Session = Depends(get_db)):
    return db.execute(select(models.EsppPurchase).order_by(models.EsppPurchase.purchase_date.desc())).scalars().all()


@router.post("/espp-purchases", response_model=EsppPurchaseOut, status_code=201)
def create_espp_purchase(body: EsppPurchaseCreate, db: Session = Depends(get_db)):
    purchase = models.EsppPurchase(**body.model_dump())
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


@router.put("/espp-purchases/{purchase_id}", response_model=EsppPurchaseOut)
def update_espp_purchase(purchase_id: int, body: EsppPurchaseCreate, db: Session = Depends(get_db)):
    purchase = db.get(models.EsppPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    for field, val in body.model_dump().items():
        setattr(purchase, field, val)
    db.commit()
    db.refresh(purchase)
    return purchase


@router.delete("/espp-purchases/{purchase_id}", status_code=204)
def delete_espp_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.get(models.EsppPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    db.delete(purchase)
    db.commit()


# ── Net Worth Snapshots ─────────────────────────────────────────────────────

class NetWorthSnapshotOut(BaseModel):
    id: int
    snapshot_date: str
    total_assets: float
    liquid_assets: float
    illiquid_assets: float
    total_debts: float
    net_worth: float
    liquid_net_worth: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/net-worth/snapshot", response_model=NetWorthSnapshotOut, status_code=201)
def create_net_worth_snapshot(
    snapshot_notes: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Take a snapshot of current net worth computed from live assets/debts."""
    assets = db.execute(select(models.Asset)).scalars().all()
    debts = db.execute(select(models.Debt)).scalars().all()

    total_assets = sum(a.balance for a in assets)
    liquid_assets = sum(a.balance for a in assets if a.liquidity == "liquid")
    illiquid_assets = sum(a.balance for a in assets if a.liquidity == "illiquid")
    total_debts = sum(d.current_balance for d in debts)
    non_mortgage_debts = sum(d.current_balance for d in debts if d.debt_type != "mortgage")

    snap = models.NetWorthSnapshot(
        snapshot_date=datetime.date.today().isoformat(),
        total_assets=total_assets,
        liquid_assets=liquid_assets,
        illiquid_assets=illiquid_assets,
        total_debts=total_debts,
        net_worth=total_assets - total_debts,
        liquid_net_worth=liquid_assets - non_mortgage_debts,
        notes=snapshot_notes,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


@router.get("/net-worth/history", response_model=list[NetWorthSnapshotOut])
def get_net_worth_history(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.NetWorthSnapshot).order_by(models.NetWorthSnapshot.snapshot_date)
    ).scalars().all()
    return rows


@router.delete("/net-worth/snapshot/{snap_id}", status_code=204)
def delete_net_worth_snapshot(snap_id: int, db: Session = Depends(get_db)):
    snap = db.get(models.NetWorthSnapshot, snap_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    db.delete(snap)
    db.commit()


# ── Savings Goals ───────────────────────────────────────────────────────────

class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: Optional[str] = None
    linked_asset_id: Optional[int] = None
    notes: Optional[str] = None


class SavingsGoalOut(BaseModel):
    id: int
    name: str
    target_amount: float
    current_amount: float
    target_date: Optional[str] = None
    linked_asset_id: Optional[int] = None
    notes: Optional[str] = None
    progress_pct: float = 0.0

    class Config:
        from_attributes = True


@router.get("/savings-goals", response_model=list[SavingsGoalOut])
def list_savings_goals(db: Session = Depends(get_db)):
    goals = db.execute(select(models.SavingsGoal)).scalars().all()
    result = []
    for g in goals:
        current = g.current_amount
        # If linked to an asset, use the asset's live balance
        if g.linked_asset_id:
            asset = db.get(models.Asset, g.linked_asset_id)
            if asset:
                current = asset.balance
        pct = round((current / g.target_amount) * 100, 1) if g.target_amount > 0 else 0.0
        result.append(SavingsGoalOut(
            id=g.id,
            name=g.name,
            target_amount=g.target_amount,
            current_amount=current,
            target_date=g.target_date,
            linked_asset_id=g.linked_asset_id,
            notes=g.notes,
            progress_pct=pct,
        ))
    return result


@router.post("/savings-goals", response_model=SavingsGoalOut, status_code=201)
def create_savings_goal(body: SavingsGoalCreate, db: Session = Depends(get_db)):
    goal = models.SavingsGoal(**body.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    pct = round((goal.current_amount / goal.target_amount) * 100, 1) if goal.target_amount > 0 else 0.0
    return SavingsGoalOut(**{c.name: getattr(goal, c.name) for c in models.SavingsGoal.__table__.columns}, progress_pct=pct)


@router.put("/savings-goals/{goal_id}", response_model=SavingsGoalOut)
def update_savings_goal(goal_id: int, body: SavingsGoalCreate, db: Session = Depends(get_db)):
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    for k, v in body.model_dump().items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    pct = round((goal.current_amount / goal.target_amount) * 100, 1) if goal.target_amount > 0 else 0.0
    return SavingsGoalOut(**{c.name: getattr(goal, c.name) for c in models.SavingsGoal.__table__.columns}, progress_pct=pct)


@router.delete("/savings-goals/{goal_id}", status_code=204)
def delete_savings_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()


# ── Net Worth Forecast ──────────────────────────────────────────────────────

@router.get("/forecast/networth")
def forecast_networth(months: int = Query(default=12, ge=1, le=60), db: Session = Depends(get_db)):
    """12-month net worth projection based on recent average monthly surplus."""
    # Get current net worth
    assets = db.execute(select(models.Asset)).scalars().all()
    debts = db.execute(select(models.Debt)).scalars().all()
    current_nw = sum(a.balance for a in assets) - sum(d.current_balance for d in debts)

    # Compute avg monthly surplus from last 6 months of income vs spending
    today = datetime.date.today()
    results = []
    monthly_surpluses = []
    for i in range(6, 0, -1):
        d = today - datetime.timedelta(days=30 * i)
        y, m = d.year, d.month
        income_total = db.execute(
            select(func.sum(models.Income.amount)).where(
                models.Income.year == y, models.Income.month == m
            )
        ).scalar() or 0.0
        spending_total = db.execute(
            select(func.sum(models.Transaction.amount)).where(
                models.Transaction.year == y,
                models.Transaction.month == m,
                models.Transaction.category != "Income",
            )
        ).scalar() or 0.0
        if income_total > 0:
            monthly_surpluses.append(income_total - spending_total)

    avg_monthly_surplus = sum(monthly_surpluses) / len(monthly_surpluses) if monthly_surpluses else 0.0

    # Project forward
    projected_nw = current_nw
    for i in range(1, months + 1):
        projected_nw += avg_monthly_surplus
        future_date = today + datetime.timedelta(days=30 * i)
        results.append({
            "month": future_date.strftime("%b %Y"),
            "projected_net_worth": round(projected_nw, 2),
        })

    return {
        "current_net_worth": round(current_nw, 2),
        "avg_monthly_surplus": round(avg_monthly_surplus, 2),
        "forecast": results,
    }


# ── Recurring Bills ─────────────────────────────────────────────────────────

class RecurringBillCreate(BaseModel):
    name: str
    merchant: str
    amount: float
    frequency: str = "monthly"
    due_day: Optional[int] = None
    category: Optional[str] = None
    last_seen: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


class RecurringBillOut(BaseModel):
    id: int
    name: str
    merchant: str
    amount: float
    frequency: str
    due_day: Optional[int] = None
    category: Optional[str] = None
    last_seen: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/bills", response_model=list[RecurringBillOut])
def list_bills(db: Session = Depends(get_db)):
    return db.execute(
        select(models.RecurringBill).order_by(nullslast(models.RecurringBill.due_day), models.RecurringBill.name)
    ).scalars().all()


@router.post("/bills", response_model=RecurringBillOut, status_code=201)
def create_bill(body: RecurringBillCreate, db: Session = Depends(get_db)):
    bill = models.RecurringBill(**body.model_dump())
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


@router.put("/bills/{bill_id}", response_model=RecurringBillOut)
def update_bill(bill_id: int, body: RecurringBillCreate, db: Session = Depends(get_db)):
    bill = db.get(models.RecurringBill, bill_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    for k, v in body.model_dump().items():
        setattr(bill, k, v)
    db.commit()
    db.refresh(bill)
    return bill


@router.delete("/bills/{bill_id}", status_code=204)
def delete_bill(bill_id: int, db: Session = Depends(get_db)):
    bill = db.get(models.RecurringBill, bill_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    db.delete(bill)
    db.commit()


@router.get("/bills/upcoming")
def get_upcoming_bills(db: Session = Depends(get_db)):
    """Get bills with upcoming due dates this month and next month."""
    today = datetime.date.today()
    bills = db.execute(
        select(models.RecurringBill).where(models.RecurringBill.is_active == True)
    ).scalars().all()

    upcoming = []
    for bill in bills:
        if bill.due_day:
            # This month's due date
            try:
                import calendar
                last_day = calendar.monthrange(today.year, today.month)[1]
                due_day = min(bill.due_day, last_day)
                this_month_due = datetime.date(today.year, today.month, due_day)
                if this_month_due >= today:
                    days_until = (this_month_due - today).days
                    upcoming.append({
                        "id": bill.id,
                        "name": bill.name,
                        "merchant": bill.merchant,
                        "amount": bill.amount,
                        "due_date": this_month_due.isoformat(),
                        "days_until": days_until,
                        "frequency": bill.frequency,
                    })
                else:
                    # Next month
                    next_month = today.month + 1 if today.month < 12 else 1
                    next_year = today.year if today.month < 12 else today.year + 1
                    last_day_next = calendar.monthrange(next_year, next_month)[1]
                    due_day_next = min(bill.due_day, last_day_next)
                    next_due = datetime.date(next_year, next_month, due_day_next)
                    days_until = (next_due - today).days
                    upcoming.append({
                        "id": bill.id,
                        "name": bill.name,
                        "merchant": bill.merchant,
                        "amount": bill.amount,
                        "due_date": next_due.isoformat(),
                        "days_until": days_until,
                        "frequency": bill.frequency,
                    })
            except ValueError:
                pass

    upcoming.sort(key=lambda x: x["days_until"])
    return upcoming


# ── Net Worth Milestones ─────────────────────────────────────────────────────

class MilestoneCreate(BaseModel):
    label: str
    target_amount: float
    notes: Optional[str] = None

class MilestoneOut(BaseModel):
    id: int
    label: str
    target_amount: float
    achieved_at: Optional[str] = None
    notes: Optional[str] = None
    is_achieved: bool = False
    progress_pct: float = 0.0
    model_config = {"from_attributes": True}

@router.get("/net-worth/milestones", response_model=list[MilestoneOut])
def list_milestones(db: Session = Depends(get_db)):
    milestones = db.execute(
        select(models.NetWorthMilestone).order_by(models.NetWorthMilestone.target_amount)
    ).scalars().all()
    assets = db.execute(select(models.Asset)).scalars().all()
    debts = db.execute(select(models.Debt)).scalars().all()
    current_nw = sum(a.balance for a in assets) - sum(d.current_balance for d in debts)
    result = []
    for m in milestones:
        pct = round(min((current_nw / m.target_amount) * 100, 100), 1) if m.target_amount > 0 else 0.0
        is_achieved = current_nw >= m.target_amount
        # Auto-mark achieved_at if just crossed
        if is_achieved and not m.achieved_at:
            m.achieved_at = datetime.date.today().isoformat()
            db.commit()
        result.append(MilestoneOut(
            id=m.id, label=m.label, target_amount=m.target_amount,
            achieved_at=m.achieved_at, notes=m.notes,
            is_achieved=is_achieved, progress_pct=pct,
        ))
    return result

@router.post("/net-worth/milestones", response_model=MilestoneOut, status_code=201)
def create_milestone(body: MilestoneCreate, db: Session = Depends(get_db)):
    m = models.NetWorthMilestone(**body.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return MilestoneOut(id=m.id, label=m.label, target_amount=m.target_amount,
                        achieved_at=m.achieved_at, notes=m.notes)

@router.delete("/net-worth/milestones/{mid}", status_code=204)
def delete_milestone(mid: int, db: Session = Depends(get_db)):
    m = db.get(models.NetWorthMilestone, mid)
    if not m:
        raise HTTPException(404, "Milestone not found")
    db.delete(m)
    db.commit()


@router.get("/emergency-fund")
def get_emergency_fund(db: Session = Depends(get_db)):
    """Returns emergency fund status: avg monthly expenses vs liquid cash assets."""
    today = datetime.date.today()
    # Compute last 3 completed months
    monthly_totals = []
    for i in range(1, 4):
        d = (today.replace(day=1) - datetime.timedelta(days=1))
        for _ in range(i - 1):
            d = (d.replace(day=1) - datetime.timedelta(days=1))
        mo_total = db.execute(
            select(func.sum(models.Transaction.amount))
            .where(models.Transaction.year == d.year)
            .where(models.Transaction.month == d.month)
            .where(models.Transaction.amount > 0)
        ).scalar() or 0
        if mo_total > 0:
            monthly_totals.append(float(mo_total))

    avg_monthly = round(sum(monthly_totals) / len(monthly_totals), 2) if monthly_totals else 0.0

    # Liquid cash assets
    cash_assets = db.execute(
        select(models.Asset).where(
            models.Asset.asset_type == "cash",
            models.Asset.liquidity == "liquid",
        )
    ).scalars().all()
    liquid_cash = round(sum(float(a.balance or 0) for a in cash_assets), 2)

    return {
        "avg_monthly_expenses": avg_monthly,
        "liquid_cash": liquid_cash,
        "targets": {
            "3_months": round(avg_monthly * 3, 2),
            "6_months": round(avg_monthly * 6, 2),
            "9_months": round(avg_monthly * 9, 2),
        },
        "months_covered": round(liquid_cash / avg_monthly, 1) if avg_monthly > 0 else None,
    }
