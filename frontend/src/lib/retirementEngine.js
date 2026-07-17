/**
 * Retirement planning engine — pure functions, no side effects.
 * All monetary values in CAD. Rates as decimals (0.06 = 6%).
 */

/**
 * Project portfolio balance year-by-year to retirement.
 *
 * @param {object} profile            RetirementProfile from API
 * @param {number} currentAssets      Current investable assets (excl. house)
 * @param {number} monthlyRrsp        Avg monthly RRSP contribution (employee + employer), from income records
 * @param {number} monthlyEspp        Avg monthly ESPP deduction, from income records
 * @param {Array}  vestEvents         [{year, value}] one-time bumps (RSUs, bonuses)
 * @param {number} startYear          Current calendar year
 * @returns {Array<{year, age, balance, target}>}
 */
export function project(profile, currentAssets, monthlyRrsp, monthlyEspp, vestEvents = [], startYear) {
  const returnRate = profile?.expected_return ?? 0.06;
  const inflation = profile?.expected_inflation ?? 0.025;
  const currentAge = profile?.current_age ?? 40;
  const retireAge = profile?.target_retirement_age ?? 60;
  const yearsToRetire = Math.max(retireAge - currentAge, 1);
  const targetAnnual = profile?.target_annual_income ?? 0;
  const govtAnnual = ((profile?.cpp_monthly ?? 0) + (profile?.oas_monthly ?? 0)) * 12;

  const vestByYear = {};
  for (const ev of vestEvents) {
    if (ev.year) vestByYear[ev.year] = (vestByYear[ev.year] ?? 0) + (ev.value ?? 0);
  }

  // Monthly addition from payroll savings
  const monthlyAdd = monthlyRrsp + monthlyEspp;
  const monthlyRate = returnRate / 12;

  let balance = currentAssets;
  const points = [];

  for (let i = 0; i <= yearsToRetire; i++) {
    const year = startYear + i;
    const age = currentAge + i;

    // Compound monthly then add year-end windfalls
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyAdd;
    }
    balance += vestByYear[year] ?? 0;

    // Required portfolio: 4% SWR on inflation-adjusted net need
    const inflatedTarget = targetAnnual * Math.pow(1 + inflation, i);
    const netNeeded = Math.max(inflatedTarget - govtAnnual, 0);
    const required = netNeeded / 0.04;

    points.push({ year, age, balance: Math.round(balance), target: Math.round(required) });
  }

  return points;
}

/**
 * Find the first projection point where balance >= target.
 * Returns null if never achieved within the window.
 */
export function findRetirementYear(points) {
  for (const pt of points) {
    if (pt.target > 0 && pt.balance >= pt.target) return pt.year;
  }
  return null;
}

/**
 * For each goal, find the first projection year where balance >= target.
 * Returns array of {goal, hitYear, hitAge}.
 */
export function goalTimeline(goals, points) {
  return goals.map((g) => {
    const hit = points.find((pt) => pt.balance >= g.target_amount);
    return {
      goal: g,
      hitYear: hit?.year ?? null,
      hitAge: hit ? (hit.age ?? null) : null,
    };
  });
}
