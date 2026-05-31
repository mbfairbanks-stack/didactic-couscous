from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
import json, os, base64, re

import models, database
import auth
from auth import get_current_user
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)


def _ensure_columns():
    """Add new columns to existing SQLite tables without a full migration framework."""
    additions = {
        "recipes": [
            ("times_made", "INTEGER DEFAULT 0"),
            ("last_made", "DATE"),
            ("user_id", "INTEGER"),
            ("is_public", "INTEGER DEFAULT 0"),
        ],
        "pantry_items": [
            ("user_id", "INTEGER"),
        ],
        "meal_plan_entries": [
            ("cooked_at", "DATETIME"),
            ("user_id", "INTEGER"),
        ],
        "prep_tasks": [
            ("user_id", "INTEGER"),
        ],
        "household_preferences": [
            ("onboarding_done", "BOOLEAN DEFAULT 0"),
            ("week_start_day", "VARCHAR DEFAULT 'Monday'"),
            ("user_id", "INTEGER"),
        ],
    }
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in additions.items():
            try:
                existing = {c["name"] for c in insp.get_columns(table)}
            except Exception:
                continue
            for name, ddl in cols:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


_ensure_columns()


def _migrate_default_user():
    """On first run with auth: create default admin user and assign all orphaned data to it."""
    from sqlalchemy.orm import Session as _Session
    db = next(get_db())
    try:
        # Check if any users exist
        user_count = db.query(models.User).count()
        if user_count > 0:
            # Fix any admin user with a NULL password (from failed first migration)
            broken = db.query(models.User).filter(
                models.User.username == "admin",
                models.User.hashed_password == None
            ).first()
            if broken:
                broken.hashed_password = auth.hash_password("admin")
                db.commit()
                print("Fixed NULL password for admin user")
            return

        # Create default admin user
        admin = models.User(
            username="admin",
            hashed_password=auth.hash_password("admin"),
        )
        db.add(admin)
        db.flush()
        admin_id = admin.id

        # Assign all orphaned data to admin
        db.query(models.Recipe).filter(models.Recipe.user_id == None).update({"user_id": admin_id})
        db.query(models.PantryItem).filter(models.PantryItem.user_id == None).update({"user_id": admin_id})
        db.query(models.MealPlanEntry).filter(models.MealPlanEntry.user_id == None).update({"user_id": admin_id})
        db.query(models.PrepTask).filter(models.PrepTask.user_id == None).update({"user_id": admin_id})
        db.query(models.HouseholdPreferences).filter(models.HouseholdPreferences.user_id == None).update({"user_id": admin_id})

        db.commit()
        print("=" * 60)
        print("DEFAULT ADMIN USER CREATED")
        print("  Username: admin")
        print("  Password: admin")
        print("  Please change your password after first login!")
        print("=" * 60)
    except Exception as e:
        db.rollback()
        print(f"Migration warning: {e}")
    finally:
        db.close()

_migrate_default_user()

app = FastAPI(title="Wetbanks Sous Chef API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"]


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RecipeCreate(BaseModel):
    title: str
    servings: int = 4
    prep_min: int = 0
    cook_min: int = 0
    ingredients: list
    instructions: str
    tags: list = []
    is_favorite: bool = False
    source: Optional[str] = "manual"
    notes: Optional[str] = None


class RecipeUpdate(BaseModel):
    title: Optional[str] = None
    servings: Optional[int] = None
    prep_min: Optional[int] = None
    cook_min: Optional[int] = None
    ingredients: Optional[list] = None
    instructions: Optional[str] = None
    tags: Optional[list] = None
    is_favorite: Optional[bool] = None
    notes: Optional[str] = None


class PantryItemCreate(BaseModel):
    name: str
    quantity: float = 0
    unit: str = ""
    category: str = "Other"
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class PantryItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class MealPlanEntryCreate(BaseModel):
    week_start: date
    day: str
    meal_type: str
    recipe_id: Optional[int] = None
    free_text: Optional[str] = None


class MealPlanEntryUpdate(BaseModel):
    recipe_id: Optional[int] = None
    free_text: Optional[str] = None


class PrepTaskCreate(BaseModel):
    week_start: date
    description: str
    scheduled_day: Optional[str] = None
    source: str = "manual"


class PrepTaskUpdate(BaseModel):
    description: Optional[str] = None
    scheduled_day: Optional[str] = None
    is_done: Optional[bool] = None


class GenerateRecipeRequest(BaseModel):
    prompt: str
    pantry_items: Optional[list[str]] = None


class GenerateMealPlanRequest(BaseModel):
    week_start: date
    preferences: Optional[str] = None
    use_pantry: bool = False
    use_favorites: bool = True


class GeneratePrepListRequest(BaseModel):
    week_start: date


class GenerateWeekRecipesRequest(BaseModel):
    week_start: date


class RefreshMealSlotRequest(BaseModel):
    week_start: date
    day: str
    meal_type: str
    preferences: Optional[str] = None
    easy: bool = False


class ImportRecipeURLRequest(BaseModel):
    url: str


class ImportRecipeTextRequest(BaseModel):
    text: str


class HouseholdPreferencesSchema(BaseModel):
    servings: Optional[int] = None
    dietary_restrictions: Optional[str] = None
    cuisine_preferences: Optional[str] = None
    avoid: Optional[str] = None
    notes: Optional[str] = None
    onboarding_done: Optional[bool] = None
    week_start_day: Optional[str] = None


