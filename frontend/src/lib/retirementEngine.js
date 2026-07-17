/**
 * Retirement planning engine — pure functions, no side effects.
 * All monetary values in CAD. Rates as decimals (0.06 = 6%).
 */

/**
 * Compute monthly allocation across RRSP → TFSA → taxable.
 *
 * @param {object} profile  RetirementProfile from API
 * @param {number} monthlyFreeCash  Monthly surplus after expenses
 * @returns {{ rrsp, tfsa, taxable, taxSavings }}
 */
export function allocate(profile, monthlyFreeCash) {
  const rrspRoom = (profile?.rrsp_room ?? 0) / 12;
  const tfsaRoom = (profile?.tfsa_room ?? 0) / 12;
  const marginalRate = profile?.marginal_rate ?? 0;

  let remaining = Math.max(monthlyFreeCash, 0);
  const rrsp = Math.min(remaining, rrspRoom);
  remaining -= rrsp;
  const tfsa = Math.min(remaining, tfsaRoom);
  remaining -= tfsa;
  const taxable = remaining;
  const taxSavings = rrsp * marginalRate;

  return { rrsp, tfsa, taxable, taxSavings };
}

/**
 * Project portfolio balance year-by-year from now until retirement.
 *
 * @param {object} profile         RetirementProfile from API
 * @param {number} currentAssets   Current investable net worth
 * @param {number} monthlyAdd      Monthly savings addition
 * @param {Array}  vestEvents      [{year, value}] from RSUs/bonuses (after-tax estimate)
 * @param {number} startYear       Current calendar year
 * @returns {Array<{year, balance, target}>}
 */
export function project(profile, currentAssets, monthlyAdd, vestEvents = [], startYear) {
  const returnRate = profile?.expected_return ?? 0.06;
  const inflation = profile?.expected_inflation ?? 0.025;
  const yearsToRetire = Math.max((profile?.target_retirement_age ?? 60) - (profile?.current_age ?? 40), 1);
  const targetAnnual = profile?.target_annual_income ?? 0;
  const govtAnnual = ((profile?.cpp_monthly ?? 0) + (profile?.oas_monthly ?? 0)) * 12;

  const vestByYear = {};
  for (const ev of vestEvents) {
    vestByYear[ev.year] = (vestByYear[ev.year] ?? 0) + (ev.value ?? 0);
  }

  const monthlyRate = returnRate / 12;
  let balance = currentAssets;
  const points = [];

  for (let i = 0; i <= yearsToRetire; i++) {
    const year = startYear + i;
    // Compound monthly then add vesting windfall at year end
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyAdd;
    }
    balance += vestByYear[year] ?? 0;

    // Required portfolio using 4% SWR, inflation-adjusted target income
    const inflatedTarget = targetAnnual * Math.pow(1 + inflation, i);
    const netNeeded = Math.max(inflatedTarget - govtAnnual, 0);
    const required = netNeeded / 0.04;

    points.push({ year, balance: Math.round(balance), target: Math.round(required) });
  }

  return points;
}

/**
 * Find the first year in projection where balance >= target (retirement achievable).
 * Returns null if never achieved within the projection window.
 */
export function findRetirementYear(projectionPoints) {
  for (const pt of projectionPoints) {
    if (pt.balance >= pt.target && pt.target > 0) return pt.year;
  }
  return null;
}

/**
 * Estimate after-tax value of an RSU vest (rough: apply marginal rate to full value).
 */
export function rsuAfterTax(units, price, marginalRate) {
  const gross = units * price;
  return gross * (1 - marginalRate);
}
