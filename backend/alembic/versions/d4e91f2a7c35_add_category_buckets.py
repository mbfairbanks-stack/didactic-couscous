"""Add the bucket column to categories and seed the savings categories.

Buckets are the app's primary lens: fixed costs, short-term savings,
meaningful savings, guilt-free spending. Every existing category keeps its
Needs/Wants/Committed group untouched — the bucket is backfilled from it, so
no data is lost and the mapping stays editable afterwards.

Revision ID: d4e91f2a7c35
Revises: b7d3a9c41e02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd4e91f2a7c35'
down_revision: Union[str, Sequence[str], None] = 'b7d3a9c41e02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Duplicated from buckets.py on purpose: a migration must describe the schema
# as it was at this revision, not follow later edits to application constants.
_GROUP_TO_BUCKET = {
    "Committed": "fixed",
    "Needs": "fixed",
    "Wants": "guilt_free",
    "Other": "guilt_free",
}

_SAVINGS_CATEGORIES = {
    "Short-Term Savings": ("Committed", "short_term"),
    "Emergency Fund": ("Committed", "short_term"),
    "Investment Contribution": ("Committed", "meaningful"),
    "Extra Debt Principal": ("Committed", "meaningful"),
}


def upgrade() -> None:
    # op.execute() takes no bind parameters — go through the connection.
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "categories" not in insp.get_table_names():
        return

    columns = {c["name"] for c in insp.get_columns("categories")}
    if "bucket" not in columns:
        op.execute("ALTER TABLE categories ADD COLUMN bucket TEXT")

    for group, bucket in _GROUP_TO_BUCKET.items():
        bind.execute(
            sa.text('UPDATE categories SET bucket = :b WHERE bucket IS NULL AND "group" = :g'),
            {"b": bucket, "g": group},
        )
    # Anything with an unrecognised group still gets a bucket.
    op.execute("UPDATE categories SET bucket = 'guilt_free' WHERE bucket IS NULL OR bucket = ''")

    for name, (group, bucket) in _SAVINGS_CATEGORIES.items():
        bind.execute(
            sa.text(
                'INSERT OR IGNORE INTO categories (name, "group", is_legacy, is_hidden, bucket) '
                "VALUES (:n, :g, 0, 0, :b)"
            ),
            {"n": name, "g": group, "b": bucket},
        )
        # Existing installs may already have the category without a bucket.
        bind.execute(
            sa.text("UPDATE categories SET bucket = :b WHERE name = :n"),
            {"b": bucket, "n": name},
        )


def downgrade() -> None:
    # SQLite cannot drop a column before 3.35; leaving it in place is harmless.
    pass
