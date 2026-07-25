import datetime

from conftest import make_txn


def make_debt(client, **overrides):
    body = {
        "name": "Car Loan",
        "creditor": "Bank",
        "debt_type": "loan",
        "interest_rate": 0.0,
        "initial_balance": 1000.0,
        "current_balance": 1000.0,
        "monthly_payment": 100.0,
        "initial_date": "2025-01-01",
    }
    body.update(overrides)
    r = client.post("/debts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_computed_balance_zero_interest(client):
    debt = make_debt(client, interest_rate=0.0)
    make_txn(client, date="2025-02-10", amount=100.0, category="Debt Payment",
             linked_debt_id=debt["id"], debt_direction="payment")
    make_txn(client, date="2025-03-10", amount=40.0, category="Debt Payment",
             linked_debt_id=debt["id"], debt_direction="charge")

    listed = {d["id"]: d for d in client.get("/debts").json()}
    # 1000 - 100 payment + 40 charge; no interest so months elapsed don't matter
    assert listed[debt["id"]]["computed_balance"] == 940.0


def test_computed_balance_one_month_interest(client):
    # Start on the 1st of the current month → exactly one interest application,
    # deterministic no matter what day the suite runs.
    first_of_month = datetime.date.today().replace(day=1).isoformat()
    debt = make_debt(client, interest_rate=0.12, initial_balance=1000.0,
                     initial_date=first_of_month)
    listed = {d["id"]: d for d in client.get("/debts").json()}
    assert listed[debt["id"]]["computed_balance"] == 1010.0  # 1000 * (1 + 0.12/12)


def test_no_computed_balance_without_initial_date(client):
    debt = make_debt(client, initial_date=None)
    listed = {d["id"]: d for d in client.get("/debts").json()}
    assert listed[debt["id"]]["computed_balance"] is None


def test_payments_summary_groups_by_debt_and_excludes_charges(client):
    d1 = make_debt(client, name="Loan A")
    d2 = make_debt(client, name="Loan B")
    make_txn(client, date="2025-03-05", amount=100.0, linked_debt_id=d1["id"], debt_direction="payment")
    make_txn(client, date="2025-03-15", amount=50.0, linked_debt_id=d1["id"])  # direction None counts as payment
    make_txn(client, date="2025-03-20", amount=75.0, linked_debt_id=d1["id"], debt_direction="charge")
    make_txn(client, date="2025-03-25", amount=30.0, linked_debt_id=d2["id"], debt_direction="payment")
    make_txn(client, date="2025-04-01", amount=999.0, linked_debt_id=d1["id"], debt_direction="payment")
    make_txn(client, date="2025-03-10", amount=20.0)  # unlinked

    r = client.get("/debts/payments-summary", params={"year": 2025, "month": 3})
    assert r.status_code == 200
    assert r.json()["paid"] == {str(d1["id"]): 150.0, str(d2["id"]): 30.0}
