from sqlalchemy import Column, Integer, String, Float, Date, Boolean, UniqueConstraint, DateTime
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    merchant = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    is_fixed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    source = Column(String, nullable=True)  # e.g. "amex", "visa", "mastercard"
    is_recurring = Column(Boolean, default=False)
    linked_debt_id = Column(Integer, nullable=True)   # links to debts.id
    debt_direction = Column(String, nullable=True)    # "payment" or "charge"


class Income(Base):
    __tablename__ = "income"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    person = Column(String, nullable=False)
    income_type = Column(String, nullable=False)  # "base" or "commission"
    amount = Column(Float, nullable=False)
    pay_date = Column(Date, nullable=True)
    rrsp_employee = Column(Float, default=0.0)   # employee RRSP contribution this paycheck
    rrsp_employer = Column(Float, default=0.0)   # employer 50% match
    espp_deduction = Column(Float, default=0.0)  # 10% ESPP deduction

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


class AppSettings(Base):
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    group_name = Column("group", String, nullable=False)   # DB column is "group"
    is_legacy = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)
    parent_name = Column(String, nullable=True)


class InsightsLog(Base):
    __tablename__ = "insights_log"
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    generated_at = Column(DateTime, nullable=False)
    content = Column(String, nullable=False)


class Debt(Base):
    __tablename__ = "debts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)           # "Brookstone (Doors)"
    creditor = Column(String, nullable=False)        # "FinanceIt"
    debt_type = Column(String, default="loan")       # "loan", "loc" (line of credit), or "mortgage"
    credit_limit = Column(Float, default=0.0)        # LOC: maximum credit available
    interest_rate = Column(Float, default=0.0)       # annual rate e.g. 0.0645 for 6.45%
    initial_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    monthly_payment = Column(Float, default=0.0)    # minimum payment
    monthly_extra = Column(Float, default=0.0)      # extra payment on top
    savings = Column(Float, default=0.0)            # amount already set aside
    due_date = Column(String, nullable=True)        # "Feb 2027" free-form
    notes = Column(String, nullable=True)
    linked_asset_id = Column(Integer, nullable=True)  # for mortgage: links to property asset
    initial_date = Column(String, nullable=True)   # "2024-01-01" — when initial_balance was recorded


class Asset(Base):
    """DB-backed net worth assets (replaces localStorage approach)."""
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    asset_type = Column(String, default="other")  # "rrsp", "espp", "tfsa", "cash", "property", "other"
    balance = Column(Float, default=0.0)
    notes = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    auto_sync = Column(Boolean, default=False)  # True = sync balance from payroll contributions
    liquidity = Column(String, default="liquid")  # "liquid" or "illiquid"


class SavingsContribution(Base):
    """Tracks payroll deductions for RRSP and ESPP per pay period."""
    __tablename__ = "savings_contributions"

    id = Column(Integer, primary_key=True, index=True)
    pay_date = Column(String, nullable=False)       # "2025-01-15"
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    gross_income = Column(Float, default=0.0)       # gross pay for this period
    rrsp_employee = Column(Float, default=0.0)      # employee RRSP contribution
    rrsp_employer = Column(Float, default=0.0)      # employer 50% match
    espp_deduction = Column(Float, default=0.0)     # 10% of gross deducted for ESPP
    notes = Column(String, nullable=True)


class EsppPurchase(Base):
    """ESPP purchase events — when accumulated deductions buy stock at a discount."""
    __tablename__ = "espp_purchases"

    id = Column(Integer, primary_key=True, index=True)
    purchase_date = Column(String, nullable=False)
    period_start = Column(String, nullable=True)    # start of accumulation period
    period_end = Column(String, nullable=True)      # end of accumulation period
    total_deducted = Column(Float, default=0.0)     # total $ deducted during period
    shares_purchased = Column(Float, default=0.0)
    purchase_price = Column(Float, default=0.0)     # price paid (after 15% discount)
    market_price = Column(Float, default=0.0)       # fair market value at purchase
    current_price = Column(Float, default=0.0)      # current stock price (manual update)
    notes = Column(String, nullable=True)


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(String, nullable=False)   # "2025-01-31"
    total_assets = Column(Float, default=0.0)
    liquid_assets = Column(Float, default=0.0)
    illiquid_assets = Column(Float, default=0.0)
    total_debts = Column(Float, default=0.0)
    net_worth = Column(Float, default=0.0)
    liquid_net_worth = Column(Float, default=0.0)
    notes = Column(String, nullable=True)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    target_date = Column(String, nullable=True)   # "2026-12-31"
    linked_asset_id = Column(Integer, nullable=True)
    notes = Column(String, nullable=True)


class RecurringBill(Base):
    __tablename__ = "recurring_bills"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    merchant = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    frequency = Column(String, default="monthly")   # "monthly", "annual", "weekly"
    due_day = Column(Integer, nullable=True)        # day of month (1-31)
    category = Column(String, nullable=True)
    last_seen = Column(String, nullable=True)       # "2025-01-15" last transaction date
    is_active = Column(Boolean, default=True)
    notes = Column(String, nullable=True)


class NetWorthMilestone(Base):
    __tablename__ = "net_worth_milestones"
    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)       # "First $100k", "Half a million"
    target_amount = Column(Float, nullable=False)
    achieved_at = Column(String, nullable=True)  # ISO date string when first crossed
    notes = Column(String, nullable=True)


class MerchantRule(Base):
    __tablename__ = "merchant_rules"
    id = Column(Integer, primary_key=True, index=True)
    merchant_pattern = Column(String, nullable=False, unique=True)
    category = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
