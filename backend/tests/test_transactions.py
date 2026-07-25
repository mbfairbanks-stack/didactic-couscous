from conftest import make_txn


def test_create_derives_year_month_from_date(client):
    txn = make_txn(client, date="2025-03-15", year=1999, month=1)
    assert txn["year"] == 2025
    assert txn["month"] == 3


def test_crud_roundtrip(client):
    txn = make_txn(client)
    txn_id = txn["id"]

    r = client.get("/transactions", params={"year": 2025, "month": 3})
    assert [t["id"] for t in r.json()] == [txn_id]

    r = client.put(f"/transactions/{txn_id}", json={"category": "Dining"})
    assert r.status_code == 200
    assert r.json()["category"] == "Dining"
    assert r.json()["amount"] == 100.0  # untouched fields survive partial update

    r = client.delete(f"/transactions/{txn_id}")
    assert r.status_code == 204
    assert client.get("/transactions").json() == []


def test_list_filters(client):
    make_txn(client, date="2025-01-10", merchant="A", category="Groceries")
    make_txn(client, date="2025-02-10", merchant="B", category="Dining")
    make_txn(client, date="2024-01-10", merchant="C", category="Groceries")

    assert len(client.get("/transactions", params={"year": 2025}).json()) == 2
    assert len(client.get("/transactions", params={"category": "Groceries"}).json()) == 2
    only = client.get("/transactions", params={"year": 2025, "category": "Groceries"}).json()
    assert [t["merchant"] for t in only] == ["A"]


def test_deduplicate_keeps_one(client):
    make_txn(client)
    make_txn(client)
    make_txn(client, merchant="Different")

    r = client.post("/deduplicate")
    assert r.json()["duplicates_removed"] == 1
    assert len(client.get("/transactions").json()) == 2


def test_auto_categorize_uses_merchant_history(client):
    make_txn(client, merchant="Metro", category="Groceries")
    make_txn(client, merchant="Metro", category="Groceries", date="2025-04-01")
    orphan = make_txn(client, merchant="Metro", category="Uncategorized", date="2025-05-01")
    stranger = make_txn(client, merchant="Nobody Knows", category="Uncategorized")

    r = client.post("/transactions/auto-categorize")
    assert r.json() == {"updated": 1, "skipped": 1}

    txns = {t["id"]: t for t in client.get("/transactions").json()}
    assert txns[orphan["id"]]["category"] == "Groceries"
    assert txns[stranger["id"]]["category"] == "Uncategorized"
