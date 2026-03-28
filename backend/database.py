from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "sqlite:///./budget.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def run_migrations():
    """Idempotent schema migrations."""
    with engine.connect() as conn:
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(income)"))]
        if "pay_date" not in cols:
            # Recreate income table with pay_date + updated unique constraint
            conn.execute(text("""
                CREATE TABLE income_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    person VARCHAR NOT NULL,
                    income_type VARCHAR NOT NULL,
                    amount FLOAT NOT NULL,
                    pay_date DATE,
                    UNIQUE (year, month, person, income_type, pay_date)
                )
            """))
            conn.execute(text("""
                INSERT INTO income_new (id, year, month, person, income_type, amount)
                SELECT id, year, month, person, income_type, amount FROM income
            """))
            conn.execute(text("DROP TABLE income"))
            conn.execute(text("ALTER TABLE income_new RENAME TO income"))
            conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
