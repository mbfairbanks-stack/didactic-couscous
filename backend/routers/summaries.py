"""Aggregate summaries: monthly, categories, totals, daily, trends, projections, forecast, tax."""
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
# Summary / Analytics
# ---------------------------------------------------------------------------

@router.get("/summary/monthly")
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


@router.get("/summary/categories")
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


@router.get("/summary/totals")
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


@router.get("/summary/daily")
def daily_summary(year: int, month: Optional[int] = None, db: Session = Depends(get_db)):
    """Returns spending totals grouped by date for a given year/month."""
    q = (
        select(models.Transaction.date, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .where(models.Transaction.amount > 0)
    )
    if month:
        q = q.where(models.Transaction.month == month)
    q = q.group_by(models.Transaction.date).order_by(models.Transaction.date)
    rows = db.execute(q).all()
    return [{"date": r.date, "total": round(r.total, 2)} for r in rows]


@router.get("/summary/category-trend")
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


@router.get("/summary/projections")
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


@router.get("/summary/forecast")
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


@router.get("/summary/multi-category-trend")
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


# ── Tax Summary ─────────────────────────────────────────────────────────────

@router.get("/tax-summary")
def get_tax_summary(year: int, db: Session = Depends(get_db)):
    """Canadian year-end tax summary: income by person, RRSP, ESPP, donations."""
    income_rows = db.execute(
        select(models.Income).where(models.Income.year == year)
    ).scalars().all()

    # Group income by person
    by_person: dict = {}
    for row in income_rows:
        p = row.person
        if p not in by_person:
            by_person[p] = {
                "gross_income": 0.0,
                "rrsp_employee": 0.0,
                "rrsp_employer": 0.0,
                "espp_deduction": 0.0,
                "other_income": 0.0,
            }
        if row.income_type in ("base", "commission"):
            by_person[p]["gross_income"] += row.amount
            by_person[p]["rrsp_employee"] += row.rrsp_employee or 0.0
            by_person[p]["rrsp_employer"] += row.rrsp_employer or 0.0
            by_person[p]["espp_deduction"] += row.espp_deduction or 0.0
        else:
            by_person[p]["other_income"] += row.amount

    # Charitable donations from transactions
    donation_rows = db.execute(
        select(models.Transaction).where(
            models.Transaction.year == year,
            models.Transaction.category == "Charitable Donations",
        )
    ).scalars().all()
    total_donations = sum(t.amount for t in donation_rows)

    # ESPP purchases for the year
    espp_purchases = db.execute(
        select(models.EsppPurchase).where(
            models.EsppPurchase.purchase_date.like(f"{year}%")
        )
    ).scalars().all()
    espp_summary = [
        {
            "purchase_date": e.purchase_date,
            "total_deducted": e.total_deducted,
            "shares_purchased": e.shares_purchased,
            "purchase_price": e.purchase_price,
            "market_price": e.market_price,
            "discount_benefit": round((e.market_price - e.purchase_price) * e.shares_purchased, 2) if e.shares_purchased else 0.0,
        }
        for e in espp_purchases
    ]

    return {
        "year": year,
        "by_person": by_person,
        "total_donations": total_donations,
        "espp_purchases": espp_summary,
        "total_rrsp_employee": sum(p["rrsp_employee"] for p in by_person.values()),
        "total_rrsp_employer": sum(p["rrsp_employer"] for p in by_person.values()),
        "total_espp_deduction": sum(p["espp_deduction"] for p in by_person.values()),
    }
