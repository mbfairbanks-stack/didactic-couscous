from conftest import make_income


def test_income_create_upserts_on_same_key(client):
    first = make_income(client, amount=1000.0)
    second = make_income(client, amount=1500.0)  # same year/month/person/type/pay_date
    assert second["id"] == first["id"]
    assert second["amount"] == 1500.0
    assert len(client.get("/income").json()) == 1


def test_income_update_and_delete(client):
    rec = make_income(client)
    r = client.put(f"/income/{rec['id']}", json={
        "year": 2025, "month": 3, "person": "Person 1", "income_type": "base",
        "amount": 999.0, "pay_date": "2025-03-15",
    })
    assert r.json()["amount"] == 999.0
    assert client.delete(f"/income/{rec['id']}").status_code == 204
    assert client.get("/income").json() == []
    assert client.delete(f"/income/{rec['id']}").status_code == 404


def test_budget_target_crud(client):
    r = client.post("/budget-targets", json={"category": "Groceries", "year": 2025, "month": 1, "amount": 600.0})
    assert r.status_code == 201
    tid = r.json()["id"]

    rows = client.get("/budget-targets", params={"year": 2025}).json()
    assert [t["amount"] for t in rows] == [600.0]

    r = client.put(f"/budget-targets/{tid}", json={"category": "Groceries", "year": 2025, "month": 1, "amount": 700.0})
    assert r.json()["amount"] == 700.0

    assert client.delete(f"/budget-targets/{tid}").status_code == 204
    assert client.get("/budget-targets", params={"year": 2025}).json() == []
