"""
Single source of truth for canonical category names and their NEEDS/WANTS grouping.

Keep frontend/src/constants.js in sync with this file whenever categories are added or changed.
"""

# canonical_name -> group ("Needs" or "Wants")
CATEGORY_GROUPS: dict[str, str] = {
    # --- Needs (non-discretionary) ---
    "Mortgage": "Needs",
    "Gas (Utility)": "Needs",
    "Hydro": "Needs",
    "Groceries": "Needs",
    "Pets": "Needs",
    "Pet Food & Toys": "Needs",
    "Day Care": "Needs",
    "Vet": "Needs",
    "Pet Insurance": "Needs",
    "Transportation": "Needs",
    "Internet": "Needs",
    "Security": "Needs",
    "Mobile": "Needs",
    "Insurance": "Needs",
    "Car Insurance": "Needs",
    "Home Insurance": "Needs",
    "Municipal Taxes": "Needs",
    "Debt Payment": "Needs",
    "Reliance": "Needs",
    # --- Wants (discretionary) ---
    "Entertainment": "Wants",
    "Dining": "Wants",
    "Take Out": "Wants",
    "Clothes": "Wants",
    "Gifts": "Wants",
    "Charity": "Wants",
    "Travel": "Wants",
    "Coffee": "Wants",
    "Home": "Wants",
    "Misc": "Wants",
    "Gas": "Wants",
    "Car": "Wants",
    "Car Payment": "Wants",
    "Uber": "Wants",
    "Alcohol": "Wants",
    "Cannabis": "Wants",
    "Newspaper": "Wants",
    "Health & Beauty": "Wants",
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
