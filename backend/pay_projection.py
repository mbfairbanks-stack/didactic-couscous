"""Projected income for a month, whether or not the pay has been entered yet.

Three sources, in order of trust:

1. **Recorded** — Income rows for the month. Always wins for pays already entered.
2. **Schedule** — a per-person PaySchedule. With an anchor date the real pay
   dates are enumerated, so a three-pay month projects three pays instead of an
   averaged 2.17; without one it falls back to the annualised average rather
   than inventing a start date. A partly-entered month is topped up with the
   pays still to come.
3. **Trailing average** — the last three months with recorded income, used when
   a person has no schedule at all.

Gross and net are tracked separately because they answer different questions:
gross drives tax and RRSP room, net is what the bucket plan can actually spend.
"""
from __future__ import annotations

import calendar
import datetime
from dataclasses import dataclass, field

from sqlalchemy import select, func
from sqlalchemy.orm import Session

import models

TRAILING_MONTHS = 3

# Pays per year, used only to derive a per-pay figure from a monthly average.
PERIODS_PER_YEAR = {
    "weekly": 52,
    "biweekly": 26,
    "semimonthly": 24,
    "monthly": 12,
}


@dataclass
class PersonIncome:
    person: str
    gross: float = 0.0
    net: float = 0.0
    rrsp_employee: float = 0.0
    rrsp_employer: float = 0.0
    espp: float = 0.0
    recorded_pays: int = 0
    expected_pays: float = 0.0
    source: str = "none"          # recorded | schedule | average | mixed | none
    net_estimated: bool = False   # True when any part of net came from a schedule

    def add(self, other: "PersonIncome") -> None:
        self.gross += other.gross
        self.net += other.net
        self.rrsp_employee += other.rrsp_employee
        self.rrsp_employer += other.rrsp_employer
        self.espp += other.espp


@dataclass
class MonthIncome:
    year: int
    month: int
    people: dict = field(default_factory=dict)

    def total(self, attr: str) -> float:
        return round(sum(getattr(p, attr) for p in self.people.values()), 2)

    @property
    def sources(self) -> dict:
        return {name: p.source for name, p in self.people.items()}

    @property
    def any_estimated(self) -> bool:
        return any(p.net_estimated or p.source in ("schedule", "average", "mixed")
                   for p in self.people.values())


def expected_pays_in_month(schedule: models.PaySchedule, year: int, month: int) -> float:
    """How many pays the month gets — fractional when we cannot know.

    With an anchor date the real paydays are enumerable, so a three-pay month
    projects three pays. Without one, guessing a start date is worse than not
    guessing: anchoring at the 1st hands three pays to every month of 29+ days,
    which over-projects biweekly pay by nearly 40%. Fall back to the annualised
    average instead, which is honest about not knowing.
    """
    freq = (schedule.frequency or "biweekly").lower()
    if freq in ("weekly", "biweekly") and _anchor_date(schedule) is None:
        return PERIODS_PER_YEAR.get(freq, 26) / 12
    return float(len(pay_dates_in_month(schedule, year, month)))


def pay_dates_in_month(schedule: models.PaySchedule, year: int, month: int) -> list[datetime.date]:
    """Actual paydays that fall inside the month, from the schedule's anchor."""
    freq = (schedule.frequency or "biweekly").lower()
    last_day = calendar.monthrange(year, month)[1]
    first = datetime.date(year, month, 1)
    last = datetime.date(year, month, last_day)

    if freq == "monthly":
        anchor_day = _anchor_day(schedule, default=last_day)
        return [datetime.date(year, month, min(anchor_day, last_day))]

    if freq == "semimonthly":
        # Paid twice a month, conventionally mid-month and month-end.
        return [datetime.date(year, month, min(15, last_day)),
                datetime.date(year, month, last_day)]

    step = 7 if freq == "weekly" else 14
    anchor = _anchor_date(schedule)
    if anchor is None:
        # Callers reach expected_pays_in_month first, which does not enumerate
        # unanchored weekly/biweekly runs; this is only for direct callers that
        # want a plausible set of dates.
        anchor = first

    # Walk back to the last payday on or before the 1st, then forward.
    delta_days = (first - anchor).days
    periods_back = delta_days // step
    current = anchor + datetime.timedelta(days=periods_back * step)
    while current < first:
        current += datetime.timedelta(days=step)

    dates = []
    while current <= last:
        dates.append(current)
        current += datetime.timedelta(days=step)
    return dates


def _anchor_date(schedule: models.PaySchedule) -> datetime.date | None:
    if not schedule.anchor_date:
        return None
    try:
        return datetime.date.fromisoformat(str(schedule.anchor_date)[:10])
    except ValueError:
        return None


def _anchor_day(schedule: models.PaySchedule, default: int) -> int:
    anchor = _anchor_date(schedule)
    return anchor.day if anchor else default


