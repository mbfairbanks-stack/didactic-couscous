/**
 * Retirement planning engine — pure functions, no side effects.
 * All monetary values in CAD. Rates as decimals (0.075 = 7.5%).
 * Projection runs in real (today's) dollars:
 *   real_return = (1 + nominal) / (1 + inflation) − 1
 * The target is a flat horizontal line (today's purchasing power).
 */

/**
 * CPP adjustment factor for taking CPP before or after 65.
 * −0.6%/month before 65 (max −36% at age 60).
 * +0.7%/month after 65 (max +42% at age 70).
 */
export function cppAdjustmentFactor(startAge) {
  const age = Math.max(60, Math.min(70, startAge));
  if (age < 65) return 1 - 0.006 * (65 - age) * 12;
  if (age > 65) return 1 + 0.007 * (age - 65) * 12;
  return 1.0;
}

export function calcRealReturn(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}

/**
 * Two-phase retirement target in today's dollars.
 *
 * Bridge phase (retire → 65): portfolio fully covers grossSpending
 *   using a present-value annuity at the real return rate.
 * Steady state (65+): portfolio covers grossSpending minus CPP/OAS,
 *   using SWR. That future capital is discounted back to today in real terms.
 */
export function calcTarget(profile) {
  const nominal = profile?.expected_return ?? 0.075;
  const inflation = profile?.expected_inflation ?? 0.025;
  const rReal = calcRealReturn(nominal, inflation);
  const retireAge = profile?.target_retirement_age ?? 60;
  const swr = profile?.swr ?? 0.035;
  const grossSpending = profile?.target_annual_income ?? 0;
  const cppStartAge = profile?.cpp_start_age ?? 65;

  const cppFactor = cppAdjustmentFactor(cppStartAge);
  const cppAdjusted = (profile?.cpp_monthly ?? 0) * 12 * cppFactor;
  const govtAnnual = cppAdjusted + (profile?.oas_monthly ?? 0) * 12;

  if (retireAge >= 65) {
    return swr > 0 ? Math.max(grossSpending - govtAnnual, 0) / swr : 0;
  }

  const bridgeYears = 65 - retireAge;
  const bridgeCapital = rReal > 0.001
    ? grossSpending * (1 - Math.pow(1 + rReal, -bridgeYears)) / rReal
    : grossSpending * bridgeYears;
  const capitalAt65 = swr > 0 ? Math.max(grossSpending - govtAnnual, 0) / swr : 0;
  const capitalAt65Disc = capitalAt65 / Math.pow(1 + rReal, bridgeYears);
  return bridgeCapital + capitalAt65Disc;
}

/**
 * Project portfolio balance year-by-year to retirement in real (today's) dollars.
 *
 * @param {object} profile            RetirementProfile from API
 * @param {number} currentAssets      Current investable assets (excl. house)
 * @param {number} monthlyRrsp        Avg monthly RRSP contribution (employee + employer)
 * @param {number} monthlyEspp        Avg monthly ESPP deduction
 * @param {Array}  vestEvents         [{year, value}] one-time bumps (RSUs, bonuses)
 * @param {number} startYear          Current calendar year
 * @returns {Array<{year, age, balance, target}>}
 */
export function project(profile, currentAssets, monthlyRrsp, monthlyEspp, vestEvents = [], startYear) {
  const nominal = profile?.expected_return ?? 0.075;
  const inflation = profile?.expected_inflation ?? 0.025;
  const rReal = calcRealReturn(nominal, inflation);
  const monthlyRealRate = Math.pow(1 + rReal, 1 / 12) - 1;

  const currentAge = profile?.current_age ?? 40;
  const retireAge = profile?.target_retirement_age ?? 60;
  const yearsToRetire = Math.max(retireAge - currentAge, 1);

  const target = Math.round(calcTarget(profile));

  const vestByYear = {};
  for (const ev of vestEvents) {
    if (ev.year) vestByYear[ev.year] = (vestByYear[ev.year] ?? 0) + (ev.value ?? 0);
  }

  const monthlyAdd = monthlyRrsp + monthlyEspp;

  let balance = currentAssets;
  const points = [];

  for (let i = 0; i <= yearsToRetire; i++) {
    const year = startYear + i;
    const age = currentAge + i;

    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRealRate) + monthlyAdd;
    }
    balance += vestByYear[year] ?? 0;

    points.push({ year, age, balance: Math.round(balance), target });
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
