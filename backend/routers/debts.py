"""Debts: CRUD, computed balances from linked transactions."""
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
# Debts
# ---------------------------------------------------------------------------

def _compute_debt_balance(
    initial_balance: float,
    annual_rate: float,
    initial_date_str: Optional[str],
    linked_txns: list,
) -> Optional[float]:
    """Walk month-by-month from initial_date, applying interest and linked transactions."""
    if not initial_date_str:
        return None
    try:
        start = datetime.date.fromisoformat(initial_date_str)
    except ValueError:
        return None

    monthly_rate = annual_rate / 12.0
    balance = float(initial_balance)
    today = datetime.date.today()

    # Sort transactions by date
    sorted_txns = sorted(linked_txns, key=lambda t: t.date)
    tx_idx = 0

    # Walk month by month from the start month through the current month
    year, month = start.year, start.month
    while (year, month) <= (today.year, today.month):
        # End of this calendar month
        if month == 12:
            next_year, next_month = year + 1, 1
        else:
            next_year, next_month = year, month + 1

        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(next_year, next_month, 1)

        # Apply monthly interest (skip first partial month if start_date is mid-month)
        if monthly_rate > 0:
            balance += balance * monthly_rate

        # Apply transactions in this calendar month
        while tx_idx < len(sorted_txns):
            t = sorted_txns[tx_idx]
            t_date = t.date if isinstance(t.date, datetime.date) else datetime.date.fromisoformat(str(t.date))
            if t_date >= month_end:
                break
            if t_date >= month_start and t_date >= start:
                if t.debt_direction == "charge":
                    balance += t.amount
                else:  # "payment" or None defaults to payment
                    balance -= t.amount
            tx_idx += 1

        year, month = next_year, next_month

    return round(max(balance, 0.0), 2)


class DebtCreate(BaseModel):
    name: str
    creditor: str
    debt_type: str = "loan"         # "loan", "loc", or "mortgage"
    credit_limit: float = 0.0       # LOC only
    interest_rate: float = 0.0      # annual rate, e.g. 0.0645
    initial_balance: float = 0.0
    current_balance: float = 0.0
    monthly_payment: float = 0.0
    monthly_extra: float = 0.0
    savings: float = 0.0
    due_date: Optional[str] = None
    notes: Optional[str] = None
    linked_asset_id: Optional[int] = None
    initial_date: Optional[str] = None


class DebtOut(BaseModel):
    id: int
    name: str
    creditor: str
    debt_type: str
    credit_limit: float
    interest_rate: float
    initial_balance: float
    current_balance: float
    monthly_payment: float
    monthly_extra: float
    savings: float
    due_date: Optional[str]
    notes: Optional[str]
    linked_asset_id: Optional[int]
    initial_date: Optional[str] = None
    equity: Optional[float] = None  # computed: linked asset balance - current_balance
    computed_balance: Optional[float] = None
    model_config = {"from_attributes": True}


@router.get("/debts/payments-summary")
def debt_payments_summary(year: int, month: int, db: Session = Depends(get_db)):
    """Per-debt sum of linked payments for a month (charges excluded).

    Replaces the dashboard pulling every transaction of the month client-side.
    """
    from sqlalchemy import or_
    rows = db.execute(
        select(
            models.Transaction.linked_debt_id,
            func.sum(models.Transaction.amount).label("paid"),
        )
        .where(
            models.Transaction.year == year,
            models.Transaction.month == month,
            models.Transaction.linked_debt_id != None,  # noqa: E711
            or_(
                models.Transaction.debt_direction == None,  # noqa: E711
                models.Transaction.debt_direction != "charge",
            ),
        )
        .group_by(models.Transaction.linked_debt_id)
    ).all()
    return {"paid": {str(r.linked_debt_id): round(r.paid, 2) for r in rows}}


@router.get("/debts", response_model=list[DebtOut])
def list_debts(db: Session = Depends(get_db)):
    debts = db.execute(select(models.Debt).order_by(models.Debt.name)).scalars().all()
    result = []
    for debt in debts:
        d = DebtOut.model_validate(debt)
        if debt.debt_type == "mortgage" and debt.linked_asset_id:
            asset = db.get(models.Asset, debt.linked_asset_id)
            if asset:
                d.equity = asset.balance - debt.current_balance
        # Compute balance from linked transactions if initial_date is set
        if debt.initial_date:
            linked_txns = db.execute(
                select(models.Transaction).where(models.Transaction.linked_debt_id == debt.id)
            ).scalars().all()
            d.computed_balance = _compute_debt_balance(
                debt.initial_balance, debt.interest_rate, debt.initial_date, linked_txns
            )
            if d.computed_balance is not None and debt.debt_type == "mortgage" and debt.linked_asset_id:
                asset = db.get(models.Asset, debt.linked_asset_id)
                if asset:
                    d.equity = asset.balance - d.computed_balance
        result.append(d)
    return result


@router.post("/debts", response_model=DebtOut, status_code=201)
def create_debt(body: DebtCreate, db: Session = Depends(get_db)):
    debt = models.Debt(**body.model_dump())
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


@router.put("/debts/{debt_id}", response_model=DebtOut)
def update_debt(debt_id: int, body: DebtCreate, db: Session = Depends(get_db)):
    debt = db.get(models.Debt, debt_id)
    if not debt:
        raise HTTPException(404, "Debt not found")
    for field, val in body.model_dump().items():
        setattr(debt, field, val)
    db.commit()
    db.refresh(debt)
    return debt


@router.delete("/debts/{debt_id}", status_code=204)
def delete_debt(debt_id: int, db: Session = Depends(get_db)):
    debt = db.get(models.Debt, debt_id)
    if not debt:
        raise HTTPException(404, "Debt not found")
    db.delete(debt)
    db.commit()


@router.get("/debts/{debt_id}/transactions")
def get_debt_transactions(debt_id: int, db: Session = Depends(get_db)):
    """Return all transactions linked to a debt, with running balance."""
    debt = db.get(models.Debt, debt_id)
    if not debt:
        raise HTTPException(404, "Debt not found")

    txns = db.execute(
        select(models.Transaction)
        .where(models.Transaction.linked_debt_id == debt_id)
        .order_by(models.Transaction.date)
    ).scalars().all()

    return [
        {
            "id": t.id,
            "date": t.date.isoformat() if hasattr(t.date, "isoformat") else str(t.date),
            "merchant": t.merchant,
            "amount": t.amount,
            "debt_direction": t.debt_direction or "payment",
            "category": t.category,
            "notes": t.notes,
        }
        for t in txns
    ]
