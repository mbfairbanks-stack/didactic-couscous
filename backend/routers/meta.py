"""App settings, category definitions, onboarding, years, cleanup/dedupe/migration tools."""
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

@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    rows = db.execute(select(models.AppSettings)).scalars().all()
    return {r.key: r.value for r in rows}


@router.put("/settings")
def update_settings(body: dict, db: Session = Depends(get_db)):
    for key, value in body.items():
        existing = db.get(models.AppSettings, key)
        if existing:
            existing.value = str(value)
        else:
            db.add(models.AppSettings(key=key, value=str(value)))
    db.commit()
    return {"ok": True}


@router.get("/category-definitions")
def list_category_definitions(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Category).order_by(models.Category.group_name, models.Category.name)).scalars().all()
    return [{"id": r.id, "name": r.name, "group": r.group_name, "is_legacy": bool(r.is_legacy),
             "is_hidden": bool(r.is_hidden), "parent_name": r.parent_name} for r in rows]


class CategoryCreate(BaseModel):
    name: str
    group: str
    parent_name: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    group: Optional[str] = None
    is_hidden: Optional[bool] = None
    parent_name: Optional[str] = None


@router.post("/category-definitions", status_code=201)
def create_category_definition(body: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.execute(select(models.Category).where(models.Category.name == body.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{body.name}' already exists")
    cat = models.Category(name=body.name, group_name=body.group, is_legacy=False, parent_name=body.parent_name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "group": cat.group_name, "is_legacy": False,
            "is_hidden": False, "parent_name": cat.parent_name}


@router.put("/category-definitions/{cat_id}")
def update_category_definition(cat_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.group is not None:
        cat.group_name = body.group
    if body.is_hidden is not None:
        cat.is_hidden = body.is_hidden
    if body.parent_name is not None:
        cat.parent_name = body.parent_name
    elif "parent_name" in body.model_fields_set:
        cat.parent_name = None  # explicitly clearing it
    db.commit()
    return {"id": cat.id, "name": cat.name, "group": cat.group_name, "is_legacy": bool(cat.is_legacy),
            "is_hidden": bool(cat.is_hidden), "parent_name": cat.parent_name}


@router.delete("/category-definitions/{cat_id}", status_code=204)
def delete_category_definition(cat_id: int, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    count = db.execute(
        select(func.count()).where(models.Transaction.category == cat.name)
    ).scalar()
    if count > 0:
        raise HTTPException(status_code=409, detail=f"Cannot delete: {count} transaction(s) use this category")
    db.delete(cat)
    db.commit()


class CategoryMerge(BaseModel):
    source_names: list[str]
    target_name: str


@router.post("/category-definitions/merge")
def merge_categories(body: CategoryMerge, db: Session = Depends(get_db)):
    """Reassign all transactions from source categories to target, then hide sources."""
    # Validate target category exists
    target_exists = db.execute(
        select(models.Category).where(models.Category.name == body.target_name)
    ).scalar_one_or_none()
    if not target_exists:
        raise HTTPException(404, f"Target category '{body.target_name}' does not exist")
    updated = 0
    for name in body.source_names:
        result = db.execute(
            text("UPDATE transactions SET category = :target WHERE category = :source"),
            {"target": body.target_name, "source": name},
        )
        updated += result.rowcount
        # Hide the source category
        src = db.execute(select(models.Category).where(models.Category.name == name)).scalar_one_or_none()
        if src:
            src.is_hidden = True
    db.commit()
    return {"merged_transactions": updated, "hidden": body.source_names}


@router.get("/onboarding-status")
def onboarding_status(db: Session = Depends(get_db)):
    setting = db.get(models.AppSettings, "onboarding_complete")
    has_transactions = db.execute(select(func.count()).select_from(models.Transaction)).scalar() > 0
    p1 = db.get(models.AppSettings, "person_1")
    p2 = db.get(models.AppSettings, "person_2")
    has_people = (p1 and p1.value not in ("Person 1", "")) or (p2 and p2.value not in ("Person 2", ""))
    needs_onboarding = not (setting and setting.value == "true")
    return {
        "needs_onboarding": needs_onboarding,
        "has_transactions": has_transactions,
        "has_people_configured": has_people,
    }


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    # Categories from the definitions table (user-managed, excludes hidden)
    defined = db.execute(
        select(models.Category.name)
        .where(models.Category.is_hidden == False)  # noqa: E712
        .order_by(models.Category.name)
    ).scalars().all()
    defined_set = set(defined)

    # Any categories already on transactions that aren't in the definitions table
    tx_only = db.execute(
        select(distinct(models.Transaction.category))
        .where(models.Transaction.category != None)  # noqa: E711
        .where(models.Transaction.category != "")
    ).scalars().all()
    extra = [c for c in tx_only if c not in defined_set]

    return sorted(defined + extra)


@router.get("/years")
def list_years(db: Session = Depends(get_db)):
    rows = db.execute(
        select(distinct(models.Transaction.year)).order_by(models.Transaction.year)
    ).scalars().all()
    return rows


# ---------------------------------------------------------------------------
# Deduplicate
# ---------------------------------------------------------------------------

BANK_ONLY_CATEGORIES = {
    "Mortgage", "Gas (Utility)", "Hydro",
    "Municipal Taxes", "Debt Payment", "Insurance", "Reliance",
}

@router.post("/cleanup-summary")
def cleanup_summary(db: Session = Depends(get_db)):
    """Remove all summary-source rows that aren't bank-only expenses.

    This removes any CC-covered categories that were incorrectly double-imported
    from the Summary tab (e.g. Groceries, Mobile, Internet, Security).
    """
    txns = db.execute(
        select(models.Transaction).where(models.Transaction.source == "summary")
    ).scalars().all()
    removed = 0
    for txn in txns:
        merchant_lower = (txn.merchant or "").strip().lower()
        is_bad_label = (
            "income" in merchant_lower or "saving" in merchant_lower
            or merchant_lower.startswith("total") or merchant_lower == "balance"
        )
        is_cc_covered = txn.category not in BANK_ONLY_CATEGORIES
        if is_bad_label or is_cc_covered:
            db.delete(txn)
            removed += 1
    db.commit()
    return {"removed": removed}


@router.post("/deduplicate")
def deduplicate_transactions(db: Session = Depends(get_db)):
    """
    Remove duplicate transactions keeping the lowest id for each
    (date, merchant, amount, category, year, month) group.
    """
    all_txns = db.execute(
        select(models.Transaction).order_by(models.Transaction.id)
    ).scalars().all()

    seen = {}
    to_delete = []
    for txn in all_txns:
        key = (txn.date, txn.merchant.strip().lower(), round(txn.amount, 2), txn.category, txn.year, txn.month)
        if key in seen:
            to_delete.append(txn)
        else:
            seen[key] = txn.id

    for txn in to_delete:
        db.delete(txn)
    db.commit()

    return {"duplicates_removed": len(to_delete)}


@router.get("/categories/suggested-renames")
def get_suggested_renames(db: Session = Depends(get_db)):
    """Return suggested renames filtered to only old categories that still exist in transactions."""
    from categories import SUGGESTED_RENAMES
    result = db.execute(text("SELECT DISTINCT category FROM transactions"))
    existing = {row[0] for row in result.fetchall()}
    return [
        {"from_category": k, "to_category": v}
        for k, v in SUGGESTED_RENAMES.items()
        if k in existing
    ]


@router.post("/categories/migrate")
def migrate_categories(db: Session = Depends(get_db)):
    """Apply all suggested category renames to existing transactions."""
    from categories import SUGGESTED_RENAMES
    total = 0
    for old, new in SUGGESTED_RENAMES.items():
        result = db.execute(
            text("UPDATE transactions SET category = :new WHERE category = :old"),
            {"new": new, "old": old}
        )
        total += result.rowcount
    db.commit()
    return {"updated": total}
