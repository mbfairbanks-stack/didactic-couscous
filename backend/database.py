import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "sqlite:///./budget.db"

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
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
