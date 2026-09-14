"""Composite (year, month) index on transactions.

Nearly every read filters on year AND month together, but the table only had
separate single-column indexes and SQLite can use one per table scan. At the
current data size this changes nothing measurable — it is insurance against
years of accumulated history, not a fix for a present problem.

Revision ID: e83f7d1c4b96
Revises: a71c3b8e5d20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e83f7d1c4b96'
down_revision: Union[str, Sequence[str], None] = 'a71c3b8e5d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "transactions" not in insp.get_table_names():
        return
    existing = {i["name"] for i in insp.get_indexes("transactions")}
    if "ix_transactions_year_month" not in existing:
        op.execute(
            "CREATE INDEX ix_transactions_year_month ON transactions (year, month)"
        )
    if "income" in insp.get_table_names():
        income_ix = {i["name"] for i in insp.get_indexes("income")}
        if "ix_income_year_month" not in income_ix:
            op.execute("CREATE INDEX ix_income_year_month ON income (year, month)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transactions_year_month")
    op.execute("DROP INDEX IF EXISTS ix_income_year_month")
