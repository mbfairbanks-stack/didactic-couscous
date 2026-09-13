"""Projection has to be right before the bucket plan means anything."""
from conftest import make_income


def set_schedule(client, **overrides):
    body = {
        "person": "Person 1",
        "gross_per_pay": 3000.0,
        "net_per_pay": 2000.0,
        "frequency": "biweekly",
        "anchor_date": "2026-01-09",
        "rrsp_employee_per_pay": 150.0,
        "rrsp_employer_per_pay": 75.0,
        "espp_per_pay": 100.0,
    }
    body.update(overrides)
    r = client.put("/pay-schedules", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_biweekly_three_pay_month_is_not_averaged(client):
    """From a 2026-01-09 anchor, May and October 2026 carry three paydays."""
    set_schedule(client)
    jan = client.get("/income/projection?year=2026&month=1").json()
    assert jan["gross"] == 6000.0     # 9th and 23rd
    assert jan["net"] == 4000.0

    may = client.get("/income/projection?year=2026&month=5").json()
    assert may["gross"] == 9000.0     # 1st, 15th, 29th — not 2.17 averaged
    assert may["net"] == 6000.0

    october = client.get("/income/projection?year=2026&month=10").json()
    assert october["gross"] == 9000.0  # 2nd, 16th, 30th


def test_semimonthly_is_always_two_pays(client):
    set_schedule(client, frequency="semimonthly", gross_per_pay=4000.0, net_per_pay=2800.0)
    for month in (1, 2, 7, 12):
        data = client.get(f"/income/projection?year=2026&month={month}").json()
        assert data["gross"] == 8000.0, month
        assert data["net"] == 5600.0, month


def test_monthly_frequency_is_one_pay(client):
    set_schedule(client, frequency="monthly", gross_per_pay=7000.0, net_per_pay=4900.0)
    data = client.get("/income/projection?year=2026&month=4").json()
    assert data["gross"] == 7000.0
    assert data["net"] == 4900.0


def test_recorded_pay_wins_over_schedule(client):
    set_schedule(client, frequency="monthly", gross_per_pay=7000.0, net_per_pay=4900.0)
    make_income(client, year=2026, month=4, amount=7500.0, net_amount=5100.0,
                pay_date="2026-04-30")

    data = client.get("/income/projection?year=2026&month=4").json()
    assert data["gross"] == 7500.0
    assert data["net"] == 5100.0
    assert data["people"][0]["source"] == "recorded"


def test_partly_recorded_month_is_topped_up(client):
    """One of two pays entered — the other still has to be projected."""
    set_schedule(client, frequency="semimonthly", gross_per_pay=4000.0, net_per_pay=2800.0)
    make_income(client, year=2026, month=5, amount=4100.0, net_amount=2850.0,
                pay_date="2026-05-15")

    data = client.get("/income/projection?year=2026&month=5").json()
    assert data["gross"] == 8100.0        # 4100 recorded + 4000 projected
    assert data["net"] == 5650.0          # 2850 recorded + 2800 projected
    person = data["people"][0]
    assert person["recorded_pays"] == 1
    assert person["expected_pays"] == 2
    assert person["source"] == "mixed"
    assert data["estimated"] is True


def test_falls_back_to_trailing_average_without_a_schedule(client):
    for month, gross in ((1, 6000.0), (2, 6400.0), (3, 6200.0)):
        make_income(client, year=2026, month=month, amount=gross,
                    net_amount=gross * 0.7, pay_date=f"2026-{month:02d}-15")

    data = client.get("/income/projection?year=2026&month=4").json()
    assert data["gross"] == 6200.0        # mean of 6000, 6400, 6200
    assert round(data["net"], 2) == 4340.0
    assert data["people"][0]["source"] == "average"


def test_no_schedule_and_no_history_projects_nothing(client):
    data = client.get("/income/projection?year=2026&month=4").json()
    assert data["gross"] == 0.0
    assert data["net"] == 0.0
    assert data["estimated"] is False


def test_missing_net_is_estimated_from_the_schedule_ratio(client):
    """A pay entered without its net figure must not read as zero take-home."""
    set_schedule(client, frequency="monthly", gross_per_pay=6000.0, net_per_pay=4200.0)
    make_income(client, year=2026, month=6, amount=6000.0, net_amount=None,
                pay_date="2026-06-30")

    data = client.get("/income/projection?year=2026&month=6").json()
    assert data["gross"] == 6000.0
    assert data["net"] == 4200.0          # 70% ratio applied to gross
    assert data["estimated"] is True


def test_projection_flows_into_the_bucket_plan(client):
    set_schedule(client, frequency="monthly", gross_per_pay=8000.0, net_per_pay=5000.0,
                 rrsp_employee_per_pay=500.0, espp_per_pay=300.0)

    data = client.get("/buckets/summary?year=2026&month=8").json()
    # 5000 take-home + 800 diverted before the deposit.
    assert data["plan_base"] == 5800.0
    assert data["income"]["gross"] == 8000.0
    assert data["income"]["net"] == 5000.0
    assert data["income"]["estimated"] is True

    by_bucket = {b["bucket"]: b for b in data["buckets"]}
    assert by_bucket["fixed"]["target_monthly"] == 3190.0        # 55%
    assert by_bucket["meaningful"]["actual"] == 800.0            # payroll savings


def test_schedule_rejects_bad_input(client):
    assert client.put("/pay-schedules", json={
        "person": "P", "frequency": "fortnightly"}).status_code == 400
    assert client.put("/pay-schedules", json={
        "person": "P", "frequency": "monthly", "anchor_date": "not-a-date"}).status_code == 400


def test_schedule_upsert_replaces_rather_than_duplicating(client):
    set_schedule(client, gross_per_pay=3000.0)
    set_schedule(client, gross_per_pay=3300.0)
    rows = client.get("/pay-schedules").json()
    assert len(rows) == 1
    assert rows[0]["gross_per_pay"] == 3300.0
