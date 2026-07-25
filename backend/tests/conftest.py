"""Test env must be configured before main/database are imported."""
import os
import sys
import tempfile

os.environ["MULTI_USER"] = "false"
os.environ["BUDGET_PASSWORD"] = ""
os.environ.pop("DEMO_MODE", None)
_tmpdir = tempfile.mkdtemp(prefix="budget-test-")
os.environ["DB_PATH"] = os.path.join(_tmpdir, "test.db")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    import main
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_db(client):
    """Each test starts from an empty database."""
    yield
    import database
    import models
    with database.SessionLocal() as s:
        for table in reversed(models.Base.metadata.sorted_tables):
            s.execute(table.delete())
        s.commit()


def make_txn(client, **overrides):
    body = {
        "date": "2025-03-15",
        "merchant": "Test Grocer",
        "amount": 100.0,
        "category": "Groceries",
        "year": 2025,
        "month": 3,
    }
    body.update(overrides)
    r = client.post("/transactions", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def make_income(client, **overrides):
    body = {
        "year": 2025,
        "month": 3,
        "person": "Person 1",
        "income_type": "base",
        "amount": 1000.0,
        "pay_date": "2025-03-15",
    }
    body.update(overrides)
    r = client.post("/income", json=body)
    assert r.status_code == 201, r.text
    return r.json()
