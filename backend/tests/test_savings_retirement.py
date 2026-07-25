def test_savings_contribution_auto_calculations(client):
    r = client.post("/savings-contributions", json={
        "pay_date": "2025-06-15", "year": 2025, "month": 6,
        "gross_income": 5000.0, "rrsp_employee": 300.0,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["rrsp_employer"] == 150.0   # 50% match
    assert body["espp_deduction"] == 500.0  # 10% before May 2026


def test_espp_rate_changes_may_2026(client):
    r = client.post("/savings-contributions", json={
        "pay_date": "2026-06-15", "year": 2026, "month": 6,
        "gross_income": 5000.0, "rrsp_employee": 0.0,
    })
    assert r.json()["espp_deduction"] == 750.0  # 15% from May 2026


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
