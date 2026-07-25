"""Income records (payroll entries per person/month)."""
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


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

@router.get("/income", response_model=list[IncomeOut])
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


@router.post("/income", response_model=IncomeOut, status_code=201)
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
    try:
        db.add(income)
        db.commit()
        db.refresh(income)
        return income
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate entry — record already exists")


@router.put("/income/{income_id}", response_model=IncomeOut)
def update_income(income_id: int, body: IncomeCreate, db: Session = Depends(get_db)):
    income = db.get(models.Income, income_id)
    if not income:
        raise HTTPException(404, "Income record not found")
    for field, val in body.model_dump().items():
        setattr(income, field, val)
    db.commit()
    db.refresh(income)
    return income


@router.delete("/income/{income_id}", status_code=204)
def delete_income(income_id: int, db: Session = Depends(get_db)):
    income = db.get(models.Income, income_id)
    if not income:
        raise HTTPException(404, "Income record not found")
    db.delete(income)
    db.commit()
