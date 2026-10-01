import { PAYMENTS_PER_YEAR } from "./debts.js";
// Commercial property analytics — spec sections 6-21 (Phase 1, 2 & 3:
// acquisition/scenario modelling and portfolio roll-ups are handled
// separately in acquisitionModel.ts and the portfolio route).
//
// Every figure returned is a plain calculation over stored records, labelled
// with its formula and inputs so nothing is a hidden or implied number —
// none of this is investment advice or a recommendation.

export interface TenancyLike {
  id: string;
  tenantName: string;
  leaseExpiry: Date | null;
  currentBaseRent: number | null;
  rentPerAnnum: number | null;
  nlaOccupied: number | null;
  leaseStatus: string;
}

export interface OutgoingLike {
  amount: number;
  recoveredAmount: number | null;
}

export interface LoanLike {
  currentBalance: number | null;
  interestRate: number | null;
  repaymentAmount: number | null;
  repaymentFrequency: string | null;
}

const FREQUENCY_PAYMENTS_PER_YEAR = PAYMENTS_PER_YEAR;

function annualRent(t: TenancyLike): number {
  return t.rentPerAnnum ?? t.currentBaseRent ?? 0;
}

export function computeOccupancy(totalNla: number | null, tenancies: TenancyLike[]) {
  const activeTenancies = tenancies.filter((t) => t.leaseStatus === "ACTIVE");
  const occupiedNla = activeTenancies.reduce((sum, t) => sum + (t.nlaOccupied ?? 0), 0);
  const total = totalNla ?? null;
  return {
    totalNla: total,
    occupiedNla,
    vacantNla: total !== null ? Math.max(total - occupiedNla, 0) : null,
    occupancyPercent: total ? occupiedNla / total : null,
    vacancyPercent: total ? Math.max(1 - occupiedNla / total, 0) : null,
    formula: "occupancyPercent = occupiedNLA (active tenancies) / totalNLA",
  };
}

export function computeTenantConcentration(tenancies: TenancyLike[], totalNla: number | null) {
  const activeTenancies = tenancies.filter((t) => t.leaseStatus === "ACTIVE");
  const totalRent = activeTenancies.reduce((sum, t) => sum + annualRent(t), 0);
  const rows = activeTenancies
    .map((t) => ({
      tenancyId: t.id,
      tenantName: t.tenantName,
      annualRent: annualRent(t),
      percentOfRent: totalRent ? annualRent(t) / totalRent : null,
      nlaOccupied: t.nlaOccupied,
      percentOfNla: totalNla && t.nlaOccupied ? t.nlaOccupied / totalNla : null,
    }))
    .sort((a, b) => b.annualRent - a.annualRent);
  return {
    totalRent,
    tenants: rows,
    top3: rows.slice(0, 3),
    largestTenant: rows[0] ?? null,
    formula: "percentOfRent = tenant annual rent / total annual rent across active leases",
  };
}

export function computeWale(tenancies: TenancyLike[], asOf: Date = new Date()) {
  const activeTenancies = tenancies.filter((t) => t.leaseStatus === "ACTIVE" && t.leaseExpiry);
  if (activeTenancies.length === 0) {
    return { waleByLeaseYears: null, waleByRentYears: null, formula: null, leaseCount: 0 };
  }
  const yearsToExpiry = (t: TenancyLike) => {
    const ms = (t.leaseExpiry as Date).getTime() - asOf.getTime();
    return Math.max(ms / (1000 * 60 * 60 * 24 * 365.25), 0);
  };
  const waleByLeaseYears =
    activeTenancies.reduce((sum, t) => sum + yearsToExpiry(t), 0) / activeTenancies.length;

  const totalRent = activeTenancies.reduce((sum, t) => sum + annualRent(t), 0);
  const waleByRentYears = totalRent
    ? activeTenancies.reduce((sum, t) => sum + yearsToExpiry(t) * annualRent(t), 0) / totalRent
    : null;

  return {
    waleByLeaseYears,
    waleByRentYears,
    leaseCount: activeTenancies.length,
    formula: {
      byLease: "simple average of (lease expiry - today) across active leases, each lease weighted equally",
      byRent: "sum(years to expiry x annual rent) / total annual rent, across active leases",
    },
  };
}

