"""The four spending buckets — the app's primary lens.

Every category belongs to exactly one bucket. The plan is expressed as a
percentage of the household's monthly plan base (take-home pay plus savings
that never hit the chequing account, i.e. payroll RRSP/ESPP deductions).

The point of the model: fixed costs and the two savings buckets are the ones
worth managing. Guilt-free spending is tracked as a single number — if the
total lands inside the plan, *what* it was spent on does not matter.
"""

FIXED = "fixed"
SHORT_TERM = "short_term"
MEANINGFUL = "meaningful"
GUILT_FREE = "guilt_free"

BUCKETS = [FIXED, SHORT_TERM, MEANINGFUL, GUILT_FREE]

BUCKET_LABELS = {
    FIXED: "Fixed Costs",
    SHORT_TERM: "Short-Term Savings",
    MEANINGFUL: "Meaningful Savings",
    GUILT_FREE: "Guilt-Free Spending",
}

BUCKET_BLURBS = {
    FIXED: "Bills that arrive whether you think about them or not — housing, "
           "utilities, insurance, groceries, transport, debt minimums.",
    SHORT_TERM: "Money for things you can see coming in the next few years — "
                "emergency fund, travel, car, home repairs.",
    MEANINGFUL: "Money you do not plan to touch — RRSP, TFSA, ESPP, "
                "investments, extra debt principal.",
    GUILT_FREE: "Everything else. One number. Spend it on whatever you like.",
}

# Starting plan, as a percentage of the monthly plan base. Editable per household.
DEFAULT_PLAN = {
    FIXED: 55,
    SHORT_TERM: 10,
    MEANINGFUL: 15,
    GUILT_FREE: 20,
}

PLAN_SETTINGS_KEY = "bucket_plan"

# Fallback when a category has no explicit bucket: derive it from the
# legacy Needs/Wants/Committed grouping so nothing is ever uncategorised.
GROUP_TO_BUCKET = {
    "Committed": FIXED,
    "Needs": FIXED,
    "Wants": GUILT_FREE,
    "Other": GUILT_FREE,
}

# Categories that carry a bucket the group mapping cannot infer — savings
# flows recorded as transactions (a transfer out of chequing).
SAVINGS_CATEGORIES = {
    "Short-Term Savings": SHORT_TERM,
    "Emergency Fund": SHORT_TERM,
    "Investment Contribution": MEANINGFUL,
    "Extra Debt Principal": MEANINGFUL,
}


def default_bucket_for(category_name: str, group_name: str | None) -> str:
    """Bucket a category should start in, before any user override."""
    if category_name in SAVINGS_CATEGORIES:
        return SAVINGS_CATEGORIES[category_name]
    return GROUP_TO_BUCKET.get(group_name or "", GUILT_FREE)


def normalize_plan(raw: dict | None) -> dict:
    """Coerce a stored plan into four non-negative numbers."""
    plan = dict(DEFAULT_PLAN)
    if isinstance(raw, dict):
        for key in BUCKETS:
            try:
                plan[key] = max(float(raw[key]), 0.0)
            except (KeyError, TypeError, ValueError):
                continue
    return plan
