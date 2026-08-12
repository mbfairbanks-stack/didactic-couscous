"""Tests for the Worry-Free Money bucket rollup layer."""
import datetime
import pytest

import models


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cat(db, name, group="Needs", bucket="hard_limit"):
    cat = models.Category(name=name, group_name=group, default_bucket=bucket)
    db.add(cat)
    return cat


def _txn(db, category, amount, *, is_recurring=False, bucket_override=None,
         year=2026, month=8, day=10):
    t = models.Transaction(
        date=datetime.date(year, month, day),
        merchant="Test Merchant",
        amount=amount,
        category=category,
        year=year,
        month=month,
        is_fixed=False,
        is_recurring=is_recurring,
        bucket_override=bucket_override,
    )
    db.add(t)
    return t


def _bucket_target(db, bucket, amount, year=2026, month=None):
    bt = models.BucketTarget(bucket=bucket, year=year, month=month, amount=amount)
    db.add(bt)
    return bt


def _pay_date(db, date_str, year=None, month=None):
    """Insert a minimal Income row so the pay-period logic has a pay date."""
    d = datetime.date.fromisoformat(date_str)
    inc = models.Income(
        year=d.year if year is None else year,
        month=d.month if month is None else month,
        person="P1",
        income_type="base",
        amount=3000.0,
        pay_date=d,
    )
    db.add(inc)
    return inc


def _get_buckets(client, year=2026, month=8):
    r = client.get(f"/summary/buckets?year={year}&month={month}")
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Debt Payment split tests
# ---------------------------------------------------------------------------

class TestDebtPaymentSplit:
    def test_recurring_rows_go_to_fixed(self, client, db):
        _cat(db, "Debt Payment", bucket="fixed")
        _txn(db, "Debt Payment", 54.40,  is_recurring=True)
        _txn(db, "Debt Payment", 130.49, is_recurring=True)
        db.commit()

        data = _get_buckets(client)
        assert round(data["fixed"]["actual"], 2) == 184.89
        assert data["meaningful"]["actual"] == 0.0

    def test_non_recurring_row_goes_to_meaningful(self, client, db):
        _cat(db, "Debt Payment", bucket="fixed")
        _txn(db, "Debt Payment", 54.40,  is_recurring=True)
        _txn(db, "Debt Payment", 130.49, is_recurring=True)
        _txn(db, "Debt Payment", 500.00, is_recurring=False)   # extra paydown
        db.commit()

        data = _get_buckets(client)
        assert round(data["fixed"]["actual"], 2) == 184.89
        assert round(data["meaningful"]["actual"], 2) == 500.00

    def test_bucket_override_wins_over_split_logic(self, client, db):
        _cat(db, "Debt Payment", bucket="fixed")
        # Force a recurring debt-payment row into meaningful anyway
        _txn(db, "Debt Payment", 200.00, is_recurring=True, bucket_override="meaningful")
        db.commit()

        data = _get_buckets(client)
        assert data["fixed"]["actual"] == 0.0
        assert round(data["meaningful"]["actual"], 2) == 200.00


# ---------------------------------------------------------------------------
# Pets split tests
# ---------------------------------------------------------------------------

class TestPetsSplit:
    def test_recurring_pets_is_fixed(self, client, db):
        _cat(db, "Pets", bucket="fixed")
        _txn(db, "Pets", 150.00, is_recurring=True)   # food / insurance
        db.commit()

        data = _get_buckets(client)
        assert round(data["fixed"]["actual"], 2) == 150.00
        assert data["short_term"]["actual"] == 0.0

    def test_non_recurring_pets_is_short_term(self, client, db):
        _cat(db, "Pets", bucket="fixed")
        _txn(db, "Pets", 300.00, is_recurring=False)   # vet
        db.commit()

        data = _get_buckets(client)
        assert data["fixed"]["actual"] == 0.0
        assert round(data["short_term"]["actual"], 2) == 300.00

    def test_mixed_pets_split_correctly(self, client, db):
        _cat(db, "Pets", bucket="fixed")
        _txn(db, "Pets", 120.00, is_recurring=True)    # food → Fixed
        _txn(db, "Pets", 250.00, is_recurring=False)   # boarding → Short-Term
        db.commit()

        data = _get_buckets(client)
        assert round(data["fixed"]["actual"], 2) == 120.00
        assert round(data["short_term"]["actual"], 2) == 250.00


# ---------------------------------------------------------------------------
# Hard Limit remaining
# ---------------------------------------------------------------------------

class TestHardLimitRemaining:
    def test_remaining_with_monthly_target(self, client, db):
        _cat(db, "Groceries", bucket="hard_limit")
        _cat(db, "Dining",    bucket="hard_limit")
        _bucket_target(db, "hard_limit", 2000.00)   # year default, no month
        _txn(db, "Groceries", 800.00)
        _txn(db, "Dining",    200.00)
        db.commit()

        data = _get_buckets(client)
        assert data["hard_limit"]["actual"]    == 1000.00
        assert data["hard_limit"]["target"]    == 2000.00
        assert data["hard_limit"]["remaining"] == 1000.00

    def test_remaining_is_none_without_target(self, client, db):
        _cat(db, "Groceries", bucket="hard_limit")
        _txn(db, "Groceries", 500.00)
        db.commit()

        data = _get_buckets(client)
        assert data["hard_limit"]["remaining"] is None

    def test_period_remaining_uses_pay_dates(self, client, db):
        _cat(db, "Groceries", bucket="hard_limit")
        _bucket_target(db, "hard_limit", 2000.00)   # $1000/period

        # Pay dates: Aug 1 and Aug 15. Today falls inside Aug 1–Aug 14 period.
        _pay_date(db, "2026-08-01")
        _pay_date(db, "2026-08-15")

        # Spend $300 on Aug 5 (within current period) and $400 on Aug 20 (next period)
        _txn(db, "Groceries", 300.00, day=5)
        _txn(db, "Groceries", 400.00, day=20)
        db.commit()

        # period_actual depends on real today; we just check the structure is present
        data = _get_buckets(client)
        hl = data["hard_limit"]
        assert "period_start"     in hl
        assert "period_end"       in hl
        assert "period_actual"    in hl
        assert "period_target"    in hl
        assert "period_remaining" in hl
        assert hl["period_target"] == 1000.00   # 2000 / 2


