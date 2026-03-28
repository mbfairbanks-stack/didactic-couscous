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
    "Transportation": "Needs",    # all transport: transit, car, fuel, uber
    "Internet": "Needs",
    "Security": "Needs",
    "Mobile": "Needs",
    "Insurance": "Needs",         # consolidated: Car Insurance, Home Insurance → Insurance
    "Car Insurance": "Needs",     # kept for backward compat
    "Home Insurance": "Needs",    # kept for backward compat
    "Municipal Taxes": "Needs",
    "Debt Payment": "Needs",
    "Medical": "Needs",           # new: pharmacy, doctor, dentist, prescriptions
    # --- Wants (discretionary) ---
    "Entertainment": "Wants",
    "Dining": "Wants",
    "Take Out": "Wants",                    # kept for backward compat — migrates to Dining
    "Clothes": "Wants",
    "Gifts": "Wants",
    "Charity": "Wants",
    "Travel": "Wants",
    "Coffee": "Wants",
    "Home": "Wants",
    "Misc": "Wants",
    "Fuel": "Wants",                        # kept for backward compat — migrates to Transportation
    "Gas": "Wants",                         # kept for backward compat — migrates to Transportation
    "Car Maintenance": "Wants",             # kept for backward compat — migrates to Transportation
    "Car": "Wants",                         # kept for backward compat — migrates to Transportation
    "Car Payment": "Wants",                 # kept for backward compat — migrates to Transportation
    "Uber": "Wants",                        # kept for backward compat — migrates to Transportation
    "Parking": "Wants",                     # kept for backward compat — migrates to Transportation
    "Hotels": "Wants",                      # kept for backward compat — migrates to Travel
    "Flights": "Wants",                     # kept for backward compat — migrates to Travel
    "CC Fees": "Wants",                     # kept for backward compat — migrates to Misc
    "CC Fee": "Wants",                      # kept for backward compat — migrates to Misc
    "Alcohol": "Wants",
    "Cannabis": "Wants",
    "Fitness": "Wants",
    "Newspaper": "Wants",                   # kept for backward compat — migrates to Entertainment Subscriptions
    "Newspapers": "Wants",                  # kept for backward compat — migrates to Entertainment Subscriptions
    "Health & Beauty": "Wants",
    "Subscriptions": "Wants",
    "Entertainment Subscriptions": "Wants", # consolidated: Netflix, Spotify, Prime Video, YouTube, Disney+, Paramount
    "Apple Sub": "Wants",                   # kept for backward compat — migrates to Entertainment Subscriptions
    "Spotify": "Wants",                     # kept for backward compat — migrates to Entertainment Subscriptions
    "Prime Video": "Wants",                 # kept for backward compat — migrates to Entertainment Subscriptions
    "Netflix": "Wants",                     # kept for backward compat — migrates to Entertainment Subscriptions
    "YouTube": "Wants",                     # kept for backward compat — migrates to Entertainment Subscriptions
    "Disney+": "Wants",                     # kept for backward compat — migrates to Entertainment Subscriptions
    "Disney Plus Sub": "Wants",             # kept for backward compat — migrates to Entertainment Subscriptions
    "Paramount": "Wants",                   # kept for backward compat — migrates to Entertainment Subscriptions
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
    # previously suggested
    "Gas (Utility)": "Natural Gas",
    "Pet Food & Toys": "Pets",
    "Vet": "Pets",
    "Pet Insurance": "Pets",
    "Car Insurance": "Insurance",
    "Home Insurance": "Insurance",
    "Take Out": "Dining",
    # Transportation consolidation
    "Gas": "Transportation",
    "Fuel": "Transportation",
    "Car": "Transportation",
    "Car Maintenance": "Transportation",
    "Car Payment": "Transportation",
    "Uber": "Transportation",
    "Parking": "Transportation",
    # Newspaper → Entertainment Subscriptions
    "Newspaper": "Entertainment Subscriptions",
    "Newspapers": "Entertainment Subscriptions",
    # Travel consolidation
    "Hotels": "Travel",
    "Flights": "Travel",
    # Misc
    "CC Fees": "Misc",
    "CC Fee": "Misc",
    # Entertainment Subscriptions consolidation
    "Netflix": "Entertainment Subscriptions",
    "Spotify": "Entertainment Subscriptions",
    "Prime Video": "Entertainment Subscriptions",
    "YouTube": "Entertainment Subscriptions",
    "Apple Sub": "Entertainment Subscriptions",
    "Disney+": "Entertainment Subscriptions",
    "Disney Plus Sub": "Entertainment Subscriptions",
    "Paramount": "Entertainment Subscriptions",
}
