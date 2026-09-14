"""Category integrity: every category string written to a transaction is
registered in the categories table, so the table is complete by construction
and the audit/merge tooling always sees every category in use."""
from sqlalchemy import select

import models
from buckets import default_bucket_for
from categories import CATEGORY_GROUPS


# A blank category would otherwise be stored as "" and surface as a nameless
# bucket line. An uncategorised purchase is presumed discretionary, so it lands
# in guilt-free where it cannot quietly inflate fixed costs.
UNCATEGORIZED = "Uncategorized"


def ensure_category(db, name):
    """Normalize a category name and register it if unknown. Returns the name."""
    name = str(name or "").strip()
    if not name:
        name = UNCATEGORIZED
    exists = db.execute(
        select(models.Category.id).where(models.Category.name == name)
    ).first()
    if not exists:
        group = CATEGORY_GROUPS.get(name, "Wants")
        db.add(models.Category(
            name=name,
            group_name=group,
            is_legacy=False,
            bucket=default_bucket_for(name, group),
        ))
        db.flush()
    return name
