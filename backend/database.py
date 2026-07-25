import os
from contextvars import ContextVar
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from starlette.requests import Request

DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")
DB_PATH = os.getenv("DB_PATH", "demo.db" if DEMO_MODE else "budget.db")
DATABASE_URL = f"sqlite:///{DB_PATH}" if os.path.isabs(DB_PATH) else f"sqlite:///./{DB_PATH}"


def _set_sqlite_pragmas(dbapi_conn, _record):
    # WAL lets concurrent reads proceed during a write — a browser tab fires
    # many parallel requests at the same per-user DB file.
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


def _create_sqlite_engine(url: str):
    eng = create_engine(url, connect_args={"check_same_thread": False})
    event.listen(eng, "connect", _set_sqlite_pragmas)
    return eng


engine = _create_sqlite_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Multi-tenant: per-request engine routing
_engine_cache: dict = {}
_current_db_path: ContextVar = ContextVar("current_db_path", default=None)


class Base(DeclarativeBase):
    pass


def _make_engine(db_path: str):
    url = f"sqlite:///{db_path}" if os.path.isabs(db_path) else f"sqlite:///./{db_path}"
    return _create_sqlite_engine(url)


def get_engine_for_path(db_path: str):
    """Return a cached engine for db_path, initialising it on first access."""
    if db_path not in _engine_cache:
        eng = _make_engine(db_path)
        init_engine(eng, seed_demo=db_path.endswith("demo.db"))
        _engine_cache[db_path] = eng
    return _engine_cache[db_path]


def set_current_db_path(db_path):
    _current_db_path.set(db_path)


_sessionmaker_cache: dict = {}


def _get_sessionmaker(eng):
    sm = _sessionmaker_cache.get(eng)
    if sm is None:
        sm = sessionmaker(autocommit=False, autoflush=False, bind=eng)
        _sessionmaker_cache[eng] = sm
    return sm


def get_db(request: Request):
    # request.state.db_path is set by auth middleware; it survives the thread pool.
    # Fall back to ContextVar, then to the default engine.
    path = getattr(request.state, "db_path", None) or _current_db_path.get()
    eng = get_engine_for_path(path) if path else engine
    db = _get_sessionmaker(eng)()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Schema management — Alembic is the authority; seeding is separate.
# ---------------------------------------------------------------------------

import logging

_logger = logging.getLogger(__name__)

# Last revision before the consolidation migration. Databases without an
# alembic_version table (fresh ones, and per-user DBs created before Alembic
# ran on them) get stamped here, then upgraded — the consolidation migration
# is defensive, so it no-ops on schemas that are already current.
_PRE_CONSOLIDATION_REV = "fc124668f054"


def ensure_schema(eng):
    """Bring eng's database to the current Alembic head."""
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import inspect as sa_inspect

    cfg = Config(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", str(eng.url))

    if "alembic_version" not in sa_inspect(eng).get_table_names():
        command.stamp(cfg, _PRE_CONSOLIDATION_REV)
    try:
        command.upgrade(cfg, "head")
    except Exception:
        _logger.exception(
            "Alembic upgrade failed for %s — schema may be out of date", eng.url
        )


def seed_defaults(eng):
    """Idempotent seeding of app_settings defaults and the category list."""
    import sqlalchemy as sa

    with eng.connect() as conn:
        for k, v in [("household_name", "BudgetBot"), ("person_1", "Person 1"), ("person_2", "Person 2")]:
            conn.execute(
                sa.text("INSERT OR IGNORE INTO app_settings (key, value) VALUES (:k, :v)"),
                {"k": k, "v": v},
            )

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
                conn.execute(
                    sa.text('INSERT INTO categories (name, "group", is_legacy) VALUES (:n, :g, :l)'),
                    {"n": name, "g": group, "l": 0 if name in canonical else 1},
                )
        conn.commit()


def init_engine(eng, seed_demo: bool = False):
    """Full initialisation for any engine: tables, migrations, seeds."""
    import models as _models
    _models.Base.metadata.create_all(bind=eng)
    ensure_schema(eng)
    seed_defaults(eng)
    if seed_demo:
        from demo_seed import seed_demo_data
        seed_demo_data(eng)


def run_migrations():
    """Initialise the default engine (used at startup for legacy/single-user mode)."""
    init_engine(engine, seed_demo=DEMO_MODE)
