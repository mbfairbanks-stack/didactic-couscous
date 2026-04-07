from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
import json, os

import models, database
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

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


class GeneratePrepListRequest(BaseModel):
    week_start: date


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

@app.get("/recipes")
def list_recipes(
    tag: Optional[str] = None,
    favorite: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Recipe)
    if favorite is not None:
        q = q.filter(models.Recipe.is_favorite == favorite)
    recipes = q.order_by(models.Recipe.title).all()
    if tag:
        recipes = [r for r in recipes if tag in (r.tags or [])]
    return recipes


@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    return r


@app.post("/recipes", status_code=201)
def create_recipe(body: RecipeCreate, db: Session = Depends(get_db)):
    r = models.Recipe(**body.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@app.put("/recipes/{recipe_id}")
def update_recipe(recipe_id: int, body: RecipeUpdate, db: Session = Depends(get_db)):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@app.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Recipe, recipe_id)
    if not r:
        raise HTTPException(404, "Recipe not found")
    db.delete(r)
    db.commit()


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

@app.get("/pantry")
def list_pantry(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.PantryItem)
    if category:
        q = q.filter(models.PantryItem.category == category)
    return q.order_by(models.PantryItem.category, models.PantryItem.name).all()


@app.post("/pantry", status_code=201)
def create_pantry_item(body: PantryItemCreate, db: Session = Depends(get_db)):
    item = models.PantryItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.put("/pantry/{item_id}")
def update_pantry_item(item_id: int, body: PantryItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.PantryItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@app.delete("/pantry/{item_id}", status_code=204)
def delete_pantry_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.PantryItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()


@app.get("/pantry/categories")
def pantry_categories():
    return ["Produce", "Dairy", "Meat", "Pantry", "Freezer", "Beverages", "Other"]


# ---------------------------------------------------------------------------
# Meal Plan
# ---------------------------------------------------------------------------

@app.get("/meal-plan")
def get_meal_plan(week_start: date, db: Session = Depends(get_db)):
    entries = (
        db.query(models.MealPlanEntry)
        .filter(models.MealPlanEntry.week_start == week_start)
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
        }
        if e.recipe_id:
            r = db.get(models.Recipe, e.recipe_id)
            row["label"] = r.title if r else None
        else:
            row["label"] = e.free_text
        result.append(row)
    return result


@app.post("/meal-plan", status_code=201)
def set_meal_plan_entry(body: MealPlanEntryCreate, db: Session = Depends(get_db)):
    # Upsert: replace existing entry for same week/day/meal_type
    existing = (
        db.query(models.MealPlanEntry)
        .filter(
            models.MealPlanEntry.week_start == body.week_start,
            models.MealPlanEntry.day == body.day,
            models.MealPlanEntry.meal_type == body.meal_type,
        )
        .first()
    )
    if existing:
        existing.recipe_id = body.recipe_id
        existing.free_text = body.free_text
        db.commit()
        db.refresh(existing)
        return existing

    entry = models.MealPlanEntry(**body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/meal-plan/{entry_id}", status_code=204)
def delete_meal_plan_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(models.MealPlanEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    db.delete(entry)
    db.commit()


# ---------------------------------------------------------------------------
# Prep Tasks
# ---------------------------------------------------------------------------

@app.get("/prep-tasks")
def list_prep_tasks(week_start: date, db: Session = Depends(get_db)):
    return (
        db.query(models.PrepTask)
        .filter(models.PrepTask.week_start == week_start)
        .order_by(models.PrepTask.scheduled_day, models.PrepTask.id)
        .all()
    )


@app.post("/prep-tasks", status_code=201)
def create_prep_task(body: PrepTaskCreate, db: Session = Depends(get_db)):
    task = models.PrepTask(**body.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.put("/prep-tasks/{task_id}")
def update_prep_task(task_id: int, body: PrepTaskUpdate, db: Session = Depends(get_db)):
    task = db.get(models.PrepTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


@app.delete("/prep-tasks/{task_id}", status_code=204)
def delete_prep_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(models.PrepTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()


# ---------------------------------------------------------------------------
# AI: Generate Recipe (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/generate-recipe")
def generate_recipe(body: GenerateRecipeRequest):
    import anthropic

    pantry_context = ""
    if body.pantry_items:
        pantry_context = f"\n\nAvailable pantry items: {', '.join(body.pantry_items)}"

    system = (
        "You are a helpful home chef assistant. When asked to generate a recipe, "
        "respond with ONLY a valid JSON object — no markdown, no code fences, no extra text. "
        "The JSON must have these exact keys: "
        "title (string), servings (int), prep_min (int), cook_min (int), "
        "ingredients (array of {name, amount, unit}), instructions (string with newlines), "
        "tags (array of strings like 'quick', 'vegetarian', 'gluten-free'), notes (string or null)."
    )
    user_msg = f"Generate a recipe for: {body.prompt}{pantry_context}"

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
def generate_meal_plan(body: GenerateMealPlanRequest, db: Session = Depends(get_db)):
    import anthropic

    pantry_context = ""
    if body.use_pantry:
        items = db.query(models.PantryItem).all()
        if items:
            pantry_list = ", ".join(f"{i.name} ({i.quantity} {i.unit})" for i in items)
            pantry_context = f"\n\nPantry items available: {pantry_list}"

    prefs = body.preferences or "balanced, family-friendly meals"
    system = (
        "You are a helpful meal planning assistant. Respond with ONLY a valid JSON object — "
        "no markdown, no code fences. The JSON must be an object with keys for each day of the week "
        "(Monday through Sunday). Each day is an object with keys: Breakfast, Lunch, Dinner, Snack. "
        "Each value is a short meal name string (e.g. 'Oatmeal with berries', 'Grilled chicken salad'). "
        "Keep meal names concise (under 8 words)."
    )
    user_msg = (
        f"Create a weekly meal plan starting {body.week_start}. "
        f"Preferences: {prefs}.{pantry_context}"
    )

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
# AI: Generate Prep List (streaming)
# ---------------------------------------------------------------------------

@app.post("/ai/generate-prep-list")
def generate_prep_list(body: GeneratePrepListRequest, db: Session = Depends(get_db)):
    import anthropic

    entries = (
        db.query(models.MealPlanEntry)
        .filter(models.MealPlanEntry.week_start == body.week_start)
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

@app.get("/shopping-list")
def get_shopping_list(week_start: date, db: Session = Depends(get_db)):
    entries = (
        db.query(models.MealPlanEntry)
        .filter(models.MealPlanEntry.week_start == week_start)
        .all()
    )
    pantry = {item.name.lower(): item for item in db.query(models.PantryItem).all()}

    needed = {}  # ingredient_name -> {amount, unit, have_in_pantry}
    for entry in entries:
        if not entry.recipe_id:
            continue
        recipe = db.get(models.Recipe, entry.recipe_id)
        if not recipe:
            continue
        for ing in (recipe.ingredients or []):
            name = ing.get("name", "").strip()
            if not name:
                continue
            key = name.lower()
            if key not in needed:
                needed[key] = {
                    "name": name,
                    "amount": ing.get("amount", ""),
                    "unit": ing.get("unit", ""),
                    "in_pantry": key in pantry,
                }

    # Group by in_pantry
    to_buy = [v for v in needed.values() if not v["in_pantry"]]
    have = [v for v in needed.values() if v["in_pantry"]]
    return {"to_buy": to_buy, "already_have": have}
