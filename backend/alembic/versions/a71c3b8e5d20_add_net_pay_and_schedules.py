"""Record take-home pay and recurring pay schedules.

income.amount has always been GROSS (base + commission — the ESPP rate on the
income page is computed as a percentage of it). Nothing captured what actually
landed in the bank, so the bucket plan had no honest base to work from. This
adds net_amount per pay entry, plus a per-person pay schedule used to project
months that have not been entered yet.

Revision ID: a71c3b8e5d20
Revises: d4e91f2a7c35
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a71c3b8e5d20'
down_revision: Union[str, Sequence[str], None] = 'd4e91f2a7c35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "income" in tables:
        cols = {c["name"] for c in insp.get_columns("income")}
        if "net_amount" not in cols:
            # Left NULL on purpose: an unknown take-home must read as unknown
            # rather than as zero, so the projection can fill it in instead.
            op.execute("ALTER TABLE income ADD COLUMN net_amount FLOAT")

    if "pay_schedules" not in tables:
        op.execute(
            "CREATE TABLE pay_schedules ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " person TEXT NOT NULL UNIQUE,"
            " gross_per_pay FLOAT DEFAULT 0.0,"
            " net_per_pay FLOAT DEFAULT 0.0,"
            " frequency TEXT DEFAULT 'biweekly',"
            " anchor_date TEXT,"
            " rrsp_employee_per_pay FLOAT DEFAULT 0.0,"
            " rrsp_employer_per_pay FLOAT DEFAULT 0.0,"
            " espp_per_pay FLOAT DEFAULT 0.0,"
            " is_active INTEGER NOT NULL DEFAULT 1,"
            " notes TEXT)"
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS pay_schedules")
    # SQLite cannot drop a column before 3.35; leaving net_amount is harmless.
