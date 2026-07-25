"""Shared debt-balance math.

A debt with an initial_date is "tracked": its balance is derived from
initial_balance + monthly interest + linked transactions, and that derived
figure is the effective balance everywhere (net worth, retirement, insights).
Debts without an initial_date use the manually-maintained current_balance.
"""
import datetime
from typing import Optional

from sqlalchemy import select

import models


def compute_debt_balance(
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


def effective_balance(debt, db) -> float:
    """Computed balance for tracked debts; manual current_balance otherwise."""
    if debt.initial_date:
        linked = db.execute(
            select(models.Transaction).where(models.Transaction.linked_debt_id == debt.id)
        ).scalars().all()
        computed = compute_debt_balance(
            debt.initial_balance, debt.interest_rate, debt.initial_date, linked
        )
        if computed is not None:
            return computed
    return debt.current_balance or 0.0
