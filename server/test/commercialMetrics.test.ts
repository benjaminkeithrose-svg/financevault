import { describe, expect, it } from "vitest";
import { computeDebtMetrics } from "../src/services/commercialMetrics.js";

describe("commercial debt service", () => {
  it("uses recorded repayments where there are some", () => {
    const debt = computeDebtMetrics(
      [{ currentBalance: 500_000, interestRate: 6, repaymentAmount: 3_000, repaymentFrequency: "MONTHLY" }],
      1_000_000
    );
    expect(debt.annualDebtService).toBe(36_000);
    expect(debt.loansAssumedInterestOnly).toBe(0);
  });

  it("counts a loan with no repayment amount as interest-only, not as free", () => {
    const debt = computeDebtMetrics(
      [{ currentBalance: 900_000, interestRate: 6.8, repaymentAmount: null, repaymentFrequency: null }],
      1_750_000
    );
    expect(debt.annualDebtService).toBeCloseTo(61_200);
    expect(debt.loansAssumedInterestOnly).toBe(1);
  });
});
