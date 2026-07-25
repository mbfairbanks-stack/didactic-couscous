"""Tests for the redundancy-consolidation work: effective debt balances,
category auto-registration, and recurring-suggestion feedback."""
from conftest import make_txn


def make_debt(client, **overrides):
    body = {
        "name": "Tracked Loan", "creditor": "Bank", "debt_type": "loan",
        "interest_rate": 0.0, "initial_balance": 1000.0,
        "current_balance": 555.0,  # deliberately stale manual figure
        "monthly_payment": 100.0, "initial_date": "2025-01-01",
    }
    body.update(overrides)
    r = client.post("/debts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_effective_balance_prefers_computed_when_tracked(client):
    debt = make_debt(client)
    make_txn(client, date="2025-02-10", amount=100.0, category="Debt Payment",
             linked_debt_id=debt["id"], debt_direction="payment")
    listed = {d["id"]: d for d in client.get("/debts").json()}
    d = listed[debt["id"]]
    assert d["is_tracked"] is True
    assert d["effective_balance"] == 900.0  # not the stale 555 manual figure


def test_effective_balance_falls_back_to_manual(client):
    debt = make_debt(client, initial_date=None)
    listed = {d["id"]: d for d in client.get("/debts").json()}
    d = listed[debt["id"]]
    assert d["is_tracked"] is False
    assert d["effective_balance"] == 555.0


def test_retirement_summary_uses_effective_debt_balance(client):
    client.post("/assets", json={"name": "RRSP", "asset_type": "rrsp", "balance": 10000.0})
    debt = make_debt(client)  # tracked: computed 1000, manual says 555
    make_txn(client, date="2025-02-10", amount=200.0, category="Debt Payment",
             linked_debt_id=debt["id"], debt_direction="payment")
    s = client.get("/retirement/summary").json()
    assert s["total_debts"] == 800.0            # computed, not 555
    assert s["investable_assets"] == 9200.0


def test_networth_snapshot_uses_effective_debt_balance(client):
    client.post("/assets", json={"name": "Cash", "asset_type": "cash", "balance": 5000.0})
    make_debt(client)  # tracked, no payments -> computed = 1000 (0% interest)
    snap = client.post("/net-worth/snapshot").json()
    assert snap["total_debts"] == 1000.0
    assert snap["net_worth"] == 4000.0


def test_new_category_auto_registered_on_write(client):
    make_txn(client, category="Windsurfing Gear")
    names = {c["name"] for c in client.get("/category-definitions").json()}
    assert "Windsurfing Gear" in names
    # whitespace is normalized, not duplicated
    make_txn(client, category="  Windsurfing Gear  ", date="2025-04-01")
    all_names = [c["name"] for c in client.get("/category-definitions").json()]
    assert all_names.count("Windsurfing Gear") == 1


def test_recurring_suggestions_exclude_already_flagged(client):
    for m in (1, 2, 3, 4):
        make_txn(client, date=f"2025-0{m}-05", merchant="Netflix", amount=20.0,
                 category="Subscriptions")
        make_txn(client, date=f"2025-0{m}-05", merchant="Spotify", amount=12.0,
                 category="Subscriptions")
    merchants = {s["merchant"] for s in client.get("/transactions/recurring-suggestions").json()}
    assert {"Netflix", "Spotify"} <= merchants

    # Flag one Netflix transaction as recurring -> Netflix drops out of suggestions
    txn = client.get("/transactions", params={"category": "Subscriptions"}).json()[0]
    client.put(f"/transactions/{txn['id']}", json={"is_recurring": True})
    merchants = {s["merchant"] for s in client.get("/transactions/recurring-suggestions").json()}
    flagged = txn["merchant"]
    assert flagged not in merchants