# ---------------------------------------------------------------------------
# Bucket override on individual transactions
# ---------------------------------------------------------------------------

class TestBucketOverride:
    def test_override_moves_transaction_to_different_bucket(self, client, db):
        _cat(db, "Groceries", bucket="hard_limit")
        # Tag one Groceries transaction as short_term (e.g. stocking up for a trip)
        _txn(db, "Groceries", 100.00, bucket_override="short_term")
        db.commit()

        data = _get_buckets(client)
        assert data["hard_limit"]["actual"]  == 0.0
        assert data["short_term"]["actual"] == 100.00

    def test_category_breakdown_reflects_override(self, client, db):
        _cat(db, "Dining", bucket="hard_limit")
        _txn(db, "Dining", 60.00)                           # stays in hard_limit
        _txn(db, "Dining", 40.00, bucket_override="fixed")  # moved to fixed
        db.commit()

        data = _get_buckets(client)
        assert data["hard_limit"]["actual"] == 60.00
        assert data["fixed"]["actual"]      == 40.00


# ---------------------------------------------------------------------------
# Short-Term sinking funds (carry across months)
# ---------------------------------------------------------------------------

class TestSinkingFunds:
    def test_cumulative_spend_crosses_month_boundary(self, client, db):
        _cat(db, "Travel", group="Wants", bucket="short_term")
        _txn(db, "Travel", 400.00, year=2026, month=3, day=10)
        _txn(db, "Travel", 600.00, year=2026, month=6, day=20)
        db.commit()

        data = _get_buckets(client)   # through Aug 2026
        sf = data["short_term"]["sinking_funds"]["Travel"]
        assert sf["cumulative_spent"] == 1000.00

    def test_sinking_fund_balance_with_target(self, client, db):
        _cat(db, "Travel", group="Wants", bucket="short_term")
        # Set $150/month target for Travel in 2026
        db.add(models.BudgetTarget(category="Travel", year=2026, month=None, amount=150.00))
        # First transaction in Jan 2026 → through Aug = 8 months elapsed
        _txn(db, "Travel", 200.00, year=2026, month=1, day=15)
        _txn(db, "Travel", 400.00, year=2026, month=3, day=10)
        db.commit()

        data = _get_buckets(client)   # through Aug 2026
        sf = data["short_term"]["sinking_funds"]["Travel"]
        assert sf["cumulative_spent"]    == 600.00
        assert sf["months_tracked"]      == 8     # Jan → Aug inclusive
        assert sf["accumulated_target"]  == 1200.00
        assert sf["balance"]             == 600.00   # 1200 - 600 still available

    def test_sinking_fund_no_target_returns_none_balance(self, client, db):
        _cat(db, "Gifts", group="Wants", bucket="short_term")
        _txn(db, "Gifts", 75.00, year=2026, month=5, day=1)
        db.commit()

        data = _get_buckets(client)
        sf = data["short_term"]["sinking_funds"]["Gifts"]
        assert sf["cumulative_spent"] == 75.00
        assert sf["balance"] is None

    def test_pets_sinking_fund_excludes_recurring_rows(self, client, db):
        _cat(db, "Pets", bucket="fixed")   # Pets default is fixed; non-recurring go to short_term
        _txn(db, "Pets", 120.00, is_recurring=True,  year=2026, month=6)  # food → Fixed, not in sinking
        _txn(db, "Pets", 300.00, is_recurring=False, year=2026, month=7)  # vet → Short-Term sinking
        db.commit()

        data = _get_buckets(client)
        sf = data["short_term"]["sinking_funds"].get("Pets", {})
        # Only the non-recurring $300 counts toward the Pets sinking fund
        assert sf.get("cumulative_spent") == 300.00


# ---------------------------------------------------------------------------
# Bucket targets CRUD
# ---------------------------------------------------------------------------

class TestBucketTargetsCRUD:
    def test_upsert_and_retrieve(self, client):
        r = client.put("/bucket-targets", json={
            "bucket": "hard_limit", "year": 2026, "amount": 1800.00
        })
        assert r.status_code == 200

        r2 = client.get("/bucket-targets?year=2026")
        rows = r2.json()
        assert any(row["bucket"] == "hard_limit" and row["amount"] == 1800.00 for row in rows)

    def test_upsert_updates_existing(self, client):
        client.put("/bucket-targets", json={"bucket": "fixed", "year": 2026, "amount": 3000.00})
        client.put("/bucket-targets", json={"bucket": "fixed", "year": 2026, "amount": 3200.00})

        rows = client.get("/bucket-targets?year=2026").json()
        fixed_rows = [r for r in rows if r["bucket"] == "fixed"]
        assert len(fixed_rows) == 1
        assert fixed_rows[0]["amount"] == 3200.00
