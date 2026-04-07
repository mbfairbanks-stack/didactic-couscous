from sqlalchemy import Column, Integer, String, Float, Date, Boolean, Text, JSON
from database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    servings = Column(Integer, default=4)
    prep_min = Column(Integer, default=0)
    cook_min = Column(Integer, default=0)
    ingredients = Column(JSON, nullable=False)  # list of {name, amount, unit}
    instructions = Column(Text, nullable=False)
    tags = Column(JSON, default=list)           # e.g. ["quick", "vegetarian"]
    is_favorite = Column(Boolean, default=False)
    source = Column(String, nullable=True)      # "ai" | "manual"
    notes = Column(Text, nullable=True)


class PantryItem(Base):
    __tablename__ = "pantry_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    unit = Column(String, nullable=False, default="")
    category = Column(String, nullable=False, default="Other")  # Produce, Dairy, Meat, Pantry, Freezer, Other
    expiry_date = Column(Date, nullable=True)
    notes = Column(String, nullable=True)


class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"

    id = Column(Integer, primary_key=True, index=True)
    week_start = Column(Date, nullable=False)   # Monday of the week
    day = Column(String, nullable=False)         # Monday..Sunday
    meal_type = Column(String, nullable=False)   # Breakfast, Lunch, Dinner, Snack
    recipe_id = Column(Integer, nullable=True)   # FK to recipes (optional)
    free_text = Column(String, nullable=True)    # free-form meal name


class PrepTask(Base):
    __tablename__ = "prep_tasks"

    id = Column(Integer, primary_key=True, index=True)
    week_start = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    scheduled_day = Column(String, nullable=True)   # day to do the prep
    is_done = Column(Boolean, default=False)
    source = Column(String, default="manual")       # "manual" | "ai"