class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/auth/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if len(body.username.strip()) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if len(body.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    existing = db.query(models.User).filter(models.User.username == body.username.strip().lower()).first()
    if existing:
        raise HTTPException(400, "Username already taken")
    user = models.User(
        username=body.username.strip().lower(),
        hashed_password=auth.hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Create empty preferences row
    prefs = models.HouseholdPreferences(user_id=user.id)
    db.add(prefs)
    db.commit()
    token = auth.create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "username": user.username, "onboarding_done": False}


@app.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username.strip().lower()).first()
    try:
        valid = user and user.hashed_password and auth.verify_password(body.password, user.hashed_password)
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(401, "Invalid username or password")
    prefs = db.query(models.HouseholdPreferences).filter_by(user_id=user.id).first()
    onboarding_done = prefs.onboarding_done if prefs else False
    token = auth.create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "username": user.username, "onboarding_done": onboarding_done}


@app.get("/auth/me")
def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()
    onboarding_done = prefs.onboarding_done if prefs else False
    return {"id": current_user.id, "username": current_user.username, "onboarding_done": onboarding_done}


@app.put("/auth/password")
def change_password(body: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_pw = body.get("current_password", "")
    new_pw = body.get("new_password", "")
    if not auth.verify_password(current_pw, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    if len(new_pw) < 4:
        raise HTTPException(400, "New password must be at least 4 characters")
    current_user.hashed_password = auth.hash_password(new_pw)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

@app.get("/recipes")
def list_recipes(
    tag: Optional[str] = None,
    favorite: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Recipe).filter(models.Recipe.user_id == current_user.id)
    if favorite is not None:
        q = q.filter(models.Recipe.is_favorite == favorite)
    recipes = q.order_by(models.Recipe.title).all()
    if tag:
        recipes = [r for r in recipes if tag in (r.tags or [])]
    return recipes


@app.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    if r.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    return r


@app.post("/recipes", status_code=201)
def create_recipe(
    body: RecipeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    r = models.Recipe(**body.model_dump(), user_id=current_user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@app.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: int,
    body: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    if r.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@app.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    if r.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    db.delete(r)
    db.commit()


# ---------------------------------------------------------------------------
# Community Recipes
# ---------------------------------------------------------------------------

@app.get("/community/recipes")
def list_community_recipes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Public recipes shared by other households."""
    recipes = (
        db.query(models.Recipe)
        .filter(models.Recipe.is_public == True, models.Recipe.user_id != current_user.id)
        .order_by(models.Recipe.title)
        .all()
    )
    return recipes


@app.post("/recipes/{recipe_id}/publish")
def publish_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Make a recipe public (share to community)."""
    r = db.get(models.Recipe, recipe_id)
    if not r or r.user_id != current_user.id:
        raise HTTPException(404, "Recipe not found")
    r.is_public = True
    db.commit()
    return {"ok": True, "is_public": True}


@app.post("/recipes/{recipe_id}/unpublish")
def unpublish_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remove a recipe from the community."""
    r = db.get(models.Recipe, recipe_id)
    if not r or r.user_id != current_user.id:
        raise HTTPException(404, "Recipe not found")
    r.is_public = False
    db.commit()
    return {"ok": True, "is_public": False}


@app.post("/community/recipes/{recipe_id}/copy", status_code=201)
def copy_community_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Copy a public recipe into the current user's library."""
    r = db.get(models.Recipe, recipe_id)
    if not r or not r.is_public:
        raise HTTPException(404, "Recipe not found in community")
    copy = models.Recipe(
        user_id=current_user.id,
        title=r.title,
        servings=r.servings,
        prep_min=r.prep_min,
        cook_min=r.cook_min,
        ingredients=r.ingredients,
        instructions=r.instructions,
        tags=r.tags,
        source="community",
        notes=r.notes,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

@app.get("/pantry")
def list_pantry(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.PantryItem).filter(models.PantryItem.user_id == current_user.id)
    if category:
        q = q.filter(models.PantryItem.category == category)
    return q.order_by(models.PantryItem.category, models.PantryItem.name).all()


@app.post("/pantry", status_code=201)
def create_pantry_item(
    body: PantryItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = models.PantryItem(**body.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.post("/pantry/bulk", status_code=201)
def bulk_create_pantry_items(
    body: list[PantryItemCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    for item_data in body:
        db.add(models.PantryItem(**item_data.model_dump(), user_id=current_user.id))
    db.commit()
    return {"created": len(body)}


@app.put("/pantry/{item_id}")
def update_pantry_item(
    item_id: int,
    body: PantryItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.get(models.PantryItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@app.delete("/pantry/{item_id}", status_code=204)
def delete_pantry_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.get(models.PantryItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    db.delete(item)
    db.commit()


@app.delete("/pantry", status_code=204)
def clear_all_pantry(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.PantryItem).filter(models.PantryItem.user_id == current_user.id).delete()
    db.commit()


@app.get("/pantry/categories")
def pantry_categories():
    return ["Produce", "Dairy", "Meat", "Pantry", "Freezer", "Beverages", "Other"]


# ---------------------------------------------------------------------------
# Meal Plan
# ---------------------------------------------------------------------------

@app.get("/meal-plan")
def get_meal_plan(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entries = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == week_start,
            models.MealPlanEntry.user_id == current_user.id,
        )
        .all()
    )
    # Enrich with recipe title if linked
    result = []
    for e in entries:
        row = {
            "id": e.id,
            "week_start": e.week_start,
            "day": e.day,
            "meal_type": e.meal_type,
            "recipe_id": e.recipe_id,
            "free_text": e.free_text,
            "label": None,
            "cooked_at": e.cooked_at,
        }
        if e.recipe_id:
            r = db.get(models.Recipe, e.recipe_id)
            if r and r.user_id == current_user.id:
                row["label"] = r.title
            elif r:
                row["label"] = r.title
        else:
            row["label"] = e.free_text
        result.append(row)
    return result


@app.post("/meal-plan", status_code=201)
def set_meal_plan_entry(
    body: MealPlanEntryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Upsert: replace existing entry for same week/day/meal_type for this user
    existing = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == body.week_start,
            models.MealPlanEntry.day == body.day,
            models.MealPlanEntry.meal_type == body.meal_type,
            models.MealPlanEntry.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        existing.recipe_id = body.recipe_id
        existing.free_text = body.free_text
        db.commit()
        db.refresh(existing)
        return existing

    entry = models.MealPlanEntry(**body.model_dump(), user_id=current_user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/meal-plan/{entry_id}", status_code=204)
def delete_meal_plan_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entry = db.get(models.MealPlanEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    db.delete(entry)
    db.commit()


@app.delete("/meal-plan", status_code=204)
def clear_week_meal_plan(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete all meal plan entries for a given week."""
    db.query(models.MealPlanEntry).filter(
        models.MealPlanEntry.week_start == week_start,
        models.MealPlanEntry.user_id == current_user.id,
    ).delete()
    db.commit()


@app.post("/meal-plan/{entry_id}/cook")
def mark_meal_cooked(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a meal slot as cooked: stamp the entry, bump recipe stats, deduct pantry."""
    entry = db.get(models.MealPlanEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    if not entry.recipe_id:
        raise HTTPException(400, "Only meals linked to a recipe can be marked cooked")

    recipe = db.get(models.Recipe, entry.recipe_id)
    if not recipe:
        raise HTTPException(404, "Linked recipe not found")

    entry.cooked_at = datetime.utcnow()
    recipe.times_made = (recipe.times_made or 0) + 1
    recipe.last_made = date.today()

    pantry = db.query(models.PantryItem).filter(models.PantryItem.user_id == current_user.id).all()
    by_name = {p.name.strip().lower(): p for p in pantry}

    deducted = []
    skipped = []
    for ing in (recipe.ingredients or []):
        name = (ing.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        pi = by_name.get(key)
        if not pi:
            skipped.append({"name": name, "reason": "not in pantry"})
            continue
        ing_unit = (ing.get("unit") or "").strip().lower()
        pi_unit = (pi.unit or "").strip().lower()
        if ing_unit and pi_unit and ing_unit != pi_unit:
            skipped.append({"name": name, "reason": f"unit mismatch ({ing_unit} vs {pi_unit})"})
            continue
        amt = _parse_amount(ing.get("amount", 0))
        if amt <= 0:
            skipped.append({"name": name, "reason": "no amount"})
            continue
        new_qty = max(0.0, (pi.quantity or 0) - amt)
        pi.quantity = new_qty
        deducted.append({"name": name, "deducted": amt, "remaining": new_qty})

    db.commit()
    db.refresh(entry)
    return {
        "entry_id": entry.id,
        "cooked_at": entry.cooked_at,
        "recipe_title": recipe.title,
        "times_made": recipe.times_made,
        "deducted": deducted,
        "skipped": skipped,
    }


@app.post("/meal-plan/{entry_id}/uncook", status_code=204)
def unmark_meal_cooked(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Undo a cooked mark. Note: does NOT restore pantry quantities."""
    entry = db.get(models.MealPlanEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    if entry.cooked_at and entry.recipe_id:
        recipe = db.get(models.Recipe, entry.recipe_id)
        if recipe and (recipe.times_made or 0) > 0:
            recipe.times_made -= 1
    entry.cooked_at = None
    db.commit()


# ---------------------------------------------------------------------------
# Prep Tasks
# ---------------------------------------------------------------------------

@app.get("/prep-tasks")
def list_prep_tasks(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.PrepTask)
        .filter(
            models.PrepTask.week_start == week_start,
            models.PrepTask.user_id == current_user.id,
        )
        .order_by(models.PrepTask.scheduled_day, models.PrepTask.id)
        .all()
    )


@app.post("/prep-tasks", status_code=201)
def create_prep_task(
    body: PrepTaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = models.PrepTask(**body.model_dump(), user_id=current_user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.put("/prep-tasks/{task_id}")
def update_prep_task(
    task_id: int,
    body: PrepTaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.PrepTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


@app.delete("/prep-tasks/{task_id}", status_code=204)
def delete_prep_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.PrepTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(403, "Not yours")
    db.delete(task)
    db.commit()


# ---------------------------------------------------------------------------
# Household Preferences (per-user row)
# ---------------------------------------------------------------------------

@app.get("/preferences")
def get_preferences(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()
    if not prefs:
        prefs = models.HouseholdPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


@app.put("/preferences")
def update_preferences(
    body: HouseholdPreferencesSchema,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()
    if not prefs:
        prefs = models.HouseholdPreferences(user_id=current_user.id)
        db.add(prefs)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(prefs, k, v)
    db.commit()
    db.refresh(prefs)
    return prefs


# ---------------------------------------------------------------------------
# AI: Generate Recipe (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/generate-recipe")
def generate_recipe(
    body: GenerateRecipeRequest,
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    pantry_context = ""
    if body.pantry_items:
        pantry_context = f"\n\nAvailable pantry items: {', '.join(body.pantry_items)}"

    system = (
        "You are a helpful home chef assistant specialising in classic, time-tested recipes. "
        "Only generate real, well-known dishes that a home cook would recognise — the kind found in "
        "traditional cookbooks. If the requested name sounds invented or vague, interpret it as the "
        "nearest classic equivalent (e.g. 'herby chicken bake' → 'Roast Chicken with Herbs'). "
        "Never invent fusion dishes or novelty mashups. "
        "When asked to generate a recipe, respond with ONLY a valid JSON object — no markdown, no code fences, no extra text. "
        "The JSON must have these exact keys: "
        "title (string), servings (int), prep_min (int), cook_min (int), "
        "ingredients (array of {name, amount, unit}), instructions (string with newlines), "
        "tags (array of strings like 'quick', 'vegetarian', 'gluten-free'), notes (string or null)."
    )
    user_msg = f"Generate a classic recipe for: {body.prompt}{pantry_context}"

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI: Generate Meal Plan (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/generate-meal-plan")
def generate_meal_plan(
    body: GenerateMealPlanRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    # Load saved household preferences for current user
    saved_prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()

    # Build preferences block
    pref_lines = []
    if saved_prefs:
        if saved_prefs.dietary_restrictions:
            pref_lines.append(f"Dietary restrictions: {saved_prefs.dietary_restrictions}")
        if saved_prefs.cuisine_preferences:
            pref_lines.append(f"Cuisine preferences: {saved_prefs.cuisine_preferences}")
        if saved_prefs.avoid:
            pref_lines.append(f"Avoid: {saved_prefs.avoid}")
        if saved_prefs.notes:
            pref_lines.append(f"Other notes: {saved_prefs.notes}")
        if saved_prefs.servings:
            pref_lines.append(f"Household size: {saved_prefs.servings} people")
    if body.preferences:
        pref_lines.append(f"Additional preferences: {body.preferences}")
    if not pref_lines:
        pref_lines.append("balanced, family-friendly meals")

    prefs_text = "\n".join(pref_lines)

    # Build favorites block
    favorites_context = ""
    if body.use_favorites:
        favorites = (
            db.query(models.Recipe)
            .filter(models.Recipe.is_favorite == True, models.Recipe.user_id == current_user.id)
            .all()
        )
        if favorites:
            fav_list = "\n".join(
                f"  - {r.title}" + (f" (tags: {', '.join(r.tags)})" if r.tags else "")
                for r in favorites
            )
            favorites_context = (
                f"\n\nThis household has starred these recipes as favourites:\n{fav_list}\n"
                "Use these as inspiration — draw on their flavours, cuisines, and ingredients when "
                "creating the week's meals. Occasionally include one or two of them directly (using "
                "the EXACT title so they can be matched), but mostly let them guide the style and "
                "variety of the plan rather than dominating it."
            )

    # Build cooked history block — what the household has actually enjoyed
    cooked_recipes = (
        db.query(models.Recipe)
        .filter(models.Recipe.times_made > 0, models.Recipe.user_id == current_user.id)
        .order_by(models.Recipe.times_made.desc())
        .limit(12)
        .all()
    )
    history_context = ""
    if cooked_recipes:
        hist_list = "\n".join(
            f"  - {r.title} (made {r.times_made}x)" for r in cooked_recipes
        )
        history_context = (
            f"\n\nPreviously enjoyed by this household (lean toward these — they liked them):\n{hist_list}\n"
            "Schedule a few of these (using their EXACT titles) when they fit the week."
        )

    # Build recent-weeks context — avoid repeating meals from the last 3 weeks
    week_start_date = body.week_start if isinstance(body.week_start, date) else datetime.strptime(str(body.week_start), "%Y-%m-%d").date()
    three_weeks_ago = week_start_date - timedelta(weeks=3)
    recent_entries = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.user_id == current_user.id,
            models.MealPlanEntry.week_start >= three_weeks_ago,
            models.MealPlanEntry.week_start < week_start_date,
        )
        .all()
    )
    recent_context = ""
    if recent_entries:
        meal_names = set()
        recipe_ids = {e.recipe_id for e in recent_entries if e.recipe_id}
        if recipe_ids:
            for r in db.query(models.Recipe).filter(models.Recipe.id.in_(recipe_ids)).all():
                meal_names.add(r.title)
        for e in recent_entries:
            if e.free_text:
                meal_names.add(e.free_text)
        if meal_names:
            recent_context = (
                f"\n\nMeals planned in the last 3 weeks (DO NOT repeat these — choose different dishes):\n"
                + ", ".join(sorted(meal_names))
            )

    # Build pantry block — pantry-first when use_pantry is on
    pantry_context = ""
    if body.use_pantry:
        items = db.query(models.PantryItem).filter(models.PantryItem.user_id == current_user.id).all()
        if items:
            today = date.today()
            soon = today + timedelta(days=7)
            expiring = [i for i in items if i.expiry_date and i.expiry_date <= soon]
            pantry_list = ", ".join(f"{i.name} ({i.quantity} {i.unit})".strip() for i in items)
            expiring_block = ""
            if expiring:
                exp_list = ", ".join(
                    f"{i.name} (expires {i.expiry_date.isoformat()})" for i in expiring
                )
                expiring_block = (
                    f"\nITEMS EXPIRING WITHIN 7 DAYS — prioritise using these first:\n  {exp_list}\n"
                )
            pantry_context = (
                f"\n\nCurrent pantry/fridge/freezer inventory:\n{pantry_list}\n"
                f"{expiring_block}"
                "Plan the week to MAXIMISE use of what's already on hand. Lead with dishes that "
                "draw heavily on this inventory before suggesting meals that require many new purchases. "
                "Items expiring soon should appear in earlier-week meals."
            )

    system = (
        "You are a helpful meal planning assistant specialising in classic, time-tested home cooking. "
        "Every meal name you suggest must be a real, well-known dish that a home cook would recognise — "
        "something you could look up in a traditional cookbook. "
        "Think: Spaghetti Bolognese, Chicken Tikka Masala, Caesar Salad, Beef Stew, Pad Thai, "
        "Fish Tacos, Shakshuka, French Onion Soup, Chicken Stir-Fry, Mushroom Risotto. "
        "Do NOT invent mashups, fusion dishes, or descriptive marketing names like "
        "'Herb-Crusted Protein Bowl', 'Mediterranean-Asian Wrap', or 'Turmeric Glow Soup'. "
        "If pantry items suggest a dish, name the actual classic dish — e.g. 'pasta + tomatoes' → 'Spaghetti Pomodoro'. "
        "Your top priority is to USE WHAT THE HOUSEHOLD ALREADY HAS, then fresh suggestions that fit "
        "their preferences and are inspired by (but not limited to) their favourite recipes. "
        "Respond with ONLY a valid JSON object — no markdown, no code fences. "
        "The JSON must be an object with keys for each day of the week (Monday through Sunday). "
        "Each day is an object with keys: Breakfast, Lunch, Dinner, Snack. "
        "Each value is a short meal name string. Keep meal names concise (under 8 words). "
        "When scheduling a favourite recipe, use its EXACT title."
    )
    user_msg = (
        f"Create a weekly meal plan for the week of {body.week_start}.\n\n"
        f"Household preferences:\n{prefs_text}"
        f"{favorites_context}"
        f"{history_context}"
        f"{recent_context}"
        f"{pantry_context}"
    )

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as s:
            for chunk in s.text_stream:
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI: Generate Prep List (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/generate-prep-list")
def generate_prep_list(
    body: GeneratePrepListRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    entries = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == body.week_start,
            models.MealPlanEntry.user_id == current_user.id,
        )
        .all()
    )

    if not entries:
        raise HTTPException(400, "No meal plan found for this week")

    # Build a readable meal plan summary
    plan_lines = []
    for e in entries:
        label = e.free_text
        if e.recipe_id:
            r = db.get(models.Recipe, e.recipe_id)
            if r:
                label = r.title
        if label:
            plan_lines.append(f"  {e.day} {e.meal_type}: {label}")
    plan_text = "\n".join(plan_lines)

    system = (
        "You are a meal prep expert. Given a weekly meal plan, generate a practical prep task list. "
        "Respond with ONLY a valid JSON array — no markdown, no code fences. "
        "Each item must have: description (string), scheduled_day (one of: Monday, Tuesday, Wednesday, "
        "Thursday, Friday, Saturday, Sunday, or null for 'anytime'). "
        "Focus on batch cooking, marinating, chopping, thawing, and other prep steps that save time. "
        "Be specific (e.g. 'Cook a pot of brown rice' not just 'Prep grains'). "
        "Return 5-12 tasks."
    )
    user_msg = f"Weekly meal plan:\n{plan_text}\n\nGenerate a prep task list."

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Shopping list: diff meal plan vs pantry
# ---------------------------------------------------------------------------

# Ingredients that are always available from the tap / household — never buy
_SKIP_INGREDIENTS = {
    "water", "cold water", "hot water", "boiling water", "ice water",
    "warm water", "tap water", "lukewarm water", "ice", "ice cubes",
}


def _parse_amount(val) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        s = str(val).strip()
        if "/" in s:
            parts = s.split("/")
            try:
                return float(parts[0]) / float(parts[1])
            except Exception:
                pass
        return 0.0


def _fmt_amount(total: float) -> str:
    if total <= 0:
        return ""
    return str(int(total)) if total == int(total) else str(round(total, 2))


# Known units — anything else is treated as a descriptor (folded into name)
_KNOWN_UNITS = {
    "g", "kg", "mg", "oz", "lb", "lbs",
    "ml", "l", "litre", "litres", "liter", "liters",
    "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons",
    "can", "cans", "jar", "jars", "bag", "bags", "box", "boxes",
    "bottle", "bottles", "bunch", "bunches", "head", "heads",
    "clove", "cloves", "slice", "slices", "piece", "pieces",
    "whole", "pcs", "dozen", "loaf", "loaves", "sprig", "sprigs",
    "pinch", "dash", "handful", "pack", "packs",
}

_NAME_STRIP = re.compile(
    r'\b(fresh|dried|frozen|canned|large|small|medium|ripe|raw|cooked|'
    r'chopped|diced|sliced|minced|grated|peeled|halved|crushed|ground|'
    r'boneless|skinless|whole|organic|baby|extra)\b\s*',
    re.IGNORECASE,
)


def _normalize_ingredient(name: str, unit: str) -> tuple[str, str]:
    """Return (normalised_name, normalised_unit).
    If the unit is not a recognised measurement, fold it back into the name."""
    norm_unit = unit.strip().lower()
    if norm_unit not in _KNOWN_UNITS:
        # e.g. unit="large ripe" → fold into name, clear unit
        combined = f"{name} {unit}".strip() if unit else name
        norm_unit = ""
    else:
        combined = name
    # Strip common adjectives and lowercase
    n = _NAME_STRIP.sub("", combined).strip().lower()
    n = re.sub(r'\s+', ' ', n)
    # Singularize common plurals
    if n.endswith("ies") and len(n) > 4:
        n = n[:-3] + "y"
    elif n.endswith("ves") and len(n) > 4:
        n = n[:-3] + "f"
    elif n.endswith("s") and not n.endswith("ss") and len(n) > 3:
        n = n[:-1]
    return n.strip(), norm_unit


def _pantry_match(ingredient_norm: str, pantry_keys: set) -> bool:
    """Return True if a normalized pantry item matches the ingredient."""
    if ingredient_norm in pantry_keys:
        return True
    # Check if any pantry key is contained in the ingredient name or vice versa
    for pk in pantry_keys:
        if pk in ingredient_norm or ingredient_norm in pk:
            return True
    return False


@app.get("/shopping-list")
def get_shopping_list(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entries = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == week_start,
            models.MealPlanEntry.user_id == current_user.id,
        )
        .all()
    )
    pantry_items = db.query(models.PantryItem).filter(models.PantryItem.user_id == current_user.id).all()
    pantry_keys = set()
    for item in pantry_items:
        n, _ = _normalize_ingredient(item.name, "")
        pantry_keys.add(n)

    # key = (normalised_name, normalised_unit) → aggregate amounts
    groups: dict = {}
    for entry in entries:
        if not entry.recipe_id:
            continue
        recipe = db.get(models.Recipe, entry.recipe_id)
        if not recipe:
            continue
        for ing in (recipe.ingredients or []):
            raw_name = ing.get("name", "").strip()
            if not raw_name:
                continue
            raw_unit = str(ing.get("unit", "") or "").strip()
            norm_name, norm_unit = _normalize_ingredient(raw_name, raw_unit)
            if norm_name in _SKIP_INGREDIENTS:
                continue
            key = (norm_name, norm_unit)
            amt = _parse_amount(ing.get("amount", 0))
            if key not in groups:
                groups[key] = {
                    "name": norm_name,
                    "unit": norm_unit,
                    "total": 0.0,
                    "in_pantry": _pantry_match(norm_name, pantry_keys),
                }
            groups[key]["total"] += amt

    result = [
        {"name": g["name"], "amount": _fmt_amount(g["total"]), "unit": g["unit"], "in_pantry": g["in_pantry"]}
        for g in groups.values()
    ]
    to_buy = sorted([v for v in result if not v["in_pantry"]], key=lambda x: x["name"].lower())
    have   = sorted([v for v in result if v["in_pantry"]],     key=lambda x: x["name"].lower())
    return {"to_buy": to_buy, "already_have": have}


# ---------------------------------------------------------------------------
# AI: Generate real recipes for all unlinked meal plan entries (batch)
# ---------------------------------------------------------------------------

def _extract_leftover_base(text: str) -> str | None:
    """Return the base meal name if this entry is a leftovers entry, else None.

    Handles patterns like:
      'Mushroom Risotto Leftovers'  → 'Mushroom Risotto'
      'Leftover Chicken Tikka Masala' → 'Chicken Tikka Masala'
      'Leftovers: Salmon'            → 'Salmon'
    """
    t = text.strip()
    lower = t.lower()
    if lower.endswith(" leftovers"):
        return t[: -len(" leftovers")].strip()
    if lower.endswith(" leftover"):
        return t[: -len(" leftover")].strip()
    if lower.startswith("leftover "):
        return t[len("leftover "):].strip()
    if lower.startswith("leftovers: "):
        return t[len("leftovers: "):].strip()
    if lower.startswith("leftovers "):
        return t[len("leftovers "):].strip()
    return None


@app.post("/ai/generate-week-recipes")
def generate_week_recipes(
    body: GenerateWeekRecipesRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    all_week_entries = db.query(models.MealPlanEntry).filter(
        models.MealPlanEntry.week_start == body.week_start,
        models.MealPlanEntry.user_id == current_user.id,
    ).all()

    # Unlinked, non-skip entries that need recipes
    entries = [
        e for e in all_week_entries
        if not e.recipe_id and e.free_text and e.free_text != "__skip__"
    ]

    if not entries:
        return {"generated": 0}

    prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()
    servings = prefs.servings if prefs else 4

    # ── Leftover detection ──────────────────────────────────────────────────
    # Build a map: normalised base name → recipe_id for all already-linked entries
    already_linked: dict[str, int] = {}
    for e in all_week_entries:
        if e.recipe_id and e.free_text is None:
            recipe = db.get(models.Recipe, e.recipe_id)
            if recipe:
                already_linked[recipe.title.lower().strip()] = e.recipe_id

    # Separate leftover entries from entries that need new recipes
    leftover_entries = []   # will be linked to the parent recipe
    generate_entries = []   # need an AI recipe generated
    # Track which base meals have a leftover counterpart (→ double servings)
    bases_needing_double: set[str] = set()

    for e in entries:
        base = _extract_leftover_base(e.free_text)
        if base is not None:
            leftover_entries.append((e, base))
            bases_needing_double.add(base.lower().strip())
        else:
            generate_entries.append(e)

    # Link leftover entries to already-linked base recipes where possible
    unresolved_leftovers = []
    for e, base in leftover_entries:
        parent_id = already_linked.get(base.lower().strip())
        if parent_id:
            e.recipe_id = parent_id
            e.free_text = None
        else:
            # Parent not yet generated — keep in list to resolve after generation
            unresolved_leftovers.append((e, base))

    meal_names = list({e.free_text for e in generate_entries})

    if not meal_names:
        db.commit()
        return {"generated": 0}

    # ── Recipe generation ───────────────────────────────────────────────────
    system = (
        "You are a helpful home chef assistant specialising in classic, time-tested recipes. "
        "Generate full recipes for a list of meal names. Every recipe must be a real, well-known dish "
        "that a home cook would recognise from a traditional cookbook. If a meal name sounds invented "
        "or vague, use the nearest classic dish — e.g. 'Asian-style noodles' → 'Pad Thai', "
        "'creamy tomato pasta' → 'Pasta al Pomodoro'. Never invent fusion or novelty dishes. "
        "Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text. "
        "Keys are the exact meal names provided. Each value has: "
        "title (string), servings (int), prep_min (int), cook_min (int), "
        "ingredients (array of {name, amount, unit}), instructions (string with newlines), "
        "tags (array of strings), notes (string or null). "
        "IMPORTANT: Use simple, standardised ingredient names so they consolidate on a shopping list. "
        "Examples: 'olive oil' not 'extra-virgin olive oil', 'onion' not 'yellow onion', "
        "'garlic' not 'garlic cloves', 'butter' not 'unsalted butter', "
        "'chicken breast' not 'boneless skinless chicken breast'. "
        "Amounts must be plain numbers or simple fractions (e.g. 0.5 not '1/2')."
    )

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    saved = 0
    BATCH = 5

    # Map: normalised meal name → created recipe id (for resolving leftovers)
    generated_recipe_ids: dict[str, int] = {}

    for i in range(0, len(meal_names), BATCH):
        batch = meal_names[i : i + BATCH]
        # Double servings for meals that have a leftovers lunch planned
        def _target(name: str) -> int:
            return servings * 2 if name.lower().strip() in bases_needing_double else servings

        lines = "\n".join(
            f"- {m} (target {_target(m)} servings)" for m in batch
        )
        user_msg = f"Generate classic recipes for these meals:\n{lines}"

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8000,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw_text = message.content[0].text
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start == -1 or end == 0:
            continue
        try:
            batch_data = json.loads(raw_text[start:end])
        except Exception:
            continue

        for meal_name, rd in batch_data.items():
            target_sv = _target(meal_name)
            recipe = models.Recipe(
                user_id=current_user.id,
                title=rd.get("title", meal_name),
                servings=rd.get("servings", target_sv),
                prep_min=rd.get("prep_min", 0),
                cook_min=rd.get("cook_min", 0),
                ingredients=rd.get("ingredients", []),
                instructions=rd.get("instructions", ""),
                tags=rd.get("tags", []),
                notes=rd.get("notes"),
                source="ai",
            )
            db.add(recipe)
            db.flush()
            lower = meal_name.lower()
            for entry in generate_entries:
                if entry.free_text and entry.free_text.lower() == lower:
                    entry.recipe_id = recipe.id
                    entry.free_text = None
            generated_recipe_ids[lower.strip()] = recipe.id
            saved += 1

    # Resolve any leftover entries whose parent was just generated
    for e, base in unresolved_leftovers:
        parent_id = generated_recipe_ids.get(base.lower().strip())
        if parent_id:
            e.recipe_id = parent_id
            e.free_text = None

    db.commit()
    return {"generated": saved}


# ---------------------------------------------------------------------------
# AI: Refresh single meal slot (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/refresh-meal-slot")
def refresh_meal_slot(
    body: RefreshMealSlotRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    entries = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == body.week_start,
            models.MealPlanEntry.user_id == current_user.id,
        )
        .all()
    )
    existing = []
    for e in entries:
        if e.day == body.day and e.meal_type == body.meal_type:
            continue
        label = e.free_text
        if e.recipe_id:
            r = db.get(models.Recipe, e.recipe_id)
            if r:
                label = r.title
        if label:
            existing.append(f"{e.day} {e.meal_type}: {label}")

    saved_prefs = db.query(models.HouseholdPreferences).filter_by(user_id=current_user.id).first()
    pref_lines = []
    if saved_prefs:
        if saved_prefs.dietary_restrictions:
            pref_lines.append(f"Dietary restrictions: {saved_prefs.dietary_restrictions}")
        if saved_prefs.cuisine_preferences:
            pref_lines.append(f"Cuisine preferences: {saved_prefs.cuisine_preferences}")
        if saved_prefs.avoid:
            pref_lines.append(f"Avoid: {saved_prefs.avoid}")
        if saved_prefs.notes:
            pref_lines.append(f"Other notes: {saved_prefs.notes}")
        if saved_prefs.servings:
            pref_lines.append(f"Household size: {saved_prefs.servings} people")
    if body.preferences:
        pref_lines.append(body.preferences)

    context_text = "\n".join(existing) if existing else "No other meals planned yet."
    prefs_text = "\n".join(pref_lines) if pref_lines else "No specific preferences."

    if body.easy:
        system = (
            "You are a helpful meal planning assistant. Suggest ONE very quick and easy meal "
            "(30 minutes or less, minimal ingredients, minimal cleanup — think weeknight simple). "
            "Respond with ONLY the meal name — no punctuation, no explanation, no quotes, no extra text. "
            "Keep it concise (under 8 words)."
        )
    else:
        system = (
            "You are a helpful meal planning assistant specialising in classic, time-tested home cooking. "
            "Suggest ONE traditional, well-established meal — no trendy, fusion, or novelty dishes. "
            "Respond with ONLY the meal name — no punctuation, no explanation, no quotes, no extra text. "
            "Keep it concise (under 8 words). Suggest something different from the existing plan."
        )
    user_msg = (
        f"Suggest a {body.meal_type} for {body.day}.\n\n"
        f"Already planned this week (avoid duplicates):\n{context_text}\n\n"
        f"Household preferences:\n{prefs_text}"
    )

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=64,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


RECIPE_JSON_SYSTEM = (
    "You are a helpful home chef assistant. Extract or generate the recipe and respond with "
    "ONLY a valid JSON object — no markdown, no code fences, no extra text. "
    "The JSON must have these exact keys: "
    "title (string), servings (int), prep_min (int), cook_min (int), "
    "ingredients (array of {name, amount, unit}), instructions (string with newlines), "
    "tags (array of strings like 'quick', 'vegetarian', 'gluten-free'), notes (string or null)."
)


# ---------------------------------------------------------------------------
# AI: Import Recipe from PDF
# ---------------------------------------------------------------------------

@app.post("/ai/import-recipe/pdf")
async def import_recipe_pdf(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    pdf_bytes = await file.read()
    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=RECIPE_JSON_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64},
                    },
                    {"type": "text", "text": "Extract the recipe from this PDF and return it as JSON."},
                ],
            }],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI: Import Recipe from URL
# ---------------------------------------------------------------------------

def _fetch_page_text(url: str) -> str:
    import urllib.request
    from html.parser import HTMLParser

    class TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.chunks = []
            self._skip = False

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "nav", "footer", "header"):
                self._skip = True

        def handle_endtag(self, tag):
            if tag in ("script", "style", "nav", "footer", "header"):
                self._skip = False

        def handle_data(self, data):
            if not self._skip:
                text = data.strip()
                if text:
                    self.chunks.append(text)

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8", errors="ignore")

    parser = TextExtractor()
    parser.feed(html)
    raw = " ".join(parser.chunks)
    # Collapse whitespace and truncate to avoid token limits
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:12000]


@app.post("/ai/import-recipe/text")
def import_recipe_text(
    body: ImportRecipeTextRequest,
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    if not body.text or not body.text.strip():
        raise HTTPException(400, "No text provided")

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=RECIPE_JSON_SYSTEM,
            messages=[{
                "role": "user",
                "content": f"Extract the recipe from the following text and return it as JSON.\n\n{body.text[:12000]}",
            }],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/ai/import-recipe/url")
def import_recipe_url(
    body: ImportRecipeURLRequest,
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    try:
        page_text = _fetch_page_text(body.url)
    except Exception as e:
        raise HTTPException(400, f"Could not fetch URL: {e}")

    def stream():
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=RECIPE_JSON_SYSTEM,
            messages=[{
                "role": "user",
                "content": (
                    f"Extract the recipe from the following webpage text and return it as JSON.\n\n"
                    f"URL: {body.url}\n\nPage content:\n{page_text}"
                ),
            }],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI: Parse grocery receipt image into pantry items
# ---------------------------------------------------------------------------

@app.post("/ai/parse-receipt")
async def parse_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import anthropic

    contents = await file.read()
    if not contents:
        raise HTTPException(400, "Empty file")

    mime = file.content_type or "image/jpeg"
    if not mime.startswith("image/"):
        raise HTTPException(400, "File must be an image (jpg/png/heic)")

    b64 = base64.standard_b64encode(contents).decode("ascii")

    system = (
        "You extract grocery items from receipt photos for a kitchen pantry app. "
        "Respond with ONLY a valid JSON array — no markdown, no code fences, no commentary. "
        "Each element: {name (clean, lowercase singular noun), quantity (number, default 1), "
        "unit (string, '' if a count), category (one of: Produce, Dairy, Meat, Pantry, Freezer, Beverages, Other)}. "
        "Normalise names so they consolidate with existing pantry items "
        "(e.g. 'GV WHL MILK 2L' → 'milk', 'BAN' → 'banana', 'CHKN BRST' → 'chicken breast'). "
        "Skip tax, totals, store info, loyalty rewards, bag fees, and anything that isn't food/drink/household pantry. "
        "If quantity isn't clear, use 1. If unit isn't clear, leave as ''."
    )

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}},
                {"type": "text", "text": "Parse this grocery receipt into pantry items."},
            ],
        }],
    )
    raw = message.content[0].text
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise HTTPException(500, "Could not parse receipt response")
    try:
        items = json.loads(raw[start:end])
    except Exception as e:
        raise HTTPException(500, f"Invalid JSON from receipt parser: {e}")

    cleaned = []
    for it in items:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip().lower()
        if not name:
            continue
        cleaned.append({
            "name": name,
            "quantity": float(it.get("quantity") or 1),
            "unit": (it.get("unit") or "").strip(),
            "category": it.get("category") or "Other",
        })
    return {"items": cleaned}


@app.post("/ai/scan-pantry-photo")
async def scan_pantry_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Identify visible food items in a pantry/fridge/freezer photo."""
    import anthropic

    contents = await file.read()
    if not contents:
        raise HTTPException(400, "Empty file")
    mime = file.content_type or "image/jpeg"
    if not mime.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    b64 = base64.standard_b64encode(contents).decode("ascii")

    system = (
        "You identify food and pantry items visible in a photo of a kitchen pantry, fridge, freezer, "
        "shelf, or counter. Respond with ONLY a valid JSON array — no markdown, no code fences. "
        "Each element: {name (clean, lowercase singular noun like 'milk' or 'olive oil'), "
        "quantity (number — count of visible items, default 1), "
        "unit (string — leave '' for countable items like jars/cans/bottles unless the label clearly shows a volume), "
        "category (one of: Produce, Dairy, Meat, Pantry, Freezer, Beverages, Other)}. "
        "Identify by package label when visible, otherwise by appearance. "
        "Normalise names ('extra virgin olive oil' → 'olive oil', 'roma tomatoes' → 'tomato'). "
        "Count duplicates as quantity (e.g. 3 visible cans of beans → one entry, quantity 3). "
        "Skip kitchen tools, dishes, and anything that isn't food or drink. "
        "If you can't identify an item with reasonable confidence, omit it rather than guessing."
    )

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}},
                {"type": "text", "text": "List the food and pantry items visible in this photo."},
            ],
        }],
    )
    raw = message.content[0].text
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise HTTPException(500, "Could not parse photo response")
    try:
        items = json.loads(raw[start:end])
    except Exception as e:
        raise HTTPException(500, f"Invalid JSON from photo parser: {e}")

    cleaned = []
    for it in items:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip().lower()
        if not name:
            continue
        cleaned.append({
            "name": name,
            "quantity": float(it.get("quantity") or 1),
            "unit": (it.get("unit") or "").strip(),
            "category": it.get("category") or "Other",
        })
    return {"items": cleaned}
