import os
import sqlite3
import tempfile

import sqlalchemy as sa


def test_legacy_db_upgraded_on_first_access(client):
    """A pre-Alembic database (old tables, missing modern columns) must come out
    of get_engine_for_path fully migrated, fixed up, and seeded."""
    import database

    path = os.path.join(tempfile.mkdtemp(prefix="legacy-"), "legacy.db")
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY, date DATE NOT NULL, merchant VARCHAR NOT NULL,
            amount FLOAT NOT NULL, category VARCHAR NOT NULL,
            year INTEGER NOT NULL, month INTEGER NOT NULL,
            is_fixed BOOLEAN, notes VARCHAR, source VARCHAR
        );
        CREATE TABLE income (
            id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
            person VARCHAR NOT NULL, income_type VARCHAR NOT NULL, amount FLOAT NOT NULL
        );
        INSERT INTO transactions (date, merchant, amount, category, year, month)
        VALUES ('2025-03-15', 'Legacy Store', 10.0, 'Misc', 1999, 1);
    """)
    conn.commit()
    conn.close()

    eng = database.get_engine_for_path(path)
    insp = sa.inspect(eng)

    tcols = {c["name"] for c in insp.get_columns("transactions")}
    assert {"is_recurring", "linked_debt_id", "debt_direction"} <= tcols
    icols = {c["name"] for c in insp.get_columns("income")}
    assert {"pay_date", "rrsp_employee", "rrsp_employer", "espp_deduction"} <= icols

    with eng.connect() as c:
        # year/month fixup derived from the date column
        assert c.execute(sa.text("SELECT year, month FROM transactions")).fetchone() == (2025, 3)
        # categories + app_settings seeded
        assert c.execute(sa.text("SELECT COUNT(*) FROM categories")).scalar() > 0
        assert c.execute(
            sa.text("SELECT value FROM app_settings WHERE key='household_name'")
        ).scalar() == "BudgetBot"
        # stamped at current head
        assert c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == "b7d3a9c41e02"


def test_fresh_user_db_initialised(client):
    import database

    path = os.path.join(tempfile.mkdtemp(prefix="fresh-"), "newuser.db")
    eng = database.get_engine_for_path(path)
    insp = sa.inspect(eng)

    assert "transactions" in insp.get_table_names()
    with eng.connect() as c:
        assert c.execute(sa.text("SELECT COUNT(*) FROM categories")).scalar() > 0
        assert c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == "b7d3a9c41e02"
