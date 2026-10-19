/**
 * The buying sums, in one place: what it costs to buy, what's borrowed, what
 * it earns after costs, and what's left after the loan. Used by the
 * Acquisition Model page and by the assessment of a property you're
 * considering (residential or commercial), so there's one set of formulas.
 */

export interface AcquisitionInputs {
  purchasePrice: number;
  /** Stamp duty, legal, inspections, lender fees… everything on top of the price. */
  acquisitionCosts: number;
  /** % of the price borrowed. */
  lvr: number;
  /** Rent a year at full occupancy. */
  rent: number;
  /** 0–1. */
  occupancy: number;
  /** Income that isn't affected by vacancy (other income, outgoings recovered). */
  fixedIncome: number;
  /** Running costs a year. */
  expenses: number;
  /** % a year. */
  interestRate: number;
  repaymentType: "IO" | "PI";
  loanTermYears: number;
}

export function acquisitionFigures(f: AcquisitionInputs) {
  const purchasePrice = f.purchasePrice;
  const totalAcquisitionCost = purchasePrice + f.acquisitionCosts;
  const loan = purchasePrice * (f.lvr / 100);
  const requiredEquity = totalAcquisitionCost - loan;

  const effectiveRent = f.rent * f.occupancy;
  const grossIncome = effectiveRent + f.fixedIncome;
  const noi = grossIncome - f.expenses;

  const grossYield = purchasePrice ? grossIncome / purchasePrice : null;
  const netYield = purchasePrice ? noi / purchasePrice : null;

  const interestExpense = loan * (f.interestRate / 100);
  let annualDebtService = interestExpense;
  if (f.repaymentType === "PI") {
    const n = f.loanTermYears * 12;
    const r = f.interestRate / 100 / 12;
    const monthlyPayment = n > 0 && r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / (n || 1);
    annualDebtService = monthlyPayment * 12;
  }

  const cashFlowAfterFinancing = noi - annualDebtService;
  const dscr = annualDebtService ? noi / annualDebtService : null;
  const interestCoverage = interestExpense ? noi / interestExpense : null;
  const breakEvenOccupancy = f.rent > 0 ? (f.expenses + annualDebtService - f.fixedIncome) / f.rent : null;

  return {
    totalAcquisitionCost,
    requiredEquity,
    loan,
    lvr: f.lvr,
    grossIncome,
    noi,
    grossYield,
    netYield,
    capRate: netYield,
    interestExpense,
    annualDebtService,
    cashFlowAfterFinancing,
    equity: requiredEquity,
    dscr,
    interestCoverage,
    breakEvenOccupancy,
  };
}

export type AcquisitionFigures = ReturnType<typeof acquisitionFigures>;
