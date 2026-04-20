from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
import json, os, base64, re

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
    use_favorites: bool = True


class GeneratePrepListRequest(BaseModel):
    week_start: date


class ImportRecipeURLRequest(BaseModel):
    url: str


class HouseholdPreferencesSchema(BaseModel):
    servings: int = 4
    dietary_restrictions: str = ""
    cuisine_preferences: str = ""
    avoid: str = ""
    notes: str = ""


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


@app.post("/pantry/bulk", status_code=201)
def bulk_create_pantry_items(body: list[PantryItemCreate], db: Session = Depends(get_db)):
    for item_data in body:
        db.add(models.PantryItem(**item_data.model_dump()))
    db.commit()
    return {"created": len(body)}


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
# Household Preferences (singleton row, id=1)
# ---------------------------------------------------------------------------

@app.get("/preferences")
def get_preferences(db: Session = Depends(get_db)):
    prefs = db.get(models.HouseholdPreferences, 1)
    if not prefs:
        prefs = models.HouseholdPreferences(id=1)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


@app.put("/preferences")
def update_preferences(body: HouseholdPreferencesSchema, db: Session = Depends(get_db)):
    prefs = db.get(models.HouseholdPreferences, 1)
    if not prefs:
        prefs = models.HouseholdPreferences(id=1)
        db.add(prefs)
    for k, v in body.model_dump().items():
        setattr(prefs, k, v)
    db.commit()
    db.refresh(prefs)
    return prefs


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
        "You are a helpful home chef assistant specialising in classic, time-tested recipes. "
        "Only generate traditional, well-established recipes — no trendy, fusion, or novelty dishes. "
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
def generate_meal_plan(body: GenerateMealPlanRequest, db: Session = Depends(get_db)):
    import anthropic

    # Load saved household preferences
    saved_prefs = db.get(models.HouseholdPreferences, 1)

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
        favorites = db.query(models.Recipe).filter(models.Recipe.is_favorite == True).all()
        if favorites:
            fav_list = "\n".join(
                f"  - {r.title}" + (f" (tags: {', '.join(r.tags)})" if r.tags else "")
                for r in favorites
            )
            favorites_context = (
                f"\n\nFavourite recipes to work into the plan (use their EXACT titles):\n{fav_list}\n"
                "Try to schedule 3-5 of these favourites across the week, primarily for Dinner. "
                "Use their exact title as-is so they can be matched back to the recipe library."
            )

    # Build pantry block
    pantry_context = ""
    if body.use_pantry:
        items = db.query(models.PantryItem).all()
        if items:
            pantry_list = ", ".join(f"{i.name} ({i.quantity} {i.unit})" for i in items)
            pantry_context = f"\n\nPantry items available to use up: {pantry_list}"

    system = (
        "You are a helpful meal planning assistant. Respond with ONLY a valid JSON object — "
        "no markdown, no code fences. The JSON must be an object with keys for each day of the week "
        "(Monday through Sunday). Each day is an object with keys: Breakfast, Lunch, Dinner, Snack. "
        "Each value is a short meal name string. Keep meal names concise (under 8 words). "
        "When scheduling a favourite recipe, use its EXACT title."
    )
    user_msg = (
        f"Create a weekly meal plan for the week of {body.week_start}.\n\n"
        f"Household preferences:\n{prefs_text}"
        f"{favorites_context}"
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
async def import_recipe_pdf(file: UploadFile = File(...)):
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


@app.post("/ai/import-recipe/url")
def import_recipe_url(body: ImportRecipeURLRequest):
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
