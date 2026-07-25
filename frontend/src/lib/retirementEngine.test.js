import { describe, it, expect } from "vitest";
import {
  cppAdjustmentFactor,
  calcRealReturn,
  calcTarget,
  project,
  findRetirementYear,
  goalTimeline,
} from "./retirementEngine";

describe("cppAdjustmentFactor", () => {
  it("is 1.0 at the normal age of 65", () => {
    expect(cppAdjustmentFactor(65)).toBe(1.0);
  });
  it("reduces 0.6%/month for early take-up (max −36% at 60)", () => {
    expect(cppAdjustmentFactor(60)).toBeCloseTo(0.64, 10);
  });
  it("increases 0.7%/month for late take-up (max +42% at 70)", () => {
    expect(cppAdjustmentFactor(70)).toBeCloseTo(1.42, 10);
  });
  it("clamps outside the 60–70 window", () => {
    expect(cppAdjustmentFactor(55)).toBe(cppAdjustmentFactor(60));
    expect(cppAdjustmentFactor(75)).toBe(cppAdjustmentFactor(70));
  });
});

describe("calcRealReturn", () => {
  it("computes the Fisher real return", () => {
    expect(calcRealReturn(0.075, 0.025)).toBeCloseTo(1.075 / 1.025 - 1, 12);
  });
  it("is zero when nominal equals inflation", () => {
    expect(calcRealReturn(0.03, 0.03)).toBeCloseTo(0, 12);
  });
});

describe("calcTarget", () => {
  const base = {
    expected_return: 0.075,
    expected_inflation: 0.025,
    swr: 0.035,
    target_annual_income: 80000,
    cpp_monthly: 1000,
    oas_monthly: 500,
    cpp_start_age: 65,
  };

  it("at 65+: (spending − govt) / SWR", () => {
    const target = calcTarget({ ...base, target_retirement_age: 65 });
    expect(target).toBeCloseTo((80000 - 18000) / 0.035, 6);
  });

  it("before 65: bridge annuity plus discounted steady-state capital", () => {
    const retireAge = 60;
    const rReal = calcRealReturn(0.075, 0.025);
    const bridgeYears = 5;
    const bridge = 80000 * (1 - Math.pow(1 + rReal, -bridgeYears)) / rReal;
    const at65 = (80000 - 18000) / 0.035 / Math.pow(1 + rReal, bridgeYears);
    expect(calcTarget({ ...base, target_retirement_age: retireAge })).toBeCloseTo(bridge + at65, 6);
  });

  it("never needs less than zero when government income covers spending", () => {
    const target = calcTarget({
      ...base, target_retirement_age: 65, target_annual_income: 10000,
    });
    expect(target).toBe(0);
  });
});

describe("project", () => {
  const flatProfile = {
    expected_return: 0.025,
    expected_inflation: 0.025, // real return = 0
    current_age: 40,
    target_retirement_age: 42,
    target_annual_income: 0,
  };

  it("with zero real return, balance grows only by contributions and vests", () => {
    const points = project(flatProfile, 1000, 100, 0, [{ year: 2027, value: 500 }], 2026);
    expect(points).toHaveLength(3); // years 0..2
    expect(points[0]).toMatchObject({ year: 2026, age: 40, balance: 1000 + 1200 });
    expect(points[1].balance).toBe(1000 + 2400 + 500);
  });

  it("applies compound growth monthly", () => {
    const growProfile = { ...flatProfile, expected_return: 0.05, expected_inflation: 0 };
    const [first] = project(growProfile, 10000, 0, 0, [], 2026);
    expect(first.balance).toBe(Math.round(10000 * 1.05)); // 12 months at (1.05)^(1/12)
  });
});

describe("findRetirementYear / goalTimeline", () => {
  const points = [
    { year: 2026, age: 40, balance: 100, target: 300 },
    { year: 2027, age: 41, balance: 250, target: 300 },
    { year: 2028, age: 42, balance: 400, target: 300 },
  ];

  it("finds the first year balance meets target", () => {
    expect(findRetirementYear(points)).toBe(2028);
  });

  it("returns null when the target is never reached", () => {
    expect(findRetirementYear(points.map((p) => ({ ...p, target: 1e9 })))).toBe(null);
  });

  it("maps goals to the first year they are hit", () => {
    const goals = [{ target_amount: 200 }, { target_amount: 999999 }];
    const [hit, missed] = goalTimeline(goals, points);
    expect(hit).toMatchObject({ hitYear: 2027, hitAge: 41 });
    expect(missed).toMatchObject({ hitYear: null, hitAge: null });
  });
});
