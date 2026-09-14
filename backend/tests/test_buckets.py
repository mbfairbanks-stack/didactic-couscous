from conftest import make_income, make_txn


def _set_plan(client, **pct):
    body = {"fixed": 55, "short_term": 10, "meaningful": 15, "guilt_free": 20}
    body.update(pct)
    r = client.put("/buckets/plan", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_plan_defaults_and_roundtrip(client):
    r = client.get("/buckets/plan")
    assert r.status_code == 200
    assert r.json()["plan"] == {"fixed": 55, "short_term": 10, "meaningful": 15, "guilt_free": 20}

    _set_plan(client, fixed=50, guilt_free=25)
    plan = client.get("/buckets/plan").json()["plan"]
    assert plan["fixed"] == 50
    assert plan["guilt_free"] == 25
    assert plan["short_term"] == 10


def test_summary_splits_spend_across_buckets(client):
    make_income(client, amount=5000.0)
    make_txn(client, category="Groceries", amount=800.0)     # fixed
    make_txn(client, category="Mortgage", amount=2000.0)     # fixed
    make_txn(client, category="Dining", amount=400.0)        # guilt-free
    make_txn(client, category="Travel", amount=300.0)        # guilt-free

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}

    assert by_bucket["fixed"]["actual"] == 2800.0
    assert by_bucket["guilt_free"]["actual"] == 700.0
    assert by_bucket["short_term"]["actual"] == 0.0
    assert data["plan_base"] == 5000.0
    assert data["unallocated"] == 1500.0


def test_payroll_savings_count_as_meaningful(client):
    """RRSP/ESPP never hit chequing, so they must still show up as savings."""
    # $4,000 gross, $800 of it diverted to RRSP/ESPP, $3,200 deposited.
    make_income(client, amount=4000.0, net_amount=3200.0,
                rrsp_employee=500.0, espp_deduction=300.0)
    make_txn(client, category="Groceries", amount=600.0)

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}

    assert by_bucket["meaningful"]["actual"] == 800.0
    assert data["income"]["gross"] == 4000.0
    assert data["income"]["net"] == 3200.0
    # Base is take-home plus the savings taken off the top — counted once.
    assert data["plan_base"] == 4000.0
    assert by_bucket["meaningful"]["target_amount"] == 600.0  # 15% of 4000


def test_plan_base_does_not_double_count_payroll_savings(client):
    """Regression: adding RRSP/ESPP to GROSS inflated every target."""
    make_income(client, amount=5000.0, net_amount=3500.0,
                rrsp_employee=600.0, espp_deduction=400.0)

    data = client.get("/buckets/summary?year=2025&month=3").json()
    # 3500 net + 1000 diverted = 4500, never 5000 + 1000.
    assert data["plan_base"] == 4500.0
    assert data["income"]["deductions"] == 1500.0


def test_savings_category_lands_in_short_term(client):
    make_income(client, amount=3000.0)
    make_txn(client, category="Short-Term Savings", merchant="Transfer", amount=450.0)

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}
    assert by_bucket["short_term"]["actual"] == 450.0


def test_reassigning_a_category_moves_the_money(client):
    make_income(client, amount=3000.0)
    make_txn(client, category="Groceries", amount=500.0)

    before = {b["bucket"]: b["actual"] for b in
              client.get("/buckets/summary?year=2025&month=3").json()["buckets"]}
    assert before["fixed"] == 500.0

    r = client.put("/buckets/mapping",
                   json={"entries": [{"name": "Groceries", "bucket": "guilt_free"}]})
    assert r.status_code == 200

    after = {b["bucket"]: b["actual"] for b in
             client.get("/buckets/summary?year=2025&month=3").json()["buckets"]}
    assert after["fixed"] == 0.0
    assert after["guilt_free"] == 500.0


def test_mapping_rejects_unknown_bucket(client):
    r = client.put("/buckets/mapping",
                   json={"entries": [{"name": "Groceries", "bucket": "nonsense"}]})
    assert r.status_code == 400


def test_unmapped_category_is_reported_not_dropped(client):
    make_income(client, amount=2000.0)
    make_txn(client, category="Some Ad-Hoc Thing", amount=125.0)
    # ensure_category registers it, so bucket it explicitly to nothing the map knows
    import database
    import models
    with database.SessionLocal() as s:
        cat = s.query(models.Category).filter_by(name="Some Ad-Hoc Thing").one()
        cat.bucket = None
        cat.group_name = "Unrecognised"
        s.commit()

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b["actual"] for b in data["buckets"]}
    # Falls back to guilt-free rather than vanishing from the totals.
    assert by_bucket["guilt_free"] == 125.0


