import { individualTax, LATEST_RATES_YEAR } from "./incomeTax.js";

/**
 * Borrowing capacity estimate (IDEAS.md idea 7) — roughly what most lenders
 * would lend, before talking to the broker. Built from what's public about
 * how lenders assess: APRA's serviceability buffer (APG 223 — 3 percentage
 * points), shaded rent and variable income, credit cards at a share of the
 * limit, existing loans as principal-and-interest at the buffered rate, and
 * APRA's debt-to-income limit (lending at 6× income or more capped at 20% of
 * a bank's new loans from February 2026). Every assumption is visible and
 * editable; the answer is a range. The lender's own calculator decides.
 */

export interface BorrowingAssumptions {
  /** Interest rate on the new loan, % a year. */
  newLoanRate: number;
  /** Added to every rate when assessing repayments (APRA: 3 percentage points). */
  buffer: number;
  /** Some lenders assess at no less than this rate, % a year (0 = none). */
  floorRate: number;
  newLoanTermYears: number;
  /** Remaining term assumed for existing loans without a maturity date. */
  existingTermYears: number;
  /** Share of each kind of income counted, %: [conservative, generous]. */
  variableShading: [number, number];
  rentShading: [number, number];
  /** Credit cards counted at this % of the limit each month: [conservative, generous]. */
  cardPercent: [number, number];
  /** Living expenses a month — the higher of what you declare and a benchmark is used. */
  declaredExpenses: number | null;
  benchmarkExpenses: number | null;
  /** Maximum loan-to-value ratio, %. */
  residentialLvr: number;
  commercialLvr: [number, number];
  smsfLvr: [number, number];
  /** Commercial interest cover required (net rent ÷ interest): [conservative, generous]. */
  commercialIcr: [number, number];
  /** Commercial loans are assessed at the rate plus this, % a year. */
  commercialBuffer: number;
}

export const DEFAULT_ASSUMPTIONS: BorrowingAssumptions = {
  newLoanRate: 6.0,
  buffer: 3,
  floorRate: 0,
  newLoanTermYears: 30,
  existingTermYears: 25,
  variableShading: [60, 80],
  rentShading: [70, 80],
  cardPercent: [3.8, 3.0],
  declaredExpenses: null,
  benchmarkExpenses: null,
  residentialLvr: 80,
  commercialLvr: [60, 70],
  smsfLvr: [60, 70],
  commercialIcr: [2.0, 1.5],
  commercialBuffer: 2,
};

export function withDefaults(saved: Partial<BorrowingAssumptions> | null | undefined): BorrowingAssumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...(saved ?? {}) };
}

/** Monthly principal-and-interest repayment. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = Math.max(1, Math.round(years * 12));
  if (principal <= 0) return 0;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** The loan a monthly repayment can carry. */
