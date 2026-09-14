"""AI insights (Anthropic) and the insights log.

The context handed to the model is bucket-shaped, not category-shaped: fixed
costs, short-term savings, meaningful savings, guilt-free spending. Guilt-free
is deliberately reported as one number — the household has decided it does not
care what that money goes to, only whether the total lands inside the plan.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
import datetime
import calendar
import os, json, math
from collections import defaultdict

import models
from buckets import FIXED, GUILT_FREE, MEANINGFUL, SHORT_TERM
from database import get_db
from debt_math import effective_balance
from routers.buckets import bucket_map, build_bucket_summary

router = APIRouter()

MODEL = "claude-opus-5"
MAX_TOKENS = 16000

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]

HOUSE_RULES_KEY = "insights_house_rules"
DEBT_STANCE_KEY = "insights_debt_stance"

DEBT_STANCES = {
    "avalanche": "Pay down the highest interest rate first (avalanche). Do not "
                 "re-argue this — the household has decided. Apply it and move on.",
    "snowball": "Pay down the smallest balance first (snowball). Do not re-argue "
                "this — the household has decided. Apply it and move on.",
    "minimums": "Pay minimums only and put everything else into savings and "
                "investments. Do not re-argue this — the household has decided.",
    "unsure": "The household has not picked a payoff strategy. You may compare "
              "avalanche against snowball once, with the actual dollar difference.",
}

SYSTEM_PROMPT = """You are the household's financial analyst. They run a \
bucket-based plan, not a line-item budget, and they have made a deliberate \
choice about what they want to think about.

What they want scrutinised:
- Fixed costs — the recurring bills. Every dollar cut here is permanent, so this \
is where you look hardest. Name specific bills, specific amounts, and the \
specific action (cancel, renegotiate, switch, re-shop at renewal).
- Short-term savings — is each goal actually funded at a rate that reaches it by \
its date? If not, say the monthly number that would.
- Meaningful savings — long-term money. Contribution room left, employer match \
left on the table, whether the rate supports their retirement target.

## Scope — do not volunteer advice outside it

Answer about fixed costs and the two savings buckets. Nothing else is in scope \
unless the data forces it.

- Guilt-free spending is one number. If the total is inside the plan, say so in \
one line and move on. Never itemise it. Never suggest cutting restaurants, \
coffee, subscriptions, travel, or any other purchase inside it. Never comment on \
what it was spent on. If it is over plan, say by how much and name the one \
structural fix — raise the target and fund it from another bucket, or bring the \
total down by $X/month — and let them choose which purchases.
- No lifestyle commentary, no moralising, no praise padding, no motivational \
framing.
- No generic personal-finance boilerplate. They already know what an emergency \
fund is, that compound interest exists, and that they should spend less than \
they earn. Say only what is true of *these* numbers.
- Do not invent adjacent topics — wills, side income, budgeting apps, mortgage \
refinancing, insurance products — unless a number in the data makes it \
unavoidable, and then in one line.

## Numbers — never invent one

- Cite only figures that appear in the data above, or arithmetic you do on them. \
Show the arithmetic when it is not obvious.
- If a conclusion needs data that is not there, say exactly what is missing and \
stop. "Not enough history to tell" is a valid and useful answer.
- Do not project a trend from fewer than three months of data, and say so when \
the sample is thin.
- Never present an estimate as a measurement. Mark assumptions as assumptions.
- Projected income is not earned income. When the plan base is projected, say \
which figures rest on it, and never report a variance against it as something \
the household achieved. An unfinished period has running totals, not results — \
talk about pace, not outcome.
- Committed vs target is the comparison that holds even before a month happens: \
set payments are decided, so a bucket whose commitments already exceed its \
target is over structurally, and that is worth saying regardless of how much \
of the month has elapsed.

## Length and tone

