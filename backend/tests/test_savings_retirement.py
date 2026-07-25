from conftest import make_income


def test_savings_summary_derives_from_income_records(client):
    """Income records are the single source for payroll savings (RRSP + ESPP)."""
    make_income(client, month=1, pay_date="2025-01-15", amount=5000.0,
                rrsp_employee=300.0, rrsp_employer=150.0, espp_deduction=500.0)
    make_income(client, month=2, pay_date="2025-02-15", amount=5000.0,
                rrsp_employee=300.0, rrsp_employer=150.0, espp_deduction=500.0)

    s = client.get("/savings-contributions/summary", params={"year": 2025}).json()
    assert s["rrsp_employee_ytd"] == 600.0
    assert s["rrsp_employer_ytd"] == 300.0
    assert s["rrsp_total_ytd"] == 900.0
    assert s["espp_deducted_ytd"] == 1000.0
    assert s["contributions"] == 2


def test_dead_savings_crud_endpoints_removed(client):
    assert client.get("/savings-contributions").status_code == 404
    assert client.get("/bills").status_code == 404
    # the Income-derived summary and asset sync remain
    assert client.get("/savings-contributions/summary", params={"year": 2025}).status_code == 200
    assert client.post("/assets/sync-savings").status_code == 200


def test_retirement_summary_required_portfolio_at_65(client):
    r = client.post("/assets", json={"name": "RRSP", "asset_type": "rrsp", "balance": 500000.0})
    assert r.status_code == 201, r.text

    r = client.post("/retirement/profiles", json={
        "year": 2025,
        "marginal_rate": 0.40,
        "current_age": 45,
        "target_retirement_age": 65,
        "target_annual_income": 80000.0,
        "expected_return": 0.075,
        "expected_inflation": 0.025,
        "cpp_monthly": 1000.0,
        "oas_monthly": 500.0,
        "cpp_start_age": 65,
        "swr": 0.035,
    })
    assert r.status_code == 201, r.text

    summary = client.get("/retirement/summary").json()
    assert summary["investable_assets"] == 500000.0
    prof = summary["profile"]
    # govt income = (1000 + 500) * 12 = 18000; required = (80000 - 18000) / 0.035
    assert prof["govt_annual_income"] == 18000.0
    assert prof["required_portfolio"] == round((80000 - 18000) / 0.035, 2)
    assert prof["cpp_adjustment_factor"] == 1.0
    assert prof["years_to_retirement"] == 20


def test_retirement_summary_cpp_early_takeup_factor(client):
    r = client.post("/retirement/profiles", json={
        "year": 2026,
        "current_age": 55,
        "target_retirement_age": 65,
        "target_annual_income": 60000.0,
        "cpp_monthly": 1000.0,
        "oas_monthly": 0.0,
        "cpp_start_age": 60,
        "swr": 0.04,
    })
    assert r.status_code == 201, r.text
    prof = client.get("/retirement/summary").json()["profile"]
    # 0.6%/month reduction for 60 months → factor 0.64
    assert prof["cpp_adjustment_factor"] == 0.64
    assert prof["cpp_annual_adjusted"] == round(1000 * 12 * 0.64, 2)
