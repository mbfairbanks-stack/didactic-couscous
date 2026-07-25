from conftest import make_txn, make_income


def seed(client):
    make_txn(client, date="2025-01-05", amount=100.0, category="Groceries")
    make_txn(client, date="2025-01-20", amount=50.0, category="Dining")
    make_txn(client, date="2025-02-10", amount=200.0, category="Groceries")
    make_income(client, month=1, amount=1000.0, pay_date="2025-01-15")
    make_income(client, month=2, amount=2000.0, pay_date="2025-02-15")


def test_monthly_summary_math(client):
    seed(client)
    rows = {r["month"]: r for r in client.get("/summary/monthly", params={"year": 2025}).json()}
    assert rows[1] == {"month": 1, "income": 1000.0, "expenses": 150.0, "balance": 850.0}
    assert rows[2] == {"month": 2, "income": 2000.0, "expenses": 200.0, "balance": 1800.0}
    assert rows[3]["income"] == 0 and rows[3]["expenses"] == 0


def test_category_summary_totals_and_order(client):
    seed(client)
    rows = client.get("/summary/categories", params={"year": 2025}).json()
    assert rows[0] == {"category": "Groceries", "total": 300.0, "count": 2}
    assert rows[1] == {"category": "Dining", "total": 50.0, "count": 1}

    jan = client.get("/summary/categories", params={"year": 2025, "month": 1}).json()
    assert {r["category"]: r["total"] for r in jan} == {"Groceries": 100.0, "Dining": 50.0}


def test_totals_summary(client):
    seed(client)
    t = client.get("/summary/totals", params={"year": 2025}).json()
    assert t["total_income"] == 3000.0
    assert t["total_expenses"] == 350.0
    assert t["balance"] == 2650.0
    assert t["savings_rate"] == round(2650 / 3000 * 100, 1)

    jan = client.get("/summary/totals", params={"year": 2025, "month": 1}).json()
    assert jan["total_expenses"] == 150.0

    thru = client.get("/summary/totals", params={"year": 2025, "through_month": 1}).json()
    assert thru["total_income"] == 1000.0


def test_daily_summary_groups_by_date(client):
    seed(client)
    make_txn(client, date="2025-01-05", amount=25.0, category="Coffee")
    rows = client.get("/summary/daily", params={"year": 2025, "month": 1}).json()
    assert {r["date"]: r["total"] for r in rows} == {"2025-01-05": 125.0, "2025-01-20": 50.0}


def test_category_trend_across_years(client):
    make_txn(client, date="2024-06-01", amount=80.0, category="Groceries")
    make_txn(client, date="2025-06-01", amount=120.0, category="Groceries")
    rows = client.get("/summary/category-trend", params={"category": "Groceries"}).json()
    assert rows == [
        {"year": 2024, "month": 6, "total": 80.0},
        {"year": 2025, "month": 6, "total": 120.0},
    ]