def test_multi_month_summary_averages_per_month(client):
    make_income(client, month=1, amount=3000.0, pay_date="2025-01-15")
    make_income(client, month=2, amount=3000.0, pay_date="2025-02-15")
    make_txn(client, month=1, date="2025-01-10", category="Groceries", amount=400.0)
    make_txn(client, month=2, date="2025-02-10", category="Groceries", amount=600.0)

    data = client.get("/buckets/summary?year=2025&start_month=1&end_month=2").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}
    assert data["months"] == 2
    assert by_bucket["fixed"]["actual"] == 1000.0
    assert by_bucket["fixed"]["actual_monthly"] == 500.0
    assert data["plan_base_monthly"] == 3000.0


def test_trend_returns_only_months_with_activity(client):
    make_income(client, month=3, amount=3000.0)
    make_txn(client, month=3, category="Dining", amount=200.0)

    rows = client.get("/buckets/trend?year=2025").json()
    assert [r["month"] for r in rows] == [3]
    assert rows[0]["guilt_free"] == 200.0
    assert rows[0]["plan_base"] == 3000.0


def test_category_definitions_expose_buckets(client):
    # A Needs category defaults into fixed costs, a Wants one into guilt-free.
    client.post("/category-definitions", json={"name": "Water Bill", "group": "Needs"})
    client.post("/category-definitions", json={"name": "Board Games", "group": "Wants"})
    client.post("/category-definitions",
                json={"name": "TFSA Top-Up", "group": "Committed", "bucket": "meaningful"})

    by_name = {d["name"]: d for d in client.get("/category-definitions").json()}
    assert by_name["Water Bill"]["bucket"] == "fixed"
    assert by_name["Board Games"]["bucket"] == "guilt_free"
    assert by_name["TFSA Top-Up"]["bucket"] == "meaningful"

    cat_id = by_name["Board Games"]["id"]
    r = client.put(f"/category-definitions/{cat_id}", json={"bucket": "short_term"})
    assert r.status_code == 200 and r.json()["bucket"] == "short_term"
    assert client.put(f"/category-definitions/{cat_id}", json={"bucket": "bogus"}).status_code == 400


def test_insights_context_is_bucket_shaped(client):
    make_income(client, amount=5000.0, rrsp_employee=400.0)
    make_txn(client, category="Mortgage", amount=1800.0)
    make_txn(client, category="Dining", amount=350.0)

    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "## The Plan" in ctx
    assert "## Fixed Costs" in ctx
    assert "## Guilt-Free Spending" in ctx
    # Guilt-free must not be itemised — only the one number.
    guilt_free = ctx.split("## Guilt-Free Spending")[1].split("##")[0]
    assert "Dining" not in guilt_free
    assert "$350" in guilt_free
    # Fixed costs are itemised, because that is where the leverage is.
    assert "Mortgage" in ctx.split("## Fixed Costs")[1].split("##")[0]


def test_house_rules_reach_the_prompt(client):
    make_income(client, amount=4000.0)
    make_txn(client, category="Mortgage", amount=1500.0)

    r = client.put("/insights/house-rules", json={
        "house_rules": "Mortgage renews March 2027.\nDo not suggest moving.",
        "debt_stance": "avalanche",
    })
    assert r.status_code == 200

    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "Standing Instructions From The Household" in ctx
    assert "Mortgage renews March 2027." in ctx
    assert "Do not suggest moving." in ctx
    assert "highest interest rate first" in ctx

    assert client.get("/insights/house-rules").json()["debt_stance"] == "avalanche"


def test_house_rules_reject_unknown_stance(client):
    r = client.put("/insights/house-rules", json={"house_rules": "", "debt_stance": "vibes"})
    assert r.status_code == 400


def test_default_stance_when_unset(client):
    make_income(client, amount=4000.0)
    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "has not picked a payoff strategy" in ctx


