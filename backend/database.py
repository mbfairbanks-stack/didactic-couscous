import os
from contextvars import ContextVar
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")
DB_PATH = os.getenv("DB_PATH", "demo.db" if DEMO_MODE else "budget.db")
DATABASE_URL = f"sqlite:///{DB_PATH}" if os.path.isabs(DB_PATH) else f"sqlite:///./{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Multi-tenant: per-request engine routing
_engine_cache: dict = {}
_current_db_path: ContextVar = ContextVar("current_db_path", default=None)


class Base(DeclarativeBase):
    pass


def _make_engine(db_path: str):
    url = f"sqlite:///{db_path}" if os.path.isabs(db_path) else f"sqlite:///./{db_path}"
    return create_engine(url, connect_args={"check_same_thread": False})


def get_engine_for_path(db_path: str):
    """Return a cached engine for db_path, initialising it on first access."""
    if db_path not in _engine_cache:
        eng = _make_engine(db_path)
        import models as _models
        _models.Base.metadata.create_all(bind=eng)
        _init_db_extras(eng, seed_demo=False)
        _engine_cache[db_path] = eng
    return _engine_cache[db_path]


def set_current_db_path(db_path):
    _current_db_path.set(db_path)


def get_db():
    path = _current_db_path.get()
    eng = get_engine_for_path(path) if path else engine
    Session = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def _init_db_extras(eng, seed_demo: bool = False):
    """Idempotent schema patches + optional demo seeding for any engine."""
    import sqlalchemy as sa
    from sqlalchemy import inspect as sa_inspect

    with eng.connect() as conn:
        inspector = sa_inspect(eng)
        tables = inspector.get_table_names()

        # app_settings
        if "app_settings" not in tables:
            conn.execute(sa.text("""
                CREATE TABLE app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """))
            for k, v in [("household_name", "BudgetBot"), ("person_1", "Person 1"), ("person_2", "Person 2")]:
                conn.execute(sa.text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"), {"k": k, "v": v})

        # categories
        if "categories" not in tables:
            conn.execute(sa.text("""
                CREATE TABLE categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    group_name TEXT NOT NULL,
                    is_legacy INTEGER NOT NULL DEFAULT 0
                )
            """))
        cat_cols = [c["name"] for c in inspector.get_columns("categories")] if "categories" in tables else []
        if "is_hidden" not in cat_cols:
            conn.execute(sa.text("ALTER TABLE categories ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0"))
        if "parent_name" not in cat_cols:
            conn.execute(sa.text("ALTER TABLE categories ADD COLUMN parent_name TEXT"))
        cat_count = conn.execute(sa.text("SELECT COUNT(*) FROM categories")).scalar()
        if cat_count == 0:
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
                is_leg = 0 if name in canonical else 1
                conn.execute(sa.text(
                    "INSERT INTO categories (name, group_name, is_legacy) VALUES (:n, :g, :l)"
                ), {"n": name, "g": group, "l": is_leg})

        # transactions extras
        if "transactions" in tables:
            t_cols = [c["name"] for c in inspector.get_columns("transactions")]
            if "is_recurring" not in t_cols:
                conn.execute(sa.text("ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0"))
            conn.execute(sa.text("UPDATE transactions SET is_recurring = 0 WHERE is_recurring IS NULL"))
            conn.execute(sa.text("UPDATE transactions SET is_fixed = 0 WHERE is_fixed IS NULL"))
            conn.execute(sa.text("""
                UPDATE transactions
                SET year  = CAST(strftime('%Y', date) AS INTEGER),
                    month = CAST(strftime('%m', date) AS INTEGER)
                WHERE year  != CAST(strftime('%Y', date) AS INTEGER)
                   OR month != CAST(strftime('%m', date) AS INTEGER)
            """))

        # income extras
        if "income" in tables:
            i_cols = [c["name"] for c in inspector.get_columns("income")]
            for col in ("rrsp_employee", "rrsp_employer", "espp_deduction"):
                if col not in i_cols:
                    conn.execute(sa.text(f"ALTER TABLE income ADD COLUMN {col} REAL NOT NULL DEFAULT 0"))

        # assets extras
        if "assets" in tables:
            a_cols = [c["name"] for c in inspector.get_columns("assets")]
            if "auto_sync" not in a_cols:
                conn.execute(sa.text("ALTER TABLE assets ADD COLUMN auto_sync INTEGER NOT NULL DEFAULT 0"))

        # debts extras
        if "debts" in tables:
            d_cols = [c["name"] for c in inspector.get_columns("debts")]
            for col, default in [("debt_type", "'loan'"), ("credit_limit", "0"), ("interest_rate", "0")]:
                if col not in d_cols:
                    conn.execute(sa.text(f"ALTER TABLE debts ADD COLUMN {col} REAL NOT NULL DEFAULT {default}"))

        conn.commit()

    if seed_demo:
        from demo_seed import seed_demo_data
        seed_demo_data(eng)


def run_migrations():
    """Initialise the default engine (used at startup for legacy/single-user mode)."""
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import inspect as sa_inspect

    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))

    # Fresh DB — stamp Alembic as head instead of running conflicting migrations
    tables = sa_inspect(engine).get_table_names()
    if "alembic_version" not in tables:
        command.stamp(alembic_cfg, "head")
    else:
        try:
            command.upgrade(alembic_cfg, "head")
        except Exception:
            pass  # Ignore circular-dependency errors from batch migrations on existing DBs

    _init_db_extras(engine, seed_demo=DEMO_MODE)