- Hard cap: roughly one screen. Under 500 words. If you are choosing what to cut, \
cut commentary, not numbers.
- Lead with the answer. No preamble, no throat-clearing, no summary of the data \
back at them before you analyse it.
- Every recommendation carries a dollar amount and a timeframe. "Reduce spending" \
is useless; "cancel the $34/mo security monitoring, saves $408/yr" is useful.
- No closing pep talk. End on the last real point.
- Canadian dollars, Canadian tax rules (RRSP, TFSA, ESPP, CPP, OAS).
- Markdown, ## and ### headings, tight prose."""


# ---------------------------------------------------------------------------
# Context sections
# ---------------------------------------------------------------------------

def _fmt(n: float) -> str:
    return f"${n:,.0f}"


def _period_label(year: int, m0: int, m1: int) -> str:
    if m0 == 1 and m1 == 12:
        return f"Full Year {year}"
    if m0 == m1:
        return f"{MONTH_NAMES[m0]} {year}"
    span = m1 - m0 + 1
    if span == 3 and m0 in (1, 4, 7, 10):
        return f"Q{(m0 - 1) // 3 + 1} {year}"
    if span == 6 and m0 in (1, 7):
        return f"H{1 if m0 == 1 else 2} {year}"
    return f"{MONTH_NAMES[m0]}–{MONTH_NAMES[m1]} {year}"


def _standing_instructions(db: Session) -> list[str]:
    """House rules and debt stance the household set in Settings.

    These are the household's own standing instructions. They override the
    analyst's defaults about *what to look at*; they do not override the
    output contract or the guardrails on inventing numbers.
    """
    rules_row = db.get(models.AppSettings, HOUSE_RULES_KEY)
    stance_row = db.get(models.AppSettings, DEBT_STANCE_KEY)
    rules = (rules_row.value if rules_row else "").strip()
    stance = (stance_row.value if stance_row else "unsure").strip()

    lines = ["## Standing Instructions From The Household", ""]
    lines.append("Debt payoff stance: " + DEBT_STANCES.get(stance, DEBT_STANCES["unsure"]))
    if rules:
        lines += [
            "",
            "House rules — facts and constraints they have already decided. Treat "
            "these as given, do not argue with them, and do not recommend anything "
            "they rule out:",
            "",
            *[f"> {line}" for line in rules.splitlines()],
        ]
    lines += [
        "",
        "These are context, not a task. Follow the report format regardless, and "
        "they never license citing a number that is not in the data below.",
        "",
    ]
    return lines


def _household_header(db: Session) -> list[str]:
    p1 = db.get(models.AppSettings, "person_1")
    p2 = db.get(models.AppSettings, "person_2")
    p1_name = p1.value if p1 else "Person 1"
    p2_name = p2.value if p2 else "Person 2"
    return [
        f"Two-person Canadian household: {p1_name} and {p2_name}.",
        "Income rows are individual paycheques — several per person per month is "
        "normal (bi-weekly pay), not several people.",
        "",
    ]


def _period_progress(year: int, m0: int, m1: int) -> tuple[str, bool]:
    """How much of the period has actually elapsed, and whether it is still open."""
    today = datetime.date.today()
    start = datetime.date(year, m0, 1)
    last_day = calendar.monthrange(year, m1)[1]
    end = datetime.date(year, m1, last_day)

    if today > end:
        return "complete — the whole period is in the past", False
    if today < start:
        return "entirely in the future — nothing has happened yet", True
    elapsed = (today - start).days + 1
    total = (end - start).days + 1
    pct = round(elapsed / total * 100)
    return (f"in progress — day {elapsed} of {total} ({pct}% elapsed), "
            f"so spending totals are partial"), True


