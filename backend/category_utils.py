"""Category integrity: every category string written to a transaction is
registered in the categories table, so the table is complete by construction
and the audit/merge tooling always sees every category in use."""
from sqlalchemy import select

import models
from categories import CATEGORY_GROUPS


def ensure_category(db, name):
    """Normalize a category name and register it if unknown. Returns the name."""
    if not name:
        return name
    name = str(name).strip()
    if not name:
        return name
    exists = db.execute(
        select(models.Category.id).where(models.Category.name == name)
    ).first()
    if not exists:
        db.add(models.Category(
            name=name,
            group_name=CATEGORY_GROUPS.get(name, "Wants"),
            is_legacy=False,
        ))
        db.flush()
    return name
