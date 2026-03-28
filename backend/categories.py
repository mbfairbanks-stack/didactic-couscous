"""
Single source of truth for canonical category names and their NEEDS/WANTS grouping.

Keep frontend/src/constants.js in sync with this file whenever categories are added or changed.
"""

# canonical_name -> group ("Needs" or "Wants")
CATEGORY_GROUPS: dict[str, str] = {
    # --- Needs (non-discretionary) ---
    "Mortgage": "Needs",
    "Natural Gas": "Needs",       # renamed from "Gas (Utility)"
    "Gas (Utility)": "Needs",     # kept for backward compat with existing transactions
    "Hydro": "Needs",
    "Groceries": "Needs",
    "Pets": "Needs",              # consolidated: Pet Food & Toys, Vet, Pet Insurance → Pets
    "Pet Food & Toys": "Needs",   # kept for backward compat
    "Day Care": "Needs",
    "Vet": "Needs",               # kept for backward compat
    "Pet Insurance": "Needs",     # kept for backward compat
    "Transportation": "Needs",    # public transit / bus passes
    "Internet": "Needs",
    "Security": "Needs",
    "Mobile": "Needs",
    "Insurance": "Needs",         # consolidated: Car Insurance, Home Insurance → Insurance
    "Car Insurance": "Needs",     # kept for backward compat
    "Home Insurance": "Needs",    # kept for backward compat
    "Municipal Taxes": "Needs",
    "Debt Payment": "Needs",
    "Reliance": "Needs",
    "Medical": "Needs",           # new: pharmacy, doctor, dentist, prescriptions
    # --- Wants (discretionary) ---
    "Entertainment": "Wants",
    "Dining": "Wants",
    "Take Out": "Wants",     # kept for backward compat — migrates to Dining
    "Clothes": "Wants",
    "Gifts": "Wants",
    "Charity": "Wants",
    "Travel": "Wants",
    "Coffee": "Wants",
    "Home": "Wants",
    "Misc": "Wants",
    "Fuel": "Wants",              # renamed from "Gas" (vehicle fuel)
    "Gas": "Wants",               # kept for backward compat
    "Car Maintenance": "Wants",   # renamed from "Car"
    "Car": "Wants",               # kept for backward compat
    "Car Payment": "Wants",
    "Uber": "Wants",
    "Alcohol": "Wants",
    "Cannabis": "Wants",
    "Fitness": "Wants",           # new: gym, sports, recreation (curling, etc.)
    "Newspaper": "Wants",
    "Health & Beauty": "Wants",
    "Subscriptions": "Wants",     # new: catch-all for streaming/digital subscriptions
    "Apple Sub": "Wants",
    "Spotify": "Wants",
    "Prime Video": "Wants",
    "Netflix": "Wants",
    "YouTube": "Wants",
    "Canva Sub": "Wants",
    "Ipsy Sub": "Wants",
}

NEEDS: set[str] = {cat for cat, group in CATEGORY_GROUPS.items() if group == "Needs"}
WANTS: set[str] = {cat for cat, group in CATEGORY_GROUPS.items() if group == "Wants"}


def get_category_group(category: str) -> str:
    return CATEGORY_GROUPS.get(category, "Other")


# Suggested renames for existing transactions (old → new).
# Apply via the /categories/migrate endpoint.
SUGGESTED_RENAMES: dict[str, str] = {
    "Gas (Utility)": "Natural Gas",
    "Gas": "Fuel",
    "Car": "Car Maintenance",
    "Pet Food & Toys": "Pets",
    "Vet": "Pets",
    "Pet Insurance": "Pets",
    "Car Insurance": "Insurance",
    "Home Insurance": "Insurance",
    "Take Out": "Dining",
}