def _plan_section(summary: dict, year: int, m0: int, m1: int) -> list[str]:
    """The headline: target vs actual per bucket, plus how solid those figures are."""
    months = summary["months"]
    per = "per month" if months > 1 else "this month"
    income = summary["income"]
    progress, open_period = _period_progress(year, m0, m1)
    projected = bool(income.get("estimated"))

    lines = [
        "## The Plan",
        "",
        f"Period status: {progress}.",
        "",
        "### Where the plan base comes from",
        "",
        f"- Gross pay: {_fmt(income['gross'] / months)}/mo",
        f"- Deductions (tax, CPP/EI, RRSP, ESPP): {_fmt(income['deductions'] / months)}/mo",
        f"- Take-home deposited: {_fmt(income['net'] / months)}/mo",
        f"- Savings taken off the top (RRSP + ESPP): "
        f"{_fmt((income['payroll_rrsp_employee'] + income['payroll_espp']) / months)}/mo",
        f"- **Plan base: {_fmt(summary['plan_base_monthly'])} {per}** "
        "(take-home plus the savings diverted before the deposit)",
    ]

    if income.get("sources"):
        lines += ["", "Per person, where the income figure came from:"]
        for person, source in sorted(income["sources"].items()):
            explain = {
                "recorded": "entered from actual paycheques",
                "schedule": "PROJECTED from their pay schedule — no pay entered yet",
                "mixed": "PART entered, the remaining pays PROJECTED from their schedule",
                "average": "PROJECTED from their recent months — no schedule set",
            }.get(source, source)
            lines.append(f"- {person}: {explain}")

    if projected:
        lines += [
            "",
            "**The income above is a projection, not a record.** Say so plainly when "
            "you quote any figure that depends on it, and do not present a variance "
            "against a projected base as a result the household achieved. Compare "
            "what is committed against the target instead — that comparison is real "
            "even before the month happens.",
        ]

    lines += [
        "",
        "### Target vs actual vs committed",
        "",
        "| Bucket | Target $/mo | Committed $/mo | Actual so far $/mo | Target left after commitments |",
        "|---|---|---|---|---|",
    ]
    for b in summary["buckets"]:
        lines.append(
            f"| {b['label']} | {_fmt(b['target_monthly'])} | {_fmt(b['committed_monthly'])} | "
            f"{_fmt(b['actual_monthly'])} | {_fmt(b['uncommitted_monthly'])} |"
        )

    lines += [
        "",
        "Committed means set payments already decided before the period started — "
        "recurring bills, debt minimums (fixed costs) and extra principal "
        "(meaningful savings). Actual is what transactions and payroll actually "
        "show. A bucket whose commitments already exceed its target is "
        "structurally over, regardless of discretionary behaviour, and that is "
        "worth calling out.",
    ]

    for b in summary["buckets"]:
        if b["uncommitted_monthly"] < 0:
            lines.append(
                f"- {b['label']}: committed {_fmt(b['committed_monthly'])}/mo against a "
                f"{_fmt(b['target_monthly'])}/mo target — over before any choices are made."
            )

    if open_period:
        lines += [
            "",
            "Because the period is not finished, treat every 'actual' as a "
            "running total. Do not describe a bucket as under plan when the "
            "month still has days left to run — say what the pace implies instead.",
        ]

    unallocated = summary["unallocated"] / months
    lines += [
        "",
        f"Unallocated (plan base minus everything above): {_fmt(unallocated)}/mo."
        + (" Expect this to shrink as the period fills in." if open_period else
           " Positive means money that landed nowhere the plan tracks — most likely "
           "sitting in chequing, or savings the household made without recording it."),
    ]
    if summary["unmapped_categories"]:
        names = ", ".join(c["category"] for c in summary["unmapped_categories"][:8])
        lines += [
            "",
            f"Note: these categories have no bucket assigned and were counted as "
            f"guilt-free: {names}. Flag this if it materially changes the picture.",
        ]
    return lines


def _bucket_of(summary: dict, key: str) -> dict:
    return next(b for b in summary["buckets"] if b["bucket"] == key)


