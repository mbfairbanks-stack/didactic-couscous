"""AI insights (Anthropic) and the insights log."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct, text, nullslast
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, List
import datetime
import tempfile, os, io, json, csv, re, math
from collections import defaultdict

import models
from database import get_db
from debt_math import effective_balance

router = APIRouter()

# ---------------------------------------------------------------------------
# AI Insights
# ---------------------------------------------------------------------------

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def _build_debt_context(db: Session) -> list[str]:
    """Build debt section for AI context, including payoff recommendations request."""
    debts = db.execute(select(models.Debt)).scalars().all()
    if not debts:
        return []

    lines = ["", "### Current Debts"]
    total_balance = 0
    total_min_payment = 0

    for d in debts:
        bal = effective_balance(d, db)
        total_balance += bal
        total_min_payment += d.monthly_payment + d.monthly_extra
        debt_type = "Line of Credit" if d.debt_type == "loc" else "Loan"
        rate_str = f" @ {d.interest_rate * 100:.2f}% p.a." if d.interest_rate else " (0% interest)"

        if d.debt_type == "loc":
            available = max(0, (d.credit_limit or 0) - bal)
            monthly_interest = bal * (d.interest_rate / 12) if d.interest_rate else 0
            lines.append(
                f"- **{d.name}** ({debt_type}, {d.creditor}){rate_str}: "
                f"${bal:,.0f} outstanding / ${d.credit_limit:,.0f} limit "
                f"(${available:,.0f} available) — min payment ${d.monthly_payment:,.0f}/mo, "
                f"monthly interest ~${monthly_interest:,.0f}"
            )
        else:
            months_left = None
            if d.monthly_payment + d.monthly_extra > 0 and bal > 0:
                total_pmt = d.monthly_payment + d.monthly_extra
                if d.interest_rate:
                    r = d.interest_rate / 12
                    if total_pmt > bal * r:
                        months_left = int(math.ceil(math.log(total_pmt / (total_pmt - bal * r)) / math.log(1 + r)))
                else:
                    months_left = int(math.ceil(bal / total_pmt)) if total_pmt > 0 else None
            payoff_str = f", payoff in ~{months_left} months" if months_left else ""
            lines.append(
                f"- **{d.name}** ({debt_type}, {d.creditor}){rate_str}: "
                f"${bal:,.0f} remaining — "
                f"${d.monthly_payment + d.monthly_extra:,.0f}/mo total payment{payoff_str}"
            )

    lines += [
        f"- **Total debt: ${total_balance:,.0f}** | Total committed payments: ${total_min_payment:,.0f}/mo",
    ]
    return lines


def _household_header(db: Session) -> list[str]:
    """Returns prompt lines declaring the household composition from app settings."""
    p1 = db.get(models.AppSettings, "person_1")
    p2 = db.get(models.AppSettings, "person_2")
    p1_name = p1.value if p1 else "Person 1"
    p2_name = p2.value if p2 else "Person 2"
    return [
        f"This is a 2-person Canadian household: {p1_name} and {p2_name}.",
        "Income records may contain multiple entries per person per month (e.g. bi-weekly paycheques) — treat them as paycheques from the same person, not separate people.",
        "",
    ]


def _aggregate_income(rows) -> list[tuple[str, str, float]]:
    """Aggregate raw income rows into (person, income_type, total) tuples."""
    agg: dict[tuple, float] = {}
    for r in rows:
        key = (r.person, r.income_type)
        agg[key] = agg.get(key, 0) + float(r.amount if hasattr(r, 'amount') else r.total)
    return [(person, itype, total) for (person, itype), total in sorted(agg.items())]


def _build_insights_context(year: int, month: Optional[int], db: Session,
                             start_month: Optional[int] = None, end_month: Optional[int] = None) -> str:
    """Build the AI prompt context. Dispatches to the appropriate builder."""
    if start_month and end_month:
        return _build_multi_month_context(year, start_month, end_month, db)
    if month:
        return _build_monthly_context(year, month, db)
    return _build_annual_context(year, db)


def _build_multi_month_context(year: int, start_month: int, end_month: int, db: Session) -> str:
    """Quarterly or semi-annual analysis context."""
    num_months = end_month - start_month + 1
    if num_months == 3:
        quarter = (start_month - 1) // 3 + 1
        period_label = f"Q{quarter} {year}"
        period_type = f"Quarter {quarter}"
    elif num_months == 6:
        half = 1 if start_month == 1 else 2
        period_label = f"H{half} {year}"
        period_type = f"{'First' if half == 1 else 'Second'} Half"
    else:
        period_label = f"{MONTH_NAMES[start_month]}–{MONTH_NAMES[end_month]} {year}"
        period_type = f"{num_months}-month period"

    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year,
               models.Transaction.month >= start_month,
               models.Transaction.month <= end_month)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    raw_income = db.execute(
        select(models.Income.person, models.Income.income_type, models.Income.amount)
        .where(models.Income.year == year,
               models.Income.month >= start_month,
               models.Income.month <= end_month)
    ).all()
    income_rows = _aggregate_income(raw_income)
    total_income = sum(t for _, _, t in income_rows)

    monthly_exp = db.execute(
        select(models.Transaction.month, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year,
               models.Transaction.month >= start_month,
               models.Transaction.month <= end_month)
        .group_by(models.Transaction.month).order_by(models.Transaction.month)
    ).all()
    monthly_inc = db.execute(
        select(models.Income.month, func.sum(models.Income.amount).label("total"))
        .where(models.Income.year == year,
               models.Income.month >= start_month,
               models.Income.month <= end_month)
        .group_by(models.Income.month).order_by(models.Income.month)
    ).all()
    inc_by_month = {r.month: r.total for r in monthly_inc}
    exp_by_month = {r.month: r.total for r in monthly_exp}

    target_rows = db.execute(
        select(models.BudgetTarget.category,
               func.avg(models.BudgetTarget.amount).label("avg_amount"))
        .where(models.BudgetTarget.year == year,
               models.BudgetTarget.month >= start_month,
               models.BudgetTarget.month <= end_month)
        .group_by(models.BudgetTarget.category)
    ).all()
    targets = {r.category: r.avg_amount * num_months for r in target_rows}

    total_expenses = sum(r.total for r in cat_rows)
    savings = total_income - total_expenses
    savings_rate = (savings / total_income * 100) if total_income else 0

    lines = [
        "You are a personal finance advisor analyzing a Canadian household budget.",
        "",
        *_household_header(db),
        f"## Period: {period_label} ({MONTH_NAMES[start_month]} – {MONTH_NAMES[end_month]} {year})",
        "",
        "### Income",
    ]
    if income_rows:
        for person, itype, total in income_rows:
            lines.append(f"- {person} ({itype}): ${total:,.0f}")
    else:
        lines.append("- No income recorded for this period")
    lines.append(f"- **Total household income: ${total_income:,.0f}**")

    lines += ["", "### Month-by-Month Breakdown",
              "| Month | Income | Expenses | Net |", "|---|---|---|---|"]
    for m in range(start_month, end_month + 1):
        inc = inc_by_month.get(m, 0)
        exp = exp_by_month.get(m, 0)
        lines.append(f"| {MONTH_NAMES[m]} | ${inc:,.0f} | ${exp:,.0f} | ${inc - exp:,.0f} |")

    lines += [
        "",
        f"### Spending by Category (total: ${total_expenses:,.0f}, avg ${total_expenses / num_months:,.0f}/mo)",
        "| Category | Period Total | Monthly Avg | Budget (period) | vs Budget |",
        "|---|---|---|---|---|",
    ]
    for r in cat_rows:
        avg = r.total / num_months
        budget = targets.get(r.category)
        vs_budget = (f"+${r.total - budget:,.0f} over" if budget and r.total > budget
                     else (f"${budget - r.total:,.0f} under" if budget else "N/A"))
        lines.append(f"| {r.category} | ${r.total:,.0f} | ${avg:,.0f}/mo | {'$' + f'{budget:,.0f}' if budget else 'N/A'} | {vs_budget} |")

    lines += [
        "",
        f"### {period_label} Summary",
        f"- Period expenses: ${total_expenses:,.0f} (${total_expenses / num_months:,.0f}/month avg)",
        f"- Period income: ${total_income:,.0f}",
        f"- Net savings: ${savings:,.0f} ({savings_rate:.1f}% savings rate)",
        "",
        "---",
        "",
        f"Please provide actionable, specific financial insights for this {period_type}. Include:",
        "1. **Overall performance** — how did spending and savings compare to expectations?",
        "2. **Top spending categories** — which dominated and are they sustainable?",
        "3. **Month-to-month trends** — how did spending evolve within this period? Any notable spikes or improvements?",
        "4. **Budget adherence** — which categories were significantly over or under budget?",
        "5. **Trajectory** — are habits improving or worsening compared to what's typical?",
        f"6. **Recommendations for next {period_type.lower()}** — specific, actionable changes with realistic targets",
        "7. **One priority action** — the single most impactful change to make",
        "",
        "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
    ]

    debt_lines = _build_debt_context(db)
    if debt_lines and total_income > 0:
        monthly_surplus = savings / num_months
        lines += debt_lines
        lines += [
            "",
            "---",
            "",
            "**Debt Strategy:**",
            f"Average monthly surplus this period: ${monthly_surplus:,.0f}",
            "8. **Recommended debt payments** — given this surplus, what's the optimal allocation to each debt?",
        ]

    return "\n".join(lines)


def _build_monthly_context(year: int, month: int, db: Session) -> str:
    """Single-month analysis context."""
    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year, models.Transaction.month == month)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    raw_income = db.execute(
        select(models.Income.person, models.Income.income_type, models.Income.amount)
        .where(models.Income.year == year, models.Income.month == month)
    ).all()
    income_rows = _aggregate_income(raw_income)
    total_income = sum(t for _, _, t in income_rows)

    target_rows = db.execute(
        select(models.BudgetTarget.category, models.BudgetTarget.amount)
        .where(models.BudgetTarget.year == year, models.BudgetTarget.month == month)
    ).all()
    targets = {r.category: r.amount for r in target_rows}

    # Historical averages excluding current month
    hist_totals = defaultdict(list)
    for r in db.execute(
        select(models.Transaction.year, models.Transaction.month, models.Transaction.category,
               func.sum(models.Transaction.amount).label("total"))
        .where(~((models.Transaction.year == year) & (models.Transaction.month == month)))
        .group_by(models.Transaction.year, models.Transaction.month, models.Transaction.category)
    ).all():
        hist_totals[r.category].append(r.total)
    hist_avg = {cat: sum(v) / len(v) for cat, v in hist_totals.items()}

    ytd_exp = db.execute(select(func.sum(models.Transaction.amount))
        .where(models.Transaction.year == year, models.Transaction.month <= month)).scalar() or 0
    ytd_inc = db.execute(select(func.sum(models.Income.amount))
        .where(models.Income.year == year, models.Income.month <= month)).scalar() or 0

    total_expenses = sum(r.total for r in cat_rows)
    savings = total_income - total_expenses
    savings_rate = (savings / total_income * 100) if total_income else 0
    month_label = MONTH_NAMES[month]

    lines = [
        "You are a personal finance advisor analyzing a Canadian household budget.",
        "",
        *_household_header(db),
        f"## Period: {month_label} {year}",
        "",
        "### Income",
    ]
    if income_rows:
        for person, itype, total in income_rows:
            lines.append(f"- {person} ({itype}): ${total:,.0f}")
    else:
        lines.append("- No income recorded for this month")
    lines.append(f"- **Total household income: ${total_income:,.0f}**")
    lines += [
        "",
        f"### Spending by Category (total: ${total_expenses:,.0f})",
        "| Category | This Month | Budget | Hist. Avg | vs Budget | vs Avg |",
        "|---|---|---|---|---|---|",
    ]
    for r in cat_rows:
        budget = targets.get(r.category)
        avg = hist_avg.get(r.category)
        vs_budget = f"+${r.total - budget:,.0f} over" if budget and r.total > budget else (f"${budget - r.total:,.0f} under" if budget else "N/A")
        vs_avg = f"+${r.total - avg:,.0f} ({((r.total / avg) - 1) * 100:.0f}%)" if avg else "N/A"
        lines.append(f"| {r.category} | ${r.total:,.0f} | {'$' + f'{budget:,.0f}' if budget else 'N/A'} | {'$' + f'{avg:,.0f}' if avg else 'N/A'} | {vs_budget} | {vs_avg} |")

    lines += [
        "",
        "### Month Summary",
        f"- Net savings: ${savings:,.0f} ({savings_rate:.1f}% savings rate)",
        f"- YTD income: ${ytd_inc:,.0f} | YTD expenses: ${ytd_exp:,.0f} | YTD balance: ${ytd_inc - ytd_exp:,.0f}",
        "",
        "---",
        "",
        "Please provide actionable, specific financial insights for this household. Include:",
        "1. **Top spending concerns** — categories that are high vs budget or historical average",
        "2. **Positive patterns** — where they are doing well",
        "3. **Concrete suggestions** — specific ways to reduce spending with realistic targets",
        "4. **Savings outlook** — comment on the savings rate and any recommendations",
        "5. **One priority action** — the single most impactful thing they could do this month",
        "",
        "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
    ]

    debt_lines = _build_debt_context(db)
    if debt_lines:
        lines += debt_lines
        lines += [
            "",
            "---",
            "",
            "**Debt Payoff Recommendations:**",
            f"Given the household income of ${total_income:,.0f}/month and expenses of ${total_expenses:,.0f}/month (leaving ${savings:,.0f}/month):",
            "6. **Recommended monthly payment per debt** — calculate the optimal payment for each debt to pay them off efficiently. Show the math: how much goes to each debt, what order, and the projected payoff date.",
            "7. **Acceleration opportunity** — if they freed up $200-500/month, how much faster could they be debt-free?",
            "8. **Interest cost warning** — for any debts with interest rates, show the total interest they'll pay at current payment pace vs an accelerated pace.",
            "",
            "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
        ]

    return "\n".join(lines)


def _build_annual_context(year: int, db: Session) -> str:
    """Full-year analysis context."""
    # All transactions this year by category
    cat_rows = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
    ).all()

    # Month-by-month breakdown
    monthly_exp = db.execute(
        select(models.Transaction.month, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.month)
        .order_by(models.Transaction.month)
    ).all()
    monthly_inc = db.execute(
        select(models.Income.month, func.sum(models.Income.amount).label("total"))
        .where(models.Income.year == year)
        .group_by(models.Income.month)
        .order_by(models.Income.month)
    ).all()
    inc_by_month = {r.month: r.total for r in monthly_inc}
    exp_by_month = {r.month: r.total for r in monthly_exp}

    # Annual totals
    total_expenses = sum(r.total for r in cat_rows)
    total_income = db.execute(
        select(func.sum(models.Income.amount)).where(models.Income.year == year)
    ).scalar() or 0

    # Prior year for comparison
    prior_cat = db.execute(
        select(models.Transaction.category, func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year - 1)
        .group_by(models.Transaction.category)
    ).all()
    prior_totals = {r.category: r.total for r in prior_cat}
    prior_income = db.execute(
        select(func.sum(models.Income.amount)).where(models.Income.year == year - 1)
    ).scalar() or 0
    prior_expenses = sum(r.total for r in prior_cat)

    # Budget targets for the year (use any month's targets as reference — average them)
    target_rows = db.execute(
        select(models.BudgetTarget.category, func.avg(models.BudgetTarget.amount).label("avg_amount"))
        .where(models.BudgetTarget.year == year)
        .group_by(models.BudgetTarget.category)
    ).all()
    targets = {r.category: r.avg_amount * 12 for r in target_rows}  # annualise monthly budgets

    # Peak spending month per top category
    peak_rows = db.execute(
        select(models.Transaction.category, models.Transaction.month,
               func.sum(models.Transaction.amount).label("total"))
        .where(models.Transaction.year == year)
        .group_by(models.Transaction.category, models.Transaction.month)
    ).all()
    cat_monthly = defaultdict(dict)
    for r in peak_rows:
        cat_monthly[r.category][r.month] = r.total

    # Savings by month
    savings_by_month = {m: inc_by_month.get(m, 0) - exp_by_month.get(m, 0) for m in range(1, 13)}
    best_month = max(savings_by_month, key=savings_by_month.get)
    worst_month = min(savings_by_month, key=savings_by_month.get)

    total_savings = total_income - total_expenses
    savings_rate = (total_savings / total_income * 100) if total_income else 0

    months_with_data = [m for m in range(1, 13) if exp_by_month.get(m, 0) > 0]
    last_month_label = MONTH_NAMES[max(months_with_data)] if months_with_data else "N/A"

    lines = [
        "You are a personal finance advisor analyzing a Canadian household budget.",
        "",
        *_household_header(db),
        f"## Period: Full Year {year} (through {last_month_label})",
        "",
        f"### Annual Totals",
        f"- Total household income: ${total_income:,.0f}",
        f"- Total expenses: ${total_expenses:,.0f}",
        f"- Net savings: **${total_savings:,.0f}** ({savings_rate:.1f}% savings rate)",
    ]

    if prior_income or prior_expenses:
        prior_savings = prior_income - prior_expenses
        inc_chg = ((total_income - prior_income) / prior_income * 100) if prior_income else 0
        exp_chg = ((total_expenses - prior_expenses) / prior_expenses * 100) if prior_expenses else 0
        lines += [
            "",
            f"### Year-over-Year vs {year - 1}",
            f"- Income: ${total_income:,.0f} vs ${prior_income:,.0f} ({inc_chg:+.1f}%)",
            f"- Expenses: ${total_expenses:,.0f} vs ${prior_expenses:,.0f} ({exp_chg:+.1f}%)",
            f"- Savings: ${total_savings:,.0f} vs ${prior_savings:,.0f}",
        ]

    lines += [
        "",
        "### Month-by-Month Summary",
        "| Month | Income | Expenses | Savings | Rate |",
        "|---|---|---|---|---|",
    ]
    for m in range(1, 13):
        inc = inc_by_month.get(m, 0)
        exp = exp_by_month.get(m, 0)
        if inc == 0 and exp == 0:
            continue
        sav = inc - exp
        rate = f"{sav / inc * 100:.0f}%" if inc else "—"
        lines.append(f"| {MONTH_NAMES[m][:3]} | ${inc:,.0f} | ${exp:,.0f} | ${sav:,.0f} | {rate} |")

    lines += [
        "",
        f"### Spending by Category (annual total: ${total_expenses:,.0f})",
        "| Category | Annual Total | Annual Budget | vs {yr_prior} | Peak Month |".format(yr_prior=year - 1),
        "|---|---|---|---|---|",
    ]
    for r in cat_rows:
        budget = targets.get(r.category)
        prior = prior_totals.get(r.category)
        vs_prior = f"+${r.total - prior:,.0f} ({((r.total / prior) - 1) * 100:.0f}%)" if prior else "N/A"
        peak_m = max(cat_monthly.get(r.category, {1: 0}), key=cat_monthly.get(r.category, {1: 0}).get)
        peak_label = MONTH_NAMES[peak_m][:3] if cat_monthly.get(r.category) else "—"
        vs_budget = f"${budget - r.total:,.0f} under" if budget and r.total <= budget else (f"+${r.total - budget:,.0f} over" if budget else "N/A")
        lines.append(f"| {r.category} | ${r.total:,.0f} | {'$' + f'{budget:,.0f}' if budget else 'N/A'} ({vs_budget}) | {vs_prior} | {peak_label} |")

    lines += [
        "",
        f"### Savings Patterns",
        f"- Best month: {MONTH_NAMES[best_month]} (saved ${savings_by_month[best_month]:,.0f})",
        f"- Worst month: {MONTH_NAMES[worst_month]} (saved ${savings_by_month[worst_month]:,.0f})",
        "",
        "---",
        "",
        "Please provide a comprehensive annual financial review for this household. Include:",
        "1. **Annual performance summary** — overall savings rate, income vs expenses trend vs prior year",
        "2. **Top spending categories** — which categories drove the most spending and how they compare to prior year",
        "3. **Budget adherence** — where they stayed within budget and where they overspent",
        "4. **Seasonal patterns** — months with unusually high/low spending and why that might be",
        "5. **Savings rate analysis** — is the rate healthy? What would move it meaningfully?",
        "6. **Top 3 priorities for next year** — specific, actionable goals based on this year's data",
        "",
        "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
    ]

    debt_lines = _build_debt_context(db)
    if debt_lines:
        avg_monthly_income = total_income / len([m for m in range(1, 13) if inc_by_month.get(m, 0) > 0]) if total_income else 0
        avg_monthly_expenses = total_expenses / len([m for m in range(1, 13) if exp_by_month.get(m, 0) > 0]) if total_expenses else 0
        avg_monthly_savings = avg_monthly_income - avg_monthly_expenses
        lines += debt_lines
        lines += [
            "",
            "---",
            "",
            "**Debt Payoff Recommendations:**",
            f"Average monthly income: ${avg_monthly_income:,.0f} | Average monthly expenses: ${avg_monthly_expenses:,.0f} | Average monthly surplus: ${avg_monthly_savings:,.0f}",
            "7. **Recommended monthly payment per debt** — based on their income and spending patterns, calculate the optimal payment for each debt. Show the math: recommended amount per debt, payoff order, and projected payoff dates.",
            "8. **Optimal payoff strategy** — avalanche (highest interest first) vs snowball (lowest balance first). Given their specific debts, which saves more money?",
            "9. **Acceleration scenario** — if they put an extra $300/month toward debt, which debt should receive it first and how much sooner would they be debt-free?",
            "10. **Total interest cost** — how much interest will they pay at current pace? How much would they save with the accelerated plan?",
            "",
            "Keep the tone practical and encouraging. Use Canadian dollar amounts. Be specific with numbers.",
        ]

    return "\n".join(lines)


@router.get("/insights")
async def get_insights(
    year: int,
    month: Optional[int] = None,
    start_month: Optional[int] = None,
    end_month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    import anthropic as anthropic_sdk

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY environment variable is not set")

    context = _build_insights_context(year, month, db, start_month, end_month)

    async def stream_insights():
        client = anthropic_sdk.Anthropic(api_key=api_key)
        try:
            with client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=8192,
                thinking={"type": "enabled", "budget_tokens": 5000},
                messages=[{"role": "user", "content": context}],
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_insights(), media_type="text/event-stream")


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