def _recorded(db: Session, year: int, month: int) -> dict[str, PersonIncome]:
    rows = db.execute(
        select(models.Income).where(models.Income.year == year, models.Income.month == month)
    ).scalars().all()

    out: dict[str, PersonIncome] = {}
    pay_dates: dict[str, set] = {}
    for r in rows:
        p = out.setdefault(r.person, PersonIncome(person=r.person, source="recorded"))
        p.gross += float(r.amount or 0)
        p.rrsp_employee += float(r.rrsp_employee or 0)
        p.rrsp_employer += float(r.rrsp_employer or 0)
        p.espp += float(r.espp_deduction or 0)
        if r.net_amount is not None:
            p.net += float(r.net_amount)
        else:
            # Net was never entered for this pay. Mark it so the caller knows
            # the figure is incomplete rather than genuinely zero.
            p.net_estimated = True
        pay_dates.setdefault(r.person, set()).add(r.pay_date or (r.year, r.month, r.id))

    for person, dates in pay_dates.items():
        out[person].recorded_pays = len(dates)
    return out


def _trailing_average(db: Session, person: str, year: int, month: int) -> PersonIncome | None:
    """Average monthly income over the last few months that had any."""
    cutoff = year * 12 + month
    rows = db.execute(
        select(models.Income.year, models.Income.month,
               func.sum(models.Income.amount).label("gross"),
               func.sum(models.Income.net_amount).label("net"),
               func.sum(models.Income.rrsp_employee).label("rrsp_e"),
               func.sum(models.Income.rrsp_employer).label("rrsp_r"),
               func.sum(models.Income.espp_deduction).label("espp"))
        .where(models.Income.person == person)
        .group_by(models.Income.year, models.Income.month)
    ).all()
    prior = [r for r in rows if r.year * 12 + r.month < cutoff]
    if not prior:
        return None
    prior.sort(key=lambda r: (r.year, r.month), reverse=True)
    sample = prior[:TRAILING_MONTHS]
    n = len(sample)
    return PersonIncome(
        person=person,
        gross=sum(float(r.gross or 0) for r in sample) / n,
        net=sum(float(r.net or 0) for r in sample) / n,
        rrsp_employee=sum(float(r.rrsp_e or 0) for r in sample) / n,
        rrsp_employer=sum(float(r.rrsp_r or 0) for r in sample) / n,
        espp=sum(float(r.espp or 0) for r in sample) / n,
        source="average",
        net_estimated=True,
    )


def project_month(db: Session, year: int, month: int) -> MonthIncome:
    """Recorded income for the month, topped up with whatever is still expected."""
    result = MonthIncome(year=year, month=month)
    result.people = _recorded(db, year, month)

    schedules = db.execute(
        select(models.PaySchedule).where(models.PaySchedule.is_active == True)  # noqa: E712
    ).scalars().all()

    for sched in schedules:
        expected = expected_pays_in_month(sched, year, month)
        person = result.people.get(sched.person)
        if person is None:
            person = PersonIncome(person=sched.person, source="schedule")
            result.people[sched.person] = person
        person.expected_pays = expected

        remaining = max(expected - person.recorded_pays, 0)
        if remaining <= 0:
            continue
        person.add(PersonIncome(
            person=sched.person,
            gross=float(sched.gross_per_pay or 0) * remaining,
            net=float(sched.net_per_pay or 0) * remaining,
            rrsp_employee=float(sched.rrsp_employee_per_pay or 0) * remaining,
            rrsp_employer=float(sched.rrsp_employer_per_pay or 0) * remaining,
            espp=float(sched.espp_per_pay or 0) * remaining,
        ))
        person.net_estimated = True
        person.source = "mixed" if person.recorded_pays else "schedule"

    # Anyone with history but no schedule and nothing recorded this month.
    scheduled_people = {s.person for s in schedules}
    known = db.execute(select(models.Income.person).distinct()).scalars().all()
    for person in known:
        if person in scheduled_people or person in result.people:
            continue
        avg = _trailing_average(db, person, year, month)
        if avg and (avg.gross or avg.net):
            result.people[person] = avg

    # A pay entered without its net figure still needs a net estimate, or the
    # plan base silently under-reports. Fall back per person.
    for person, p in result.people.items():
        if p.net > 0 or not p.net_estimated:
            continue
        sched = next((s for s in schedules if s.person == person), None)
        if sched and sched.gross_per_pay and sched.net_per_pay:
            ratio = float(sched.net_per_pay) / float(sched.gross_per_pay)
            p.net = round(p.gross * ratio, 2)
        else:
            avg = _trailing_average(db, person, year, month)
            if avg and avg.gross > 0 and avg.net > 0:
                p.net = round(p.gross * (avg.net / avg.gross), 2)

    return result


def summarize(db: Session, year: int, m0: int, m1: int) -> dict:
    """Aggregate projection across a month range, for the bucket summary."""
    months = [project_month(db, year, m) for m in range(m0, m1 + 1)]
    gross = sum(m.total("gross") for m in months)
    net = sum(m.total("net") for m in months)
    rrsp_employee = sum(m.total("rrsp_employee") for m in months)
    rrsp_employer = sum(m.total("rrsp_employer") for m in months)
    espp = sum(m.total("espp") for m in months)

    sources: dict[str, str] = {}
    for m in months:
        sources.update(m.sources)

    return {
        "gross": round(gross, 2),
        "net": round(net, 2),
        "payroll_rrsp_employee": round(rrsp_employee, 2),
        "payroll_rrsp_employer": round(rrsp_employer, 2),
        "payroll_espp": round(espp, 2),
        "deductions": round(gross - net, 2),
        "sources": sources,
        "estimated": any(m.any_estimated for m in months),
    }
