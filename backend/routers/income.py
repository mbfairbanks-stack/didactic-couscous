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
    amount: float                          # gross for this entry
    net_amount: Optional[float] = None     # take-home deposited, from the stub
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
        for field, val in body.model_dump().items():
            setattr(existing, field, val)
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


# ---------------------------------------------------------------------------
# Pay schedules — recurring pay, used to project months not yet entered
# ---------------------------------------------------------------------------

FREQUENCIES = {"weekly", "biweekly", "semimonthly", "monthly"}


class PayScheduleBody(BaseModel):
    person: str
    gross_per_pay: float = 0.0
    net_per_pay: float = 0.0
    frequency: str = "biweekly"
    anchor_date: Optional[str] = None
    rrsp_employee_per_pay: float = 0.0
    rrsp_employer_per_pay: float = 0.0
    espp_per_pay: float = 0.0
    is_active: bool = True
    notes: Optional[str] = None


def _schedule_out(s: models.PaySchedule) -> dict:
    return {
        "id": s.id,
        "person": s.person,
        "gross_per_pay": s.gross_per_pay,
        "net_per_pay": s.net_per_pay,
        "frequency": s.frequency,
        "anchor_date": s.anchor_date,
        "rrsp_employee_per_pay": s.rrsp_employee_per_pay,
        "rrsp_employer_per_pay": s.rrsp_employer_per_pay,
        "espp_per_pay": s.espp_per_pay,
        "is_active": bool(s.is_active),
        "notes": s.notes,
    }


@router.get("/pay-schedules")
def list_pay_schedules(db: Session = Depends(get_db)):
    rows = db.execute(select(models.PaySchedule).order_by(models.PaySchedule.person)).scalars().all()
    return [_schedule_out(r) for r in rows]


@router.put("/pay-schedules")
def upsert_pay_schedule(body: PayScheduleBody, db: Session = Depends(get_db)):
    """One schedule per person — saving again replaces it."""
    if body.frequency not in FREQUENCIES:
        raise HTTPException(400, f"Unknown frequency '{body.frequency}'")
    if body.anchor_date:
        try:
            datetime.date.fromisoformat(body.anchor_date[:10])
        except ValueError:
            raise HTTPException(400, "anchor_date must be YYYY-MM-DD")
    existing = db.execute(
        select(models.PaySchedule).where(models.PaySchedule.person == body.person)
    ).scalar_one_or_none()
    if existing:
        for field, val in body.model_dump().items():
            setattr(existing, field, val)
        row = existing
    else:
        row = models.PaySchedule(**body.model_dump())
        db.add(row)
    db.commit()
    db.refresh(row)
    return _schedule_out(row)


@router.delete("/pay-schedules/{schedule_id}", status_code=204)
def delete_pay_schedule(schedule_id: int, db: Session = Depends(get_db)):
    row = db.get(models.PaySchedule, schedule_id)
    if not row:
        raise HTTPException(404, "Pay schedule not found")
    db.delete(row)
    db.commit()


@router.get("/income/projection")
def income_projection(year: int, month: Optional[int] = None, db: Session = Depends(get_db)):
    """Projected gross and net for a month (or the whole year), per person."""
    import pay_projection

    if month:
        m = pay_projection.project_month(db, year, month)
        return {
            "year": year,
            "month": month,
            "gross": m.total("gross"),
            "net": m.total("net"),
            "payroll_rrsp_employee": m.total("rrsp_employee"),
            "payroll_rrsp_employer": m.total("rrsp_employer"),
            "payroll_espp": m.total("espp"),
            "estimated": m.any_estimated,
            "people": [
                {
                    "person": p.person, "gross": round(p.gross, 2), "net": round(p.net, 2),
                    "recorded_pays": p.recorded_pays, "expected_pays": p.expected_pays,
                    "source": p.source,
                }
                for p in m.people.values()
            ],
        }
    return pay_projection.summarize(db, year, 1, 12)
