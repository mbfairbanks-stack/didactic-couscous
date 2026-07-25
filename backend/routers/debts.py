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
from debt_math import compute_debt_balance, effective_balance

router = APIRouter()

# ---------------------------------------------------------------------------
# Debts
# ---------------------------------------------------------------------------

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
    effective_balance: Optional[float] = None  # computed when tracked, else current_balance
    is_tracked: bool = False  # True when balance derives from linked transactions
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
            d.computed_balance = compute_debt_balance(
                debt.initial_balance, debt.interest_rate, debt.initial_date, linked_txns
            )
            if d.computed_balance is not None and debt.debt_type == "mortgage" and debt.linked_asset_id:
                asset = db.get(models.Asset, debt.linked_asset_id)
                if asset:
                    d.equity = asset.balance - d.computed_balance
        d.is_tracked = bool(debt.initial_date) and d.computed_balance is not None
        d.effective_balance = d.computed_balance if d.is_tracked else debt.current_balance
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
