"""Retirement planning: profiles, RSU grants, retention bonuses, goals, summary."""
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
from debt_math import effective_balance

router = APIRouter()

# ---------------------------------------------------------------------------
# Retirement module
# ---------------------------------------------------------------------------

class RetirementProfileCreate(BaseModel):
    year: int
    marginal_rate: float = 0.0
    rrsp_room: float = 0.0
    tfsa_room: float = 0.0
    current_age: Optional[int] = None
    target_retirement_age: int = 60
    target_annual_income: float = 0.0
    expected_return: float = 0.075
    expected_inflation: float = 0.025
    cpp_monthly: float = 0.0
    oas_monthly: float = 0.0
    cpp_start_age: int = 65
    swr: float = 0.035
    notes: Optional[str] = None


class RetirementProfileOut(RetirementProfileCreate):
    id: int
    model_config = {"from_attributes": True}


class RsuGrantCreate(BaseModel):
    name: str
    grant_date: Optional[str] = None
    ticker: Optional[str] = None
    total_units: float = 0.0
    unvested_units: float = 0.0
    current_price: float = 0.0
    vest_schedule_json: Optional[str] = None
    notes: Optional[str] = None


class RsuGrantOut(RsuGrantCreate):
    id: int
    model_config = {"from_attributes": True}


class RetentionBonusCreate(BaseModel):
    name: str
    gross_amount: float = 0.0
    vest_date: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None


class RetentionBonusOut(RetentionBonusCreate):
    id: int
    model_config = {"from_attributes": True}


class RetirementGoalCreate(BaseModel):
    label: str
    target_amount: float
    target_year: Optional[int] = None
    notes: Optional[str] = None


class RetirementGoalOut(RetirementGoalCreate):
    id: int
    model_config = {"from_attributes": True}


@router.get("/retirement/profiles", response_model=list[RetirementProfileOut])
def list_retirement_profiles(db: Session = Depends(get_db)):
    return db.execute(
        select(models.RetirementProfile).order_by(models.RetirementProfile.year.desc())
    ).scalars().all()


