"""Seed a fresh demo database with realistic fake budget data."""
import sqlalchemy as sa
from datetime import date


MONTHLY_EXPENSES = [
    # (category, merchant, amount, is_fixed, is_recurring)
    ("Mortgage",      "RBC Mortgage",      2450.00, True,  True),
    ("Natural Gas",   "Direct Energy",      118.00, False, True),
    ("Hydro",         "City Hydro",          92.00, False, True),
    ("Internet",      "Shaw",                85.00, True,  True),
    ("Mobile",        "Rogers",             110.00, True,  True),
    ("Insurance",     "Intact Insurance",   220.00, True,  True),
    ("Security",      "ADT",                 35.00, True,  True),
    ("Groceries",     "Superstore",         310.00, False, False),
    ("Groceries",     "Save-On-Foods",      195.00, False, False),
    ("Groceries",     "Costco",             145.00, False, False),
    ("Transportation","Esso",                92.00, False, False),
    ("Transportation","Uber",                48.00, False, False),
    ("Dining",        "Local Bistro",        85.00, False, False),
    ("Dining",        "Thai Garden",         62.00, False, False),
    ("Dining",        "Sushi Palace",        74.00, False, False),
    ("Coffee",        "Starbucks",           48.00, False, False),
    ("Coffee",        "Tim Hortons",         22.00, False, False),
    ("Entertainment", "Netflix",             18.00, True,  True),
    ("Entertainment", "Movies",              38.00, False, False),
    ("Subscriptions", "Spotify",             15.00, True,  True),
    ("Fitness",       "GoodLife",            50.00, True,  True),
    ("Pets",          "PetSmart",            78.00, False, False),
    ("Misc",          "Amazon",              82.00, False, False),
]

OCCASIONAL = [
    # (month, category, merchant, amount) — 2025 only
    (1,  "Clothes",       "H&M",             145.00),
    (2,  "Medical",       "Rexall Pharmacy",  82.00),
    (3,  "Home",          "Home Depot",      215.00),
    (4,  "Gifts",         "Amazon",           94.00),
    (5,  "Clothes",       "Lululemon",       178.00),
    (6,  "Travel",        "WestJet",         845.00),
    (6,  "Travel",        "Airbnb",          615.00),
    (7,  "Entertainment", "Canada's Wonderland", 108.00),
    (8,  "Medical",       "Shoppers Drug Mart",  68.00),
    (9,  "Home",          "IKEA",            335.00),
    (10, "Charity",       "Heart & Stroke",   50.00),
    (11, "Gifts",         "Best Buy",        275.00),
    (12, "Gifts",         "Various",         445.00),
    (12, "Clothes",       "The Bay",         155.00),
]

BUDGET_DEFAULTS = [
    ("Mortgage", 2450), ("Natural Gas", 130), ("Hydro", 110),
    ("Internet", 85),   ("Mobile", 110),      ("Insurance", 220),
    ("Security", 35),   ("Groceries", 700),   ("Transportation", 160),
    ("Dining", 250),    ("Coffee", 80),        ("Entertainment", 100),
    ("Subscriptions", 40), ("Fitness", 50),   ("Pets", 80),
    ("Misc", 100),      ("Clothes", 150),     ("Medical", 100),
    ("Home", 200),      ("Gifts", 150),       ("Travel", 500),
    ("Charity", 50),
]


def seed_demo_data(engine):
    with engine.connect() as conn:
        count = conn.execute(sa.text("SELECT COUNT(*) FROM transactions")).scalar()
        if count > 0:
            return  # already seeded

        # Settings
        for k, v in [
            ("household_name",    "Demo Family"),
            ("person_1",          "Alex"),
            ("person_2",          "Jordan"),
            ("onboarding_complete", "true"),
        ]:
            conn.execute(
                sa.text("INSERT OR REPLACE INTO app_settings (key, value) VALUES (:k, :v)"),
                {"k": k, "v": v},
            )

        # Transactions: 2025 full year + 2026 Q1
        all_periods = [(2025, m) for m in range(1, 13)] + [(2026, m) for m in range(1, 4)]
        for year, month in all_periods:
            for cat, merchant, base_amt, is_fixed, is_recurring in MONTHLY_EXPENSES:
                # Small deterministic variation ±8%
                variation = 1.0 + ((month * 13 + int(base_amt)) % 17 - 8) / 100
                amt = round(base_amt * variation, 2)
                day = 15 if is_fixed else min((month * 7 + int(base_amt)) % 26 + 1, 28)
                conn.execute(sa.text(
                    "INSERT INTO transactions (date, merchant, amount, category, year, month,"
                    " is_fixed, is_recurring) VALUES (:d, :m, :a, :c, :y, :mo, :f, :r)"
                ), {"d": date(year, month, day), "m": merchant, "a": amt, "c": cat,
                    "y": year, "mo": month, "f": int(is_fixed), "r": int(is_recurring)})

            # Occasional expenses (2025 only, 2026 Jan-Mar get a few)
            for occ_month, cat, merchant, amt in OCCASIONAL:
                if occ_month == month and year == 2025:
                    conn.execute(sa.text(
                        "INSERT INTO transactions (date, merchant, amount, category, year, month,"
                        " is_fixed, is_recurring) VALUES (:d, :m, :a, :c, :y, :mo, 0, 0)"
                    ), {"d": date(year, month, 20), "m": merchant, "a": amt, "c": cat,
                        "y": year, "mo": month})

        # 2026 Q1 occasional
        for year, month, cat, merchant, amt in [
            (2026, 1, "Clothes",  "H&M",           138.00),
            (2026, 2, "Medical",  "Rexall",          75.00),
            (2026, 3, "Home",     "Canadian Tire",  195.00),
        ]:
            conn.execute(sa.text(
                "INSERT INTO transactions (date, merchant, amount, category, year, month,"
                " is_fixed, is_recurring) VALUES (:d, :m, :a, :c, :y, :mo, 0, 0)"
            ), {"d": date(year, month, 20), "m": merchant, "a": amt, "c": cat,
                "y": year, "mo": month})

        # Income: Alex (bi-weekly base) + Jordan (bi-weekly base + quarterly commission)
        for year, month in all_periods:
            for pay_day, person, inc_type, amt in [
                (1,  "Alex",   "base",       3850.00),
                (15, "Alex",   "base",       3850.00),
                (1,  "Jordan", "base",       2900.00),
                (15, "Jordan", "base",       2900.00),
            ]:
                conn.execute(sa.text(
                    "INSERT INTO income (year, month, person, income_type, amount, pay_date)"
                    " VALUES (:y, :m, :p, :t, :a, :d)"
                ), {"y": year, "m": month, "p": person, "t": inc_type,
                    "a": amt, "d": date(year, month, pay_day)})
            # Jordan commission: Mar, Jun, Sep, Dec
            if month in (3, 6, 9, 12):
                conn.execute(sa.text(
                    "INSERT INTO income (year, month, person, income_type, amount, pay_date)"
                    " VALUES (:y, :m, :p, :t, :a, :d)"
                ), {"y": year, "m": month, "p": "Jordan", "t": "commission",
                    "a": 1500.00, "d": date(year, month, 20)})

        # Budget targets
        for year in (2025, 2026):
            for cat, amt in BUDGET_DEFAULTS:
                conn.execute(sa.text(
                    "INSERT OR IGNORE INTO budget_targets (category, year, month, amount)"
                    " VALUES (:c, :y, NULL, :a)"
                ), {"c": cat, "y": year, "a": float(amt)})

        conn.commit()
        print("Demo data seeded successfully.")