def _fixed_section(db: Session, summary: dict, year: int, m0: int, m1: int) -> list[str]:
    """Every fixed cost, with a trailing comparison so creep is visible."""
    fixed = _bucket_of(summary, FIXED)
    months = summary["months"]
    mapping = bucket_map(db)

    # Trailing monthly average per category over the 12 months before m0.
    hist = defaultdict(list)
    for r in db.execute(
        select(models.Transaction.year, models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(~((models.Transaction.year == year)
                 & (models.Transaction.month >= m0)
                 & (models.Transaction.month <= m1)))
        .group_by(models.Transaction.year, models.Transaction.month, models.Transaction.category)
        .order_by(models.Transaction.year.desc(), models.Transaction.month.desc())
    ).all():
        if len(hist[r.category]) < 12:
            hist[r.category].append(float(r.total or 0))
    prior_avg = {c: sum(v) / len(v) for c, v in hist.items() if v}

    lines = [
        "",
        "## Fixed Costs — the bills that repeat",
        "",
        f"Total {_fmt(fixed['actual_monthly'])}/mo against a target of "
        f"{_fmt(fixed['target_monthly'])}/mo "
        f"({fixed['actual_pct']:.0f}% of plan base, target {fixed['target_pct']:.0f}%).",
        "",
        "| Bill | $/mo this period | $/mo trailing 12mo | Change |",
        "|---|---|---|---|",
    ]
    for c in fixed["categories"]:
        monthly = c["amount"] / months
        prior = prior_avg.get(c["category"])
        if prior and prior > 0:
            delta = monthly - prior
            pct = delta / prior * 100
            change = f"{'+' if delta >= 0 else '−'}{_fmt(abs(delta))} ({pct:+.0f}%)"
        else:
            change = "no history"
        lines.append(
            f"| {c['category']} | {_fmt(monthly)} | "
            f"{_fmt(prior) if prior else '—'} | {change} |"
        )

    recurring = db.execute(
        select(models.RecurringBill).where(models.RecurringBill.is_active == True)  # noqa: E712
    ).scalars().all()
    fixed_recurring = [
        b for b in recurring if mapping.get(b.category or "", GUILT_FREE) == FIXED
    ]
    if fixed_recurring:
        # Everything else in this section is $/mo, so normalise annual and
        # quarterly bills rather than leaving the reader to divide.
        from routers.buckets import _FREQUENCY_TO_MONTHLY

        lines += ["", "Set payments in this bucket (monthly equivalent):"]
        def monthly(bill):
            return float(bill.amount or 0) * _FREQUENCY_TO_MONTHLY.get(
                (bill.frequency or "monthly").lower(), 1.0)

        for b in sorted(fixed_recurring, key=monthly, reverse=True):
            billed = ("" if (b.frequency or "monthly").lower() == "monthly"
                      else f" (billed {_fmt(b.amount or 0)} {b.frequency})")
            lines.append(f"- {b.name}: {_fmt(monthly(b))}/mo{billed}")
    return lines


def _short_term_section(db: Session, summary: dict) -> list[str]:
    """Goals and whether their funding rate actually reaches them."""
    bucket = _bucket_of(summary, SHORT_TERM)
    months = summary["months"]
    lines = [
        "",
        "## Short-Term Savings",
        "",
        f"Funded {_fmt(bucket['actual_monthly'])}/mo against a target of "
        f"{_fmt(bucket['target_monthly'])}/mo.",
    ]
    if bucket["categories"]:
        lines.append("")
        for c in bucket["categories"]:
            lines.append(f"- {c['category']}: {_fmt(c['amount'] / months)}/mo")

    goals = db.execute(select(models.SavingsGoal)).scalars().all()
    if goals:
        lines += ["", "| Goal | Target | Saved | Short by | Target date | Needed $/mo |",
                  "|---|---|---|---|---|---|"]
        today = datetime.date.today()
        for g in goals:
            current = float(g.current_amount or 0)
            if g.linked_asset_id:
                asset = db.get(models.Asset, g.linked_asset_id)
                if asset:
                    current = float(asset.balance or 0)
            gap = max(float(g.target_amount or 0) - current, 0)
            needed = "—"
            date_label = g.target_date or "no date"
            if g.target_date:
                try:
                    target = datetime.date.fromisoformat(g.target_date)
                    months_left = max(
                        (target.year - today.year) * 12 + (target.month - today.month), 0
                    )
                    needed = _fmt(gap / months_left) + "/mo" if months_left else "due now"
                except ValueError:
                    pass
            lines.append(
                f"| {g.name} | {_fmt(g.target_amount or 0)} | {_fmt(current)} | "
                f"{_fmt(gap)} | {date_label} | {needed} |"
            )
    else:
        lines += ["", "No savings goals are set up. That is itself worth flagging — "
                  "short-term savings without a named destination tends to get spent."]

    ef = _emergency_fund(db)
    if ef:
        lines += ["", f"Emergency fund: {_fmt(ef['liquid_cash'])} liquid cash against "
                  f"{_fmt(ef['avg_monthly_expenses'])}/mo of expenses — "
                  f"{ef['months_covered'] if ef['months_covered'] is not None else '—'} months of runway."]
    return lines


def _emergency_fund(db: Session) -> Optional[dict]:
    """Liquid cash measured against the last three months of spending."""
    cash = db.execute(
        select(func.sum(models.Asset.balance))
        .where(models.Asset.asset_type == "cash", models.Asset.liquidity == "liquid")
    ).scalar()
    if cash is None:
        return None
    recent = db.execute(
        select(func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.amount > 0)
        .group_by(models.Transaction.year, models.Transaction.month)
        .order_by(models.Transaction.year.desc(), models.Transaction.month.desc())
        .limit(3)
    ).scalars().all()
    monthly = sum(float(v or 0) for v in recent) / len(recent) if recent else 0.0
    return {
        "liquid_cash": float(cash),
        "avg_monthly_expenses": round(monthly, 2),
        "months_covered": round(float(cash) / monthly, 1) if monthly > 0 else None,
    }


def _meaningful_section(db: Session, summary: dict) -> list[str]:
    """Long-term money: contribution room, employer match, retirement trajectory."""
    bucket = _bucket_of(summary, MEANINGFUL)
    months = summary["months"]
    income = summary["income"]
    lines = [
        "",
        "## Meaningful Savings",
        "",
        f"Contributed {_fmt(bucket['actual_monthly'])}/mo against a target of "
        f"{_fmt(bucket['target_monthly'])}/mo.",
        "",
        f"- Payroll RRSP (employee): {_fmt(income['payroll_rrsp_employee'] / months)}/mo",
        f"- Employer RRSP match: {_fmt(income['payroll_rrsp_employer'] / months)}/mo "
        "(free money — flag immediately if the match is not being maxed)",
        f"- ESPP deductions: {_fmt(income['payroll_espp'] / months)}/mo",
    ]
    for c in bucket["categories"]:
        if not c.get("from_payroll"):
            lines.append(f"- {c['category']}: {_fmt(c['amount'] / months)}/mo")

    profile = db.execute(
        select(models.RetirementProfile).order_by(models.RetirementProfile.year.desc())
    ).scalars().first()
    if profile:
        lines += [
            "",
            "### Retirement profile",
            f"- Age {profile.current_age} → target retirement {profile.target_retirement_age}",
            f"- Target annual income in today's dollars: {_fmt(profile.target_annual_income or 0)}",
            f"- RRSP room remaining: {_fmt(profile.rrsp_room or 0)} | "
            f"TFSA room remaining: {_fmt(profile.tfsa_room or 0)}",
            f"- Marginal tax rate: {(profile.marginal_rate or 0) * 100:.1f}% "
            "(use this to price the tax benefit of an RRSP contribution)",
            f"- Assumptions: {(profile.expected_return or 0) * 100:.1f}% return, "
            f"{(profile.expected_inflation or 0) * 100:.1f}% inflation, "
            f"{(profile.swr or 0) * 100:.1f}% withdrawal rate",
        ]

    assets = db.execute(select(models.Asset)).scalars().all()
    if assets:
        by_type = defaultdict(float)
        for a in assets:
            by_type[a.asset_type or "other"] += float(a.balance or 0)
        lines += ["", "### Assets",
                  *[f"- {k}: {_fmt(v)}" for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])]]
    return lines