@router.post("/retirement/profiles", response_model=RetirementProfileOut, status_code=201)
def upsert_retirement_profile(body: RetirementProfileCreate, db: Session = Depends(get_db)):
    existing = db.execute(
        select(models.RetirementProfile).where(models.RetirementProfile.year == body.year)
    ).scalar_one_or_none()
    if existing:
        for field, val in body.model_dump().items():
            setattr(existing, field, val)
        db.commit()
        db.refresh(existing)
        return existing
    profile = models.RetirementProfile(**body.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.put("/retirement/profiles/{profile_id}", response_model=RetirementProfileOut)
def update_retirement_profile(profile_id: int, body: RetirementProfileCreate, db: Session = Depends(get_db)):
    profile = db.get(models.RetirementProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    for field, val in body.model_dump().items():
        setattr(profile, field, val)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/retirement/profiles/{profile_id}", status_code=204)
def delete_retirement_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(models.RetirementProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    db.delete(profile)
    db.commit()


@router.get("/retirement/rsu-grants", response_model=list[RsuGrantOut])
def list_rsu_grants(db: Session = Depends(get_db)):
    return db.execute(
        select(models.RsuGrant).order_by(models.RsuGrant.grant_date.desc())
    ).scalars().all()


@router.post("/retirement/rsu-grants", response_model=RsuGrantOut, status_code=201)
def create_rsu_grant(body: RsuGrantCreate, db: Session = Depends(get_db)):
    grant = models.RsuGrant(**body.model_dump())
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return grant


@router.put("/retirement/rsu-grants/{grant_id}", response_model=RsuGrantOut)
def update_rsu_grant(grant_id: int, body: RsuGrantCreate, db: Session = Depends(get_db)):
    grant = db.get(models.RsuGrant, grant_id)
    if not grant:
        raise HTTPException(404, "Grant not found")
    for field, val in body.model_dump().items():
        setattr(grant, field, val)
    db.commit()
    db.refresh(grant)
    return grant


@router.delete("/retirement/rsu-grants/{grant_id}", status_code=204)
def delete_rsu_grant(grant_id: int, db: Session = Depends(get_db)):
    grant = db.get(models.RsuGrant, grant_id)
    if not grant:
        raise HTTPException(404, "Grant not found")
    db.delete(grant)
    db.commit()


@router.get("/retirement/retention-bonuses", response_model=list[RetentionBonusOut])
def list_retention_bonuses(db: Session = Depends(get_db)):
    return db.execute(
        select(models.RetentionBonus).order_by(models.RetentionBonus.vest_date.desc())
    ).scalars().all()


@router.post("/retirement/retention-bonuses", response_model=RetentionBonusOut, status_code=201)
def create_retention_bonus(body: RetentionBonusCreate, db: Session = Depends(get_db)):
    bonus = models.RetentionBonus(**body.model_dump())
    db.add(bonus)
    db.commit()
    db.refresh(bonus)
    return bonus


@router.put("/retirement/retention-bonuses/{bonus_id}", response_model=RetentionBonusOut)
def update_retention_bonus(bonus_id: int, body: RetentionBonusCreate, db: Session = Depends(get_db)):
    bonus = db.get(models.RetentionBonus, bonus_id)
    if not bonus:
        raise HTTPException(404, "Bonus not found")
    for field, val in body.model_dump().items():
        setattr(bonus, field, val)
    db.commit()
    db.refresh(bonus)
    return bonus


@router.delete("/retirement/retention-bonuses/{bonus_id}", status_code=204)
def delete_retention_bonus(bonus_id: int, db: Session = Depends(get_db)):
    bonus = db.get(models.RetentionBonus, bonus_id)
    if not bonus:
        raise HTTPException(404, "Bonus not found")
    db.delete(bonus)
    db.commit()


@router.get("/retirement/goals", response_model=list[RetirementGoalOut])
def list_retirement_goals(db: Session = Depends(get_db)):
    return db.execute(
        select(models.RetirementGoal).order_by(models.RetirementGoal.target_amount)
    ).scalars().all()


@router.post("/retirement/goals", response_model=RetirementGoalOut, status_code=201)
def create_retirement_goal(body: RetirementGoalCreate, db: Session = Depends(get_db)):
    goal = models.RetirementGoal(**body.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/retirement/goals/{goal_id}", response_model=RetirementGoalOut)
def update_retirement_goal(goal_id: int, body: RetirementGoalCreate, db: Session = Depends(get_db)):
    goal = db.get(models.RetirementGoal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    for field, val in body.model_dump().items():
        setattr(goal, field, val)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/retirement/goals/{goal_id}", status_code=204)
def delete_retirement_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(models.RetirementGoal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()


@router.get("/retirement/summary")
def retirement_summary(db: Session = Depends(get_db)):
    """Compute retirement readiness metrics from live DB data."""

    today = datetime.date.today()

    # Latest profile
    profile = db.execute(
        select(models.RetirementProfile).order_by(models.RetirementProfile.year.desc())
    ).scalar_one_or_none()

    # Investable assets: exclude property (house stays; assumed paid off at retirement)
    investable_assets_raw = db.execute(
        select(func.sum(models.Asset.balance))
        .where(models.Asset.asset_type != "property")
    ).scalar() or 0

    # Subtract non-mortgage debts from investable pool
    non_mortgage = db.execute(
        select(models.Debt).where(models.Debt.debt_type != "mortgage")
    ).scalars().all()
    total_debts = sum(effective_balance(d, db) for d in non_mortgage)

    total_assets = db.execute(select(func.sum(models.Asset.balance))).scalar() or 0
    investable_assets = max(investable_assets_raw - total_debts, 0)

    # ── Payroll savings: actual RRSP + ESPP from income records ──────────────
    # All-time per-month rows for averaging
    payroll_rows = db.execute(
        select(
            models.Income.year,
            models.Income.month,
            func.sum(models.Income.rrsp_employee + models.Income.rrsp_employer).label("rrsp"),
            func.sum(models.Income.espp_deduction).label("espp"),
        )
        .group_by(models.Income.year, models.Income.month)
        .order_by(models.Income.year, models.Income.month)
    ).all()

    # Only use months that had at least some savings activity for the average
    active_months = [r for r in payroll_rows if (r.rrsp or 0) > 0 or (r.espp or 0) > 0]
    payroll_monthly_rrsp = (sum(r.rrsp or 0 for r in active_months) / len(active_months)) if active_months else 0
    payroll_monthly_espp = (sum(r.espp or 0 for r in active_months) / len(active_months)) if active_months else 0

    # YTD actuals for current year
    ytd_rows = db.execute(
        select(
            func.sum(models.Income.rrsp_employee).label("rrsp_emp"),
            func.sum(models.Income.rrsp_employer).label("rrsp_er"),
            func.sum(models.Income.espp_deduction).label("espp"),
        )
        .where(models.Income.year == today.year)
    ).one()
    ytd_rrsp_employee = ytd_rows.rrsp_emp or 0
    ytd_rrsp_employer = ytd_rows.rrsp_er or 0
    ytd_espp = ytd_rows.espp or 0

    # ── Monthly surplus (extra beyond payroll savings) ────────────────────────
    cutoff_year = today.year - 1 if today.month <= 6 else today.year
    income_by_month = db.execute(
        select(models.Income.year, models.Income.month, func.sum(models.Income.amount).label("total"))
        .where(models.Income.year >= cutoff_year)
        .group_by(models.Income.year, models.Income.month)
    ).all()
    expense_by_month = db.execute(
        select(models.Transaction.year, models.Transaction.month, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year >= cutoff_year)
        .group_by(models.Transaction.year, models.Transaction.month)
    ).all()
    avg_monthly_income = (sum(r.total for r in income_by_month) / len(income_by_month)) if income_by_month else 0
    avg_monthly_expenses = (sum(r.total for r in expense_by_month) / len(expense_by_month)) if expense_by_month else 0
    monthly_surplus = max(avg_monthly_income - avg_monthly_expenses, 0)

    # ── Upcoming vest events (RSUs + unpaid bonuses, next 12 months) ─────────
    upcoming_cutoff = (today + datetime.timedelta(days=365)).isoformat()
    rsu_grants = db.execute(select(models.RsuGrant)).scalars().all()
    upcoming_bonuses = db.execute(
        select(models.RetentionBonus)
        .where(models.RetentionBonus.is_paid == False)  # noqa: E712
        .where(models.RetentionBonus.vest_date != None)  # noqa: E711
        .where(models.RetentionBonus.vest_date <= upcoming_cutoff)
    ).scalars().all()

    upcoming_vests = []
    for g in rsu_grants:
        if g.vest_schedule_json:
            try:
                schedule = json.loads(g.vest_schedule_json)
                for event in schedule:
                    if event.get("date") and today.isoformat() <= event["date"] <= upcoming_cutoff:
                        upcoming_vests.append({
                            "type": "rsu",
                            "name": g.name,
                            "date": event["date"],
                            "units": event.get("units", 0),
                            "value": round(event.get("units", 0) * (g.current_price or 0), 2),
                        })
            except (json.JSONDecodeError, TypeError):
                pass
    for b in upcoming_bonuses:
        upcoming_vests.append({
            "type": "bonus",
            "name": b.name,
            "date": b.vest_date,
            "gross_amount": b.gross_amount,
        })
    upcoming_vests.sort(key=lambda x: x["date"])

    result = {
        "total_assets": round(total_assets, 2),
        "total_debts": round(total_debts, 2),
        "investable_assets": round(investable_assets, 2),
        "avg_monthly_income": round(avg_monthly_income, 2),
        "avg_monthly_expenses": round(avg_monthly_expenses, 2),
        "monthly_surplus": round(monthly_surplus, 2),
        # Payroll savings — sourced from income records
        "payroll_monthly_rrsp": round(payroll_monthly_rrsp, 2),
        "payroll_monthly_espp": round(payroll_monthly_espp, 2),
        "payroll_monthly_total": round(payroll_monthly_rrsp + payroll_monthly_espp, 2),
        "ytd_rrsp_employee": round(ytd_rrsp_employee, 2),
        "ytd_rrsp_employer": round(ytd_rrsp_employer, 2),
        "ytd_rrsp_total": round(ytd_rrsp_employee + ytd_rrsp_employer, 2),
        "ytd_espp": round(ytd_espp, 2),
        "upcoming_vests": upcoming_vests,
        "profile": None,
    }

    if profile:
        years_to_retirement = max((profile.target_retirement_age or 60) - (profile.current_age or 40), 0)
        r_nominal = profile.expected_return or 0.075
        inflation = profile.expected_inflation or 0.025
        r_real = (1 + r_nominal) / (1 + inflation) - 1
        swr = profile.swr or 0.035
        retire_age = profile.target_retirement_age or 60
        cpp_start_age = profile.cpp_start_age or 65
        gross_spending = profile.target_annual_income or 0

        # CPP adjustment for early/late take-up
        if cpp_start_age < 65:
            cpp_factor = 1 - 0.006 * (65 - cpp_start_age) * 12
        elif cpp_start_age > 65:
            cpp_factor = 1 + 0.007 * (cpp_start_age - 65) * 12
        else:
            cpp_factor = 1.0
        cpp_adjusted = (profile.cpp_monthly or 0) * 12 * cpp_factor
        oas_annual = (profile.oas_monthly or 0) * 12
        govt_annual = cpp_adjusted + oas_annual

        # Two-phase target in real (today's) dollars
        if retire_age >= 65:
            net_needed = max(gross_spending - govt_annual, 0)
            required_portfolio = net_needed / swr if swr > 0 else 0
        else:
            bridge_years = 65 - retire_age
            if r_real > 0.001:
                bridge_capital = gross_spending * (1 - (1 + r_real) ** -bridge_years) / r_real
            else:
                bridge_capital = gross_spending * bridge_years
            net_steady = max(gross_spending - govt_annual, 0)
            capital_at_65 = net_steady / swr if swr > 0 else 0
            capital_at_65_disc = capital_at_65 / (1 + r_real) ** bridge_years
            required_portfolio = bridge_capital + capital_at_65_disc

        tax_savings_monthly = payroll_monthly_rrsp * (profile.marginal_rate or 0)

        result["profile"] = {
            "id": profile.id,
            "year": profile.year,
            "marginal_rate": profile.marginal_rate,
            "rrsp_room": profile.rrsp_room,
            "tfsa_room": profile.tfsa_room,
            "current_age": profile.current_age,
            "target_retirement_age": profile.target_retirement_age,
            "target_annual_income": profile.target_annual_income,
            "expected_return": profile.expected_return,
            "expected_inflation": profile.expected_inflation,
            "cpp_monthly": profile.cpp_monthly,
            "oas_monthly": profile.oas_monthly,
            "cpp_start_age": cpp_start_age,
            "cpp_adjustment_factor": round(cpp_factor, 4),
            "swr": swr,
            "years_to_retirement": years_to_retirement,
            "required_portfolio": round(required_portfolio, 2),
            "govt_annual_income": round(govt_annual, 2),
            "cpp_annual_adjusted": round(cpp_adjusted, 2),
            "tax_savings_monthly": round(tax_savings_monthly, 2),
        }

    return result