def test_blank_category_becomes_uncategorized_in_guilt_free(client):
    """A blank category must not land as an empty string on a transaction."""
    make_income(client, amount=3000.0)
    r = client.post("/import-csv-rows", json=[
        {"date": "2025-03-18", "merchant": "Unknown Shop", "amount": 60.0, "category": ""},
    ])
    assert r.status_code == 200 and r.json()["imported"] == 1

    txns = client.get("/transactions?year=2025&month=3").json()
    names = {t["category"] for t in (txns["items"] if isinstance(txns, dict) else txns)}
    assert "" not in names
    assert "Uncategorized" in names

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}
    assert by_bucket["guilt_free"]["actual"] == 60.0
    assert by_bucket["fixed"]["actual"] == 0.0


# ── Committed outflows ──────────────────────────────────────────────────────

def make_bill(client, **overrides):
    body = {"name": "Mortgage", "amount": 2450.0, "frequency": "monthly",
            "category": "Mortgage"}
    body.update(overrides)
    r = client.post("/recurring-bills", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_recurring_bill_lands_in_its_categorys_bucket(client):
    bill = make_bill(client)
    assert bill["bucket"] == "fixed"
    assert bill["monthly_equivalent"] == 2450.0

    data = client.get("/buckets/summary?year=2025&month=3").json()
    by_bucket = {b["bucket"]: b for b in data["buckets"]}
    assert by_bucket["fixed"]["committed_monthly"] == 2450.0
    assert data["committed_monthly"] == 2450.0


def test_annual_bill_is_spread_over_the_year(client):
    make_bill(client, name="Home Insurance", amount=1800.0, frequency="annual",
              category="Insurance")
    data = client.get("/buckets/commitments").json()
    assert data["totals"]["fixed"] == 150.0     # 1800 / 12


def test_debt_minimum_is_fixed_and_extra_is_meaningful(client):
    r = client.post("/debts", json={
        "name": "Line of Credit", "creditor": "TD", "debt_type": "loc",
        "current_balance": 12000.0, "monthly_payment": 300.0, "monthly_extra": 200.0,
    })
    assert r.status_code == 201, r.text

    data = client.get("/buckets/commitments").json()
    assert data["totals"]["fixed"] == 300.0
    assert data["totals"]["meaningful"] == 200.0
    labels = [i["label"] for i in data["items"]["meaningful"]]
    assert any("extra principal" in l for l in labels)


def test_paid_off_debt_stops_being_a_commitment(client):
    client.post("/debts", json={
        "name": "Car Loan", "creditor": "RBC", "current_balance": 0.0,
        "monthly_payment": 450.0,
    })
    data = client.get("/buckets/commitments").json()
    assert data["totals"]["fixed"] == 0.0


def test_uncommitted_shows_what_the_target_leaves(client):
    make_income(client, amount=6000.0, net_amount=6000.0)
    make_bill(client, amount=2000.0)   # fixed commitment

    data = client.get("/buckets/summary?year=2025&month=3").json()
    fixed = next(b for b in data["buckets"] if b["bucket"] == "fixed")
    assert fixed["target_monthly"] == 3300.0            # 55% of 6000
    assert fixed["committed_monthly"] == 2000.0
    assert fixed["uncommitted_monthly"] == 1300.0       # room left inside the target


def test_recurring_bill_crud_roundtrip(client):
    bill = make_bill(client, name="Internet", amount=95.0, category="Internet")
    bid = bill["id"]

    updated = client.put(f"/recurring-bills/{bid}", json={
        "name": "Internet", "amount": 105.0, "frequency": "monthly", "category": "Internet",
    }).json()
    assert updated["amount"] == 105.0

    assert client.put(f"/recurring-bills/{bid}", json={
        "name": "Internet", "amount": 105.0, "frequency": "fortnightly",
    }).status_code == 400

    assert client.delete(f"/recurring-bills/{bid}").status_code == 204
    assert client.get("/recurring-bills").json() == []


def test_inactive_bill_is_not_committed(client):
    make_bill(client, is_active=False)
    assert client.get("/buckets/commitments").json()["total_monthly"] == 0.0


# ── Projection provenance in the AI context ─────────────────────────────────

def test_context_marks_projected_income_as_projected(client):
    client.put("/pay-schedules", json={
        "person": "Person 1", "gross_per_pay": 6000.0, "net_per_pay": 4000.0,
        "frequency": "monthly",
    })
    ctx = client.get("/insights/context?year=2026&month=11").json()["context"]
    assert "PROJECTED from their pay schedule" in ctx
    assert "is a projection, not a record" in ctx
    assert "do not present a variance against a projected base" in ctx


def test_context_does_not_cry_projection_for_recorded_income(client):
    make_income(client, amount=5000.0, net_amount=3800.0)
    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "entered from actual paycheques" in ctx
    assert "is a projection, not a record" not in ctx


def test_context_shows_committed_against_target(client):
    make_income(client, amount=6000.0, net_amount=6000.0)
    make_bill(client, name="Mortgage", amount=2000.0, category="Mortgage")

    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "Target vs actual vs committed" in ctx
    assert "Committed means set payments already decided" in ctx


def test_context_flags_a_bucket_committed_past_its_target(client):
    make_income(client, amount=4000.0, net_amount=4000.0)
    # 55% of 4000 is 2200; commit more than that.
    make_bill(client, name="Mortgage", amount=2600.0, category="Mortgage")

    ctx = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "over before any choices are made" in ctx


def test_context_reports_period_completeness(client):
    make_income(client, amount=4000.0, net_amount=4000.0)
    past = client.get("/insights/context?year=2025&month=3").json()["context"]
    assert "the whole period is in the past" in past

    future = client.get("/insights/context?year=2030&month=6").json()["context"]
    assert "entirely in the future" in future
    assert "running total" in future


def test_summary_lists_every_assigned_category_not_just_spending_ones(client):
    """"What is in this bucket" is a different question from "what was spent"."""
    make_income(client, amount=4000.0, net_amount=4000.0)
    make_txn(client, category="Dining", amount=200.0)
    client.post("/category-definitions",
                json={"name": "Board Games", "group": "Wants"})   # no spend

    data = client.get("/buckets/summary?year=2025&month=3").json()
    gf = next(b for b in data["buckets"] if b["bucket"] == "guilt_free")

    spending = {c["category"] for c in gf["categories"]}
    assigned = {c["category"]: c["amount"] for c in gf["assigned_categories"]}

    assert spending == {"Dining"}
    assert "Board Games" in assigned and assigned["Board Games"] == 0.0
    assert assigned["Dining"] == 200.0


def test_mapping_carries_spend_so_bulk_moves_are_informed(client):
    # Older than the 12-month window, so this also covers the all-time fallback.
    make_txn(client, category="Groceries", amount=800.0)
    make_txn(client, category="Dining", amount=250.0)

    data = client.get("/buckets/mapping").json()
    assert data["months"] is None, "stale-only data should fall back to all time"
    rows = data["categories"]
    by_name = {r["name"]: r for r in rows}
    assert by_name["Groceries"]["total"] == 800.0
    assert by_name["Groceries"]["count"] == 1
    assert by_name["Dining"]["total"] == 250.0
    # Biggest first, so a bulk move starts with what actually matters.
    assert [r["name"] for r in rows[:2]] == ["Groceries", "Dining"]


def test_bulk_mapping_move_reassigns_many_at_once(client):
    make_income(client, amount=5000.0, net_amount=5000.0)
    for cat in ("Dining", "Coffee", "Travel"):
        make_txn(client, category=cat, amount=100.0)

    r = client.put("/buckets/mapping", json={"entries": [
        {"name": "Dining", "bucket": "fixed"},
        {"name": "Coffee", "bucket": "fixed"},
        {"name": "Travel", "bucket": "short_term"},
    ]})
    assert r.status_code == 200 and r.json()["updated"] == 3

    by_bucket = {b["bucket"]: b["actual"] for b in
                 client.get("/buckets/summary?year=2025&month=3").json()["buckets"]}
    assert by_bucket["fixed"] == 200.0
    assert by_bucket["short_term"] == 100.0
    assert by_bucket["guilt_free"] == 0.0


def test_mapping_window_prefers_recent_spend(client):
    import datetime
    today = datetime.date.today()
    make_txn(client, date=today.isoformat(), year=today.year, month=today.month,
             category="Groceries", amount=500.0)
    # Well outside a 12-month window.
    make_txn(client, date="2019-04-10", year=2019, month=4,
             category="Dining", amount=9000.0)

    data = client.get("/buckets/mapping").json()
    assert data["months"] == 12
    by_name = {r["name"]: r for r in data["categories"]}
    assert by_name["Groceries"]["total"] == 500.0
    assert by_name["Dining"]["total"] == 0.0, "stale spend must not dominate the sort"