def _guilt_free_section(db: Session, summary: dict, year: int, m0: int, m1: int) -> list[str]:
    """One number. Deliberately no category breakdown."""
    bucket = _bucket_of(summary, GUILT_FREE)
    months = summary["months"]
    mapping = bucket_map(db)

    # Trailing monthly guilt-free total, for context on whether this is normal.
    trailing = defaultdict(float)
    for r in db.execute(
        select(models.Transaction.year, models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(~((models.Transaction.year == year)
                 & (models.Transaction.month >= m0)
                 & (models.Transaction.month <= m1)))
        .group_by(models.Transaction.year, models.Transaction.month, models.Transaction.category)
    ).all():
        if mapping.get(r.category, GUILT_FREE) == GUILT_FREE:
            trailing[(r.year, r.month)] += float(r.total or 0)
    recent = [v for _, v in sorted(trailing.items(), reverse=True)[:12]]
    trailing_avg = sum(recent) / len(recent) if recent else None

    var = bucket["variance"] / months
    lines = [
        "",
        "## Guilt-Free Spending",
        "",
        f"- This period: {_fmt(bucket['actual_monthly'])}/mo",
        f"- Plan: {_fmt(bucket['target_monthly'])}/mo ({bucket['target_pct']:.0f}% of plan base)",
        f"- Trailing 12-month average: {_fmt(trailing_avg)}/mo" if trailing_avg else
        "- No trailing history yet",
        f"- Variance: {'+' + _fmt(var) + ' over plan' if var > 0 else _fmt(abs(var)) + ' under plan'}",
        "",
        "Do not break this down by category and do not suggest which purchases to "
        "cut. One or two lines: is the number inside the plan, and if not, what is "
        "the structural fix.",
    ]
    return lines


def _debt_section(db: Session) -> list[str]:
    debts = db.execute(select(models.Debt)).scalars().all()
    if not debts:
        return []

    lines = ["", "## Debts", "",
             "| Debt | Type | Rate | Balance | Payment/mo | Payoff |",
             "|---|---|---|---|---|---|"]
    total_balance = 0.0
    total_payment = 0.0
    for d in debts:
        bal = effective_balance(d, db)
        total_balance += bal
        pmt = (d.monthly_payment or 0) + (d.monthly_extra or 0)
        total_payment += pmt
        rate = f"{d.interest_rate * 100:.2f}%" if d.interest_rate else "0%"
        dtype = {"loc": "LOC", "mortgage": "Mortgage"}.get(d.debt_type, "Loan")
        payoff = "—"
        if pmt > 0 and bal > 0:
            if d.interest_rate:
                r = d.interest_rate / 12
                if pmt > bal * r:
                    payoff = f"~{int(math.ceil(math.log(pmt / (pmt - bal * r)) / math.log(1 + r)))} mo"
                else:
                    payoff = "never at this payment"
            else:
                payoff = f"~{int(math.ceil(bal / pmt))} mo"
        lines.append(
            f"| {d.name} ({d.creditor}) | {dtype} | {rate} | {_fmt(bal)} | "
            f"{_fmt(pmt)} | {payoff} |"
        )
    lines.append(f"| **Total** | | | **{_fmt(total_balance)}** | "
                 f"**{_fmt(total_payment)}** | |")
    return lines


def _trend_section(db: Session, year: int) -> list[str]:
    """Month-by-month bucket totals — makes drift visible."""
    mapping = bucket_map(db)
    rows = db.execute(
        select(models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.month, models.Transaction.category)
    ).all()
    by_month = defaultdict(lambda: defaultdict(float))
    for r in rows:
        by_month[r.month][mapping.get(r.category, GUILT_FREE)] += float(r.total or 0)

    payroll = db.execute(
        select(models.Income.month,
               func.sum(models.Income.rrsp_employee).label("rrsp"),
               func.sum(models.Income.espp_deduction).label("espp"),
               func.sum(models.Income.amount).label("take_home"))
        .where(models.Income.year == year)
        .group_by(models.Income.month)
    ).all()
    base_by_month = {}
    for r in payroll:
        contributed = float(r.rrsp or 0) + float(r.espp or 0)
        by_month[r.month][MEANINGFUL] += contributed
        base_by_month[r.month] = float(r.take_home or 0) + contributed

    months = sorted(set(by_month) | set(base_by_month))
    if not months:
        return []
    lines = ["", f"## Month-by-Month Buckets ({year})", "",
             "| Month | Plan base | Fixed | Short-term | Meaningful | Guilt-free |",
             "|---|---|---|---|---|---|"]
    for m in months:
        d = by_month[m]
        lines.append(
            f"| {MONTH_NAMES[m][:3]} | {_fmt(base_by_month.get(m, 0))} | "
            f"{_fmt(d[FIXED])} | {_fmt(d[SHORT_TERM])} | "
            f"{_fmt(d[MEANINGFUL])} | {_fmt(d[GUILT_FREE])} |"
        )
    return lines


def build_insights_context(db: Session, year: int, m0: int, m1: int) -> str:
    summary = build_bucket_summary(db, year, m0, m1)
    label = _period_label(year, m0, m1)
    lines = [
        *_household_header(db),
        *_standing_instructions(db),
        f"# {label}",
        "",
        *_plan_section(summary, year, m0, m1),
        *_fixed_section(db, summary, year, m0, m1),
        *_short_term_section(db, summary),
        *_meaningful_section(db, summary),
        *_guilt_free_section(db, summary, year, m0, m1),
        *_debt_section(db),
        *_trend_section(db, year),
    ]
    return "\n".join(lines)


REPORT_REQUEST = """---

Write the review for this period. Use exactly these sections, in this order:

## Verdict
Two or three sentences. Which buckets are where they should be, which are not, \
and the single most consequential fact in this data.

## Do This Next
Three actions, ranked by dollars saved or moved per unit of effort. Each one: \
what to do, the exact dollar impact per month and per year, and how long it \
takes to set up. Draw them from fixed costs and the savings buckets — that is \
where the leverage is.

## Fixed Costs
What moved and why it matters. Call out any bill that grew faster than \
inflation, any duplicate or dormant subscription, and anything worth re-shopping \
this year. Name the bill and the amount every time.

## Savings
Short-term: is each goal on pace for its date? Give the monthly number that \
would put it on pace. Meaningful: is the rate enough for the retirement target, \
is the employer match fully captured, and is there RRSP or TFSA room being left \
unused? Price the RRSP contribution at their marginal rate.

## Guilt-Free
One or two lines. Inside the plan or not, and by how much. Nothing else.

## Watch For
One or two early warnings visible in this data that are not yet problems."""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _resolve_range(year: int, month: Optional[int],
                   start_month: Optional[int], end_month: Optional[int]) -> tuple[int, int]:
    if start_month and end_month:
        return max(1, start_month), min(12, end_month)
    if month:
        return month, month
    return 1, 12


def _client():
    import anthropic as anthropic_sdk

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY environment variable is not set")
    return anthropic_sdk.Anthropic(api_key=api_key)


def _sse(client, messages: list[dict]) -> StreamingResponse:
    async def stream():
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                messages=messages,
            ) as s:
                for text in s.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:  # surfaced in the UI rather than a blank panel
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/insights")
async def get_insights(
    year: int,
    month: Optional[int] = None,
    start_month: Optional[int] = None,
    end_month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    client = _client()
    m0, m1 = _resolve_range(year, month, start_month, end_month)
    context = build_insights_context(db, year, m0, m1)
    return _sse(client, [{"role": "user", "content": f"{context}\n\n{REPORT_REQUEST}"}])


@router.get("/insights/context")
def get_insights_context(
    year: int,
    month: Optional[int] = None,
    start_month: Optional[int] = None,
    end_month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """The exact data the model sees — useful for debugging a surprising answer."""
    m0, m1 = _resolve_range(year, month, start_month, end_month)
    return {"context": build_insights_context(db, year, m0, m1)}


class AskRequest(BaseModel):
    year: int
    month: Optional[int] = None
    start_month: Optional[int] = None
    end_month: Optional[int] = None
    question: str
    prior_report: Optional[str] = None


@router.post("/insights/ask")
async def ask_insights(body: AskRequest, db: Session = Depends(get_db)):
    """Follow-up question against the same period's data."""
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(400, "Question is required")
    client = _client()
    m0, m1 = _resolve_range(body.year, body.month, body.start_month, body.end_month)
    context = build_insights_context(db, body.year, m0, m1)

    follow_up = (f"{question}\n\nAnswer this directly and briefly. Use the numbers "
                 "above; do not repeat the whole review.")
    if body.prior_report:
        messages = [
            {"role": "user", "content": f"{context}\n\n{REPORT_REQUEST}"},
            {"role": "assistant", "content": body.prior_report},
            {"role": "user", "content": follow_up},
        ]
    else:
        messages = [{"role": "user", "content": f"{context}\n\n{follow_up}"}]
    return _sse(client, messages)


# ---------------------------------------------------------------------------
# House rules
# ---------------------------------------------------------------------------

class HouseRules(BaseModel):
    house_rules: str = ""
    debt_stance: str = "unsure"


@router.get("/insights/house-rules")
def get_house_rules(db: Session = Depends(get_db)):
    rules = db.get(models.AppSettings, HOUSE_RULES_KEY)
    stance = db.get(models.AppSettings, DEBT_STANCE_KEY)
    return {
        "house_rules": rules.value if rules else "",
        "debt_stance": stance.value if stance else "unsure",
        "stances": {k: v for k, v in DEBT_STANCES.items()},
    }


@router.put("/insights/house-rules")
def put_house_rules(body: HouseRules, db: Session = Depends(get_db)):
    if body.debt_stance not in DEBT_STANCES:
        raise HTTPException(400, f"Unknown debt stance '{body.debt_stance}'")
    # Long enough for real constraints, short enough not to swamp the data.
    rules = body.house_rules.strip()[:4000]
    for key, value in ((HOUSE_RULES_KEY, rules), (DEBT_STANCE_KEY, body.debt_stance)):
        row = db.get(models.AppSettings, key)
        if row:
            row.value = value
        else:
            db.add(models.AppSettings(key=key, value=value))
    db.commit()
    return {"house_rules": rules, "debt_stance": body.debt_stance}


# ---------------------------------------------------------------------------
# Insights log
# ---------------------------------------------------------------------------

class InsightsLogCreate(BaseModel):
    year: int
    month: int  # 0 = annual
    content: str
    start_month: Optional[int] = None
    end_month: Optional[int] = None


@router.post("/insights/log", status_code=201)
def save_insights_log(body: InsightsLogCreate, db: Session = Depends(get_db)):
    entry = models.InsightsLog(
        year=body.year,
        month=body.month,
        start_month=body.start_month,
        end_month=body.end_month,
        generated_at=datetime.datetime.now(),
        content=body.content,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "generated_at": entry.generated_at.isoformat()}


@router.get("/insights/log")
def list_insights_log(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.InsightsLog).order_by(models.InsightsLog.generated_at.desc())
    ).scalars().all()
    return [
        {
            "id": r.id,
            "year": r.year,
            "month": r.month,
            "start_month": getattr(r, "start_month", None),
            "end_month": getattr(r, "end_month", None),
            "generated_at": r.generated_at.isoformat(),
            "content": r.content,
        }
        for r in rows
    ]


@router.delete("/insights/log/{entry_id}", status_code=204)
def delete_insights_log(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(models.InsightsLog, entry_id)
    if not entry:
        raise HTTPException(404, "Not found")
    db.delete(entry)
    db.commit()
