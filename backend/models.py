from sqlalchemy import Column, Integer, String, Float, Date, Boolean, UniqueConstraint
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    merchant = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    is_fixed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    source = Column(String, nullable=True)  # e.g. "amex", "visa", "mastercard"
    is_recurring = Column(Boolean, default=False)


class Income(Base):
    __tablename__ = "income"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    person = Column(String, nullable=False)  # "Matt" or "Nicole"
    income_type = Column(String, nullable=False)  # "base" or "commission"
    amount = Column(Float, nullable=False)
    pay_date = Column(Date, nullable=True)  # specific payday date

    __table_args__ = (
        UniqueConstraint("year", "month", "person", "income_type", "pay_date", name="uq_income"),
    )


class BudgetTarget(Base):
    __tablename__ = "budget_targets"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=True)  # NULL = default for all months
    amount = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("category", "year", "month", name="uq_budget_target"),
    )


class Debt(Base):
    __tablename__ = "debts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)           # "Brookstone (Doors)"
    creditor = Column(String, nullable=False)        # "FinanceIt"
    initial_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    monthly_payment = Column(Float, default=0.0)    # minimum payment
    monthly_extra = Column(Float, default=0.0)      # extra payment on top
    savings = Column(Float, default=0.0)            # amount already set aside
    due_date = Column(String, nullable=True)        # "Feb 2027" free-form
    notes = Column(String, nullable=True)