export function loanFromPayment(payment: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = Math.max(1, Math.round(years * 12));
  if (payment <= 0) return 0;
  return r === 0 ? payment * n : (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export interface IncomeInput {
  name: string;
  salary: number;
  variable: number;
  /** This person's share of rent from properties they own. */
  rent: number;
}

export interface DebtInput {
  name: string;
  balance: number;
  ratePct: number | null;
  remainingYears: number | null;
  /** Cards: assessed on the limit, not the balance. */
  cardLimit: number | null;
}

export interface Scenario {
  label: "Conservative" | "Generous";
  assessmentRate: number;
  grossIncome: number;
  countedIncome: number;
  tax: number;
  netIncomeMonthly: number;
  expensesMonthly: number;
  commitmentsMonthly: number;
  commitments: Array<{ name: string; monthly: number; how: string }>;
  surplusMonthly: number;
  maxNewLoan: number;
}

export interface ResidentialEstimate {
  scenarios: [Scenario, Scenario];
  totalIncome: number;
  existingDebt: number;
  /** The most that keeps total debt under 6× income (APRA's high-DTI line). */
  dtiLimitLoan: number;
  dtiWarning: string | null;
  notes: string[];
}

export function residentialEstimate(incomes: IncomeInput[], debts: DebtInput[], a: BorrowingAssumptions): ResidentialEstimate {
  const totalIncome = incomes.reduce((s, i) => s + i.salary + i.variable + i.rent, 0);
  const existingDebt = debts.reduce((s, d) => s + (d.cardLimit ?? d.balance), 0);
  const expensesMonthly = Math.max(a.declaredExpenses ?? 0, a.benchmarkExpenses ?? 0);
  const notes: string[] = [];
  if (!a.declaredExpenses && !a.benchmarkExpenses) notes.push("No living expenses entered — the estimate is far too high until you add them.");
  if (incomes.every((i) => !i.salary && !i.variable)) notes.push("No income recorded — add each person's salary on their page.");
  notes.push("Tax is worked out on the counted income at 2026-27 rates; lenders that add back negative gearing may lend a little more.");

  const scenario = (k: 0 | 1): Scenario => {
    const assessmentRate = Math.max(a.newLoanRate + a.buffer, a.floorRate);
    let tax = 0;
    let counted = 0;
    for (const i of incomes) {
      const personCounted = i.salary + i.variable * (a.variableShading[k] / 100) + i.rent * (a.rentShading[k] / 100);
      counted += personCounted;
      tax += individualTax(personCounted, LATEST_RATES_YEAR);
    }
    const commitments = debts.map((d) => {
      if (d.cardLimit !== null) {
        return { name: d.name, monthly: d.cardLimit * (a.cardPercent[k] / 100), how: `${a.cardPercent[k]}% of the $${Math.round(d.cardLimit).toLocaleString("en-AU")} limit` };
      }
      const rate = Math.max((d.ratePct ?? a.newLoanRate) + a.buffer, a.floorRate);
      const years = d.remainingYears ?? a.existingTermYears;
      return { name: d.name, monthly: monthlyPayment(d.balance, rate, years), how: `P&I at ${rate.toFixed(2)}% over ${Math.round(years)} years` };
    });
    const commitmentsMonthly = commitments.reduce((s, c) => s + c.monthly, 0);
    const netIncomeMonthly = (counted - tax) / 12;
    const surplusMonthly = netIncomeMonthly - expensesMonthly - commitmentsMonthly;
    return {
      label: k === 0 ? "Conservative" : "Generous",
      assessmentRate,
      grossIncome: totalIncome,
      countedIncome: counted,
      tax,
      netIncomeMonthly,
      expensesMonthly,
      commitmentsMonthly,
      commitments,
      surplusMonthly,
      maxNewLoan: loanFromPayment(surplusMonthly, assessmentRate, a.newLoanTermYears),
    };
  };
  const scenarios: [Scenario, Scenario] = [scenario(0), scenario(1)];
  const dtiLimitLoan = Math.max(0, 6 * totalIncome - existingDebt);
  const dtiWarning =
    totalIncome > 0 && scenarios[1].maxNewLoan > dtiLimitLoan
      ? `Borrowing more than ${formatK(dtiLimitLoan)} would take your debts to 6× your income or more. Banks can only make 20% of their new loans at that level (APRA, from February 2026), so some will cap you there.`
      : null;
  return { scenarios, totalIncome, existingDebt, dtiLimitLoan, dtiWarning, notes };
}

export interface PropertyLendingInput {
  name: string;
  value: number | null;
  netRent: number;
  existingDebt: number;
  ratePct: number;
  /** SMSF: contributions that can go to repayments, before the fund's 15% tax. */
  contributions?: number;
}

export interface PropertyLendingEstimate {
  name: string;
  range: Array<{ label: string; byServicing: number; byLvr: number | null; total: number; release: number }>;
  assessmentRate: number;
  notes: string[];
}

/**
 * Commercial, lease-doc and SMSF lending: the property carries the loan.
 * The most is the lower of what the net rent covers at the required interest
 * cover (assessed interest-only at the rate plus a buffer) and value × LVR.
 * Release = that, less what's already owed on it.
 */
export function propertyLending(p: PropertyLendingInput, lvr: [number, number], a: BorrowingAssumptions): PropertyLendingEstimate {
  const assessmentRate = p.ratePct + a.commercialBuffer;
  const income = p.netRent + (p.contributions ?? 0) * 0.85;
  const range = ([0, 1] as const).map((k) => {
    const byServicing = income > 0 ? income / (a.commercialIcr[k] * (assessmentRate / 100)) : 0;
    const byLvr = p.value ? p.value * (lvr[k] / 100) : null;
    const total = byLvr === null ? byServicing : Math.min(byServicing, byLvr);
    return {
      label: k === 0 ? `Conservative (cover ${a.commercialIcr[0]}×, ${lvr[0]}% LVR)` : `Generous (cover ${a.commercialIcr[1]}×, ${lvr[1]}% LVR)`,
      byServicing,
      byLvr,
      total,
      release: Math.max(0, total - p.existingDebt),
    };
  });
  const notes: string[] = [];
  if (!p.value) notes.push("No value recorded, so the LVR limit isn't applied.");
  if (p.netRent <= 0) notes.push("No net rent recorded — lenders assess commercial loans on the rent.");
  return { name: p.name, range, assessmentRate, notes };
}

function formatK(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
