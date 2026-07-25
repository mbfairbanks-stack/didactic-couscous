"""Consolidate legacy runtime schema patches into a real migration.

Replaces the ad-hoc ALTER TABLE patching that database._init_db_extras used
to run on every engine start. Every step checks current state first, so this
runs safely against any vintage of database: fresh (create_all already made
everything — all steps no-op), previously patched (no-op), or ancient
(columns get added here).

Revision ID: b7d3a9c41e02
Revises: fc124668f054
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7d3a9c41e02'
down_revision: Union[str, Sequence[str], None] = 'fc124668f054'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()
    existing = {t: {c["name"] for c in insp.get_columns(t)} for t in tables}

    def add_col(table: str, name: str, ddl: str) -> None:
        if table in existing and name not in existing[table]:
            op.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

    if "app_settings" not in tables:
        op.execute(sa.text(
            "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        ))

    if "categories" not in tables:
        op.execute(sa.text(
            'CREATE TABLE categories ('
            ' id INTEGER PRIMARY KEY AUTOINCREMENT,'
            ' name TEXT NOT NULL UNIQUE,'
            ' "group" TEXT NOT NULL,'
            ' is_legacy INTEGER NOT NULL DEFAULT 0,'
            ' is_hidden INTEGER NOT NULL DEFAULT 0,'
            ' parent_name TEXT)'
        ))
    else:
        add_col("categories", "is_hidden", "is_hidden INTEGER NOT NULL DEFAULT 0")
        add_col("categories", "parent_name", "parent_name TEXT")

    add_col("transactions", "is_recurring", "is_recurring INTEGER NOT NULL DEFAULT 0")
    add_col("transactions", "linked_debt_id", "linked_debt_id INTEGER")
    add_col("transactions", "debt_direction", "debt_direction TEXT")
    if "transactions" in tables:
        op.execute(sa.text("UPDATE transactions SET is_recurring = 0 WHERE is_recurring IS NULL"))
        op.execute(sa.text("UPDATE transactions SET is_fixed = 0 WHERE is_fixed IS NULL"))
        op.execute(sa.text("""
            UPDATE transactions
            SET year  = CAST(strftime('%Y', date) AS INTEGER),
                month = CAST(strftime('%m', date) AS INTEGER)
            WHERE year  != CAST(strftime('%Y', date) AS INTEGER)
               OR month != CAST(strftime('%m', date) AS INTEGER)
        """))

    add_col("income", "pay_date", "pay_date DATE")
    add_col("income", "rrsp_employee", "rrsp_employee REAL NOT NULL DEFAULT 0")
    add_col("income", "rrsp_employer", "rrsp_employer REAL NOT NULL DEFAULT 0")
    add_col("income", "espp_deduction", "espp_deduction REAL NOT NULL DEFAULT 0")

    add_col("assets", "auto_sync", "auto_sync INTEGER NOT NULL DEFAULT 0")
    add_col("assets", "liquidity", "liquidity TEXT NOT NULL DEFAULT 'liquid'")

    add_col("insights_log", "start_month", "start_month INTEGER")
    add_col("insights_log", "end_month", "end_month INTEGER")

    add_col("retirement_profiles", "cpp_start_age", "cpp_start_age INTEGER NOT NULL DEFAULT 65")
    add_col("retirement_profiles", "swr", "swr REAL NOT NULL DEFAULT 0.035")

    add_col("espp_purchases", "allocation_json", "allocation_json TEXT")

    add_col("debts", "debt_type", "debt_type TEXT NOT NULL DEFAULT 'loan'")
    add_col("debts", "credit_limit", "credit_limit REAL NOT NULL DEFAULT 0")
    add_col("debts", "interest_rate", "interest_rate REAL NOT NULL DEFAULT 0")
    add_col("debts", "linked_asset_id", "linked_asset_id INTEGER")
    add_col("debts", "initial_date", "initial_date TEXT")


def downgrade() -> None:
    """Irreversible consolidation of historical patches — nothing to undo."""
    pass
