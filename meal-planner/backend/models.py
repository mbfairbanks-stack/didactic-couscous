from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, JSON, ForeignKey
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    servings = Column(Integer, default=4)
    prep_min = Column(Integer, default=0)
    cook_min = Column(Integer, default=0)
    ingredients = Column(JSON, nullable=False)
    instructions = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    is_favorite = Column(Boolean, default=False)
    is_public = Column(Boolean, default=False)
    source = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    times_made = Column(Integer, default=0)
    last_made = Column(Date, nullable=True)


class PantryItem(Base):
    __tablename__ = "pantry_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    unit = Column(String, nullable=False, default="")
    category = Column(String, nullable=False, default="Other")
    expiry_date = Column(Date, nullable=True)
    notes = Column(String, nullable=True)


class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    week_start = Column(Date, nullable=False)
    day = Column(String, nullable=False)
    meal_type = Column(String, nullable=False)
    recipe_id = Column(Integer, nullable=True)
    free_text = Column(String, nullable=True)
    cooked_at = Column(DateTime, nullable=True)


class PrepTask(Base):
    __tablename__ = "prep_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    week_start = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    scheduled_day = Column(String, nullable=True)
    is_done = Column(Boolean, default=False)
    source = Column(String, default="manual")


class HouseholdPreferences(Base):
    __tablename__ = "household_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True, index=True)
    servings = Column(Integer, default=4)
    dietary_restrictions = Column(Text, default="")
    cuisine_preferences = Column(Text, default="")
    avoid = Column(Text, default="")
    notes = Column(Text, default="")
    onboarding_done = Column(Boolean, default=False)
    week_start_day = Column(String, default="Monday")
