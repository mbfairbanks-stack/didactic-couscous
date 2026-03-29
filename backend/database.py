import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")
DB_PATH = os.getenv("DB_PATH", "demo.db" if DEMO_MODE else "budget.db")
DATABASE_URL = f"sqlite:///./{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def run_migrations():
    """Apply all pending Alembic migrations at startup."""
    from alembic.config import Config
    from alembic import command

    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
    command.upgrade(alembic_cfg, "head")

    # Idempotent inline migrations for columns not yet covered by Alembic revisions
    from sqlalchemy import inspect as sa_inspect
    import sqlalchemy as sa
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        op = Operations(ctx)
        inspector = sa_inspect(engine)

        # Add is_recurring to transactions if missing
        cols = [c['name'] for c in inspector.get_columns('transactions')]
        if 'is_recurring' not in cols:
            op.add_column('transactions', sa.Column('is_recurring', sa.Boolean(), server_default='0', nullable=True))
        # Backfill any NULL values left by the migration
        conn.execute(sa.text("UPDATE transactions SET is_recurring = 0 WHERE is_recurring IS NULL"))
        conn.execute(sa.text("UPDATE transactions SET is_fixed = 0 WHERE is_fixed IS NULL"))

        # Create app_settings table if missing
        tables = inspector.get_table_names()
        if "app_settings" not in tables:
            conn.execute(sa.text("""
                CREATE TABLE app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """))
            # Seed defaults
            for k, v in [("household_name", "BudgetBot"), ("person_1", "Person 1"), ("person_2", "Person 2")]:
                conn.execute(sa.text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"), {"k": k, "v": v})

        # Create categories table if missing and seed from categories.py
        if "categories" not in tables:
            conn.execute(sa.text("""
                CREATE TABLE categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    group_name TEXT NOT NULL,
                    is_legacy INTEGER NOT NULL DEFAULT 0
                )
            """))
            from categories import CATEGORY_GROUPS
            canonical = {
                "Mortgage", "Natural Gas", "Hydro", "Groceries", "Pets",
                "Transportation", "Internet", "Security", "Mobile", "Insurance",
                "Municipal Taxes", "Debt Payment", "Medical",
                "Entertainment", "Dining", "Coffee", "Alcohol", "Cannabis",
                "Clothes", "Gifts", "Charity", "Travel", "Fitness", "Home",
                "Entertainment Subscriptions", "Subscriptions",
                "Health & Beauty", "Canva Sub", "Ipsy Sub", "Misc",
            }
            for name, group in CATEGORY_GROUPS.items():
                is_legacy = 0 if name in canonical else 1
                conn.execute(sa.text(
                    "INSERT INTO categories (name, group_name, is_legacy) VALUES (:n, :g, :l)"
                ), {"n": name, "g": group, "l": is_legacy})

        conn.commit()

    # Seed demo data on first run in demo mode
    if DEMO_MODE:
        from demo_seed import seed_demo_data
        seed_demo_data(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