export function computeIncomeAndNoi(tenancies: TenancyLike[], outgoings: OutgoingLike[], otherIncome = 0) {
  const activeTenancies = tenancies.filter((t) => t.leaseStatus === "ACTIVE");
  const grossRent = activeTenancies.reduce((sum, t) => sum + annualRent(t), 0);
  const recoveries = outgoings.reduce((sum, o) => sum + (o.recoveredAmount ?? 0), 0);
  const grossOperatingExpenses = outgoings.reduce((sum, o) => sum + o.amount, 0);
  const grossPropertyIncome = grossRent + otherIncome + recoveries;
  const noi = grossPropertyIncome - grossOperatingExpenses;
  return {
    grossRent,
    otherIncome,
    recoveries,
    grossPropertyIncome,
    grossOperatingExpenses,
    unrecoveredExpenses: grossOperatingExpenses - recoveries,
    noi,
    formula: "NOI = grossRent + otherIncome + recoveries - grossOperatingExpenses (loan principal/interest and income tax excluded)",
  };
}

export function computeYieldsAndCapRate(
  grossPropertyIncome: number,
  noi: number,
  propertyValue: number | null,
  valuationBasis: "current" | "purchase"
) {
  if (!propertyValue) {
    return { grossYield: null, netYield: null, capRate: null, propertyValue: null, valuationBasis };
  }
  return {
    grossYield: grossPropertyIncome / propertyValue,
    netYield: noi / propertyValue,
    capRate: noi / propertyValue,
    propertyValue,
    valuationBasis,
    formula: {
      grossYield: "grossPropertyIncome / propertyValue",
      netYield: "NOI / propertyValue",
      capRate: "NOI / propertyValue (identical formula to net yield; shown separately as it is the conventional commercial term)",
    },
  };
}

export function computeDebtMetrics(loans: LoanLike[], propertyValue: number | null) {
  const totalDebt = loans.reduce((sum, l) => sum + (l.currentBalance ?? 0), 0);
  const estimatedAnnualInterest = loans.reduce(
    (sum, l) => sum + (l.currentBalance ?? 0) * ((l.interestRate ?? 0) / 100),
    0
  );
  // A loan with no repayment amount recorded still costs money. Counting it
  // as zero would show the whole NOI as cash flow and a DSCR of "n/a", so
  // its estimated interest stands in (i.e. treated as interest-only) and the
  // number of loans estimated that way is reported alongside.
  let loansAssumedInterestOnly = 0;
  const annualDebtService = loans.reduce((sum, l) => {
    if (!l.repaymentAmount) {
      if ((l.currentBalance ?? 0) > 0) loansAssumedInterestOnly += 1;
      return sum + (l.currentBalance ?? 0) * ((l.interestRate ?? 0) / 100);
    }
    const paymentsPerYear = l.repaymentFrequency ? FREQUENCY_PAYMENTS_PER_YEAR[l.repaymentFrequency] ?? 12 : 12;
    return sum + l.repaymentAmount * paymentsPerYear;
  }, 0);
  const equity = propertyValue !== null ? propertyValue - totalDebt : null;
  const lvr = propertyValue ? totalDebt / propertyValue : null;
  return {
    totalDebt,
    equity,
    lvr,
    estimatedAnnualInterest,
    annualDebtService,
    loansAssumedInterestOnly,
    formula: {
      lvr: "total loan balance secured against this property / property value",
      equity: "property value - total loan balance",
      estimatedAnnualInterest: "sum(current balance x interest rate) per loan — a simple approximation, not an amortisation schedule",
      annualDebtService: "sum(repayment amount x payments per year) per loan; a loan with no repayment amount recorded uses its estimated annual interest (treated as interest-only)",
    },
  };
}

// DSCR and Interest Coverage — spec section 19. Analytical ratios only,
// never a prediction of lending approval.
export function computeCoverageRatios(noi: number, annualDebtService: number, estimatedAnnualInterest: number) {
  return {
    dscr: annualDebtService ? noi / annualDebtService : null,
    interestCoverageRatio: estimatedAnnualInterest ? noi / estimatedAnnualInterest : null,
    formula: {
      dscr: "NOI / annual debt service (interest + required principal repayments) — an analytical ratio, not a lending approval prediction",
      interestCoverageRatio: "NOI / annual interest expense",
    },
  };
}
