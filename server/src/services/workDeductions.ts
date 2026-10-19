/**
 * Work-related deductions for employees (IDEAS.md idea 10), from the ATO's
 * "Work-related deductions" and "Motor vehicle and car expenses" sections
 * (reference/sources). Three rules apply to every claim: you spent the money
 * yourself and weren't reimbursed; it's directly related to earning your
 * income; and you have a record to prove it.
 */

/** Cents per kilometre, by financial year (ATO, "Cents per kilometre method"). */
const CAR_RATE: Record<string, number> = {
  "2020-21": 0.72,
  "2021-22": 0.72,
  "2022-23": 0.78,
  "2023-24": 0.85,
  "2024-25": 0.88,
  "2025-26": 0.88,
  "2026-27": 0.91,
};
export const CAR_KM_CAP = 5_000;

/** Working from home, fixed rate per work hour (ATO, "Fixed rate method"). */
const WFH_RATE: Record<string, number> = {
  "2022-23": 0.67,
  "2023-24": 0.67,
  "2024-25": 0.7,
  "2025-26": 0.7,
};

/** Items for work costing this much or less can be claimed straight away; dearer ones are depreciated. */
export const IMMEDIATE_DEDUCTION_LIMIT = 300;

function rateFor(table: Record<string, number>, fy: string): { rate: number; year: string; known: boolean } {
  if (table[fy] !== undefined) return { rate: table[fy], year: fy, known: true };
  const years = Object.keys(table).sort();
  const use = fy < years[0] ? years[0] : years[years.length - 1];
  return { rate: table[use], year: use, known: false };
}

export const carRateFor = (fy: string) => rateFor(CAR_RATE, fy);
export const wfhRateFor = (fy: string) => rateFor(WFH_RATE, fy);

/** A cents-per-km claim: capped at 5,000 km a car. */
export function carClaim(km: number, fy: string): { amount: number; kmCounted: number; capped: boolean; rate: number } {
  const { rate } = carRateFor(fy);
  const kmCounted = Math.min(Math.max(0, km), CAR_KM_CAP);
  return { amount: Math.round(kmCounted * rate * 100) / 100, kmCounted, capped: km > CAR_KM_CAP, rate };
}

export function wfhClaim(hours: number, fy: string): { amount: number; rate: number; rateKnown: boolean } {
  const { rate, known } = wfhRateFor(fy);
  return { amount: Math.round(Math.max(0, hours) * rate * 100) / 100, rate, rateKnown: known };
}

export interface DeductionCategory {
  key: string;
  label: string;
  canClaim: string;
  records: string;
  /** The saved ATO source this comes from (reference/sources file). */
  source: string;
}

export const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  {
    key: "CAR",
    label: "Car",
    canClaim:
      "Driving for work: between work sites, to clients or customers, or carrying bulky equipment. Not normally home to work. Cents per km (up to 5,000 km) or the logbook method.",
    records: "A diary of work trips for cents per km; a 12-week logbook and receipts for the logbook method.",
    source: "car-own-or-lease",
  },
  {
    key: "TRAVEL",
    label: "Other travel, parking and tolls",
    canClaim: "Public transport, taxis and rideshare, parking and tolls on work trips, and overnight work travel (accommodation, meals).",
    records: "Receipts, and a travel diary for trips of 6 nights or more.",
    source: "work-related-deductions",
  },
  {
    key: "WORK_FROM_HOME",
    label: "Working from home",
    canClaim:
      "Fixed rate per hour worked at home (covers power, phone, internet, stationery), plus depreciation of work equipment — or actual costs.",
    records: "A record of every hour worked from home for the fixed rate, and one bill for each cost it covers.",
    source: "work-related-deductions",
  },
  {
    key: "CLOTHING",
    label: "Uniforms and protective clothing",
    canClaim: "Compulsory or registered uniforms, occupation-specific and protective clothing, and laundering them. Not everyday clothes.",
    records: "Receipts; a record of how laundry costs are worked out.",
    source: "work-related-deductions",
  },
  {
    key: "SELF_EDUCATION",
    label: "Self-education",
    canClaim: "Courses, conferences and seminars that maintain or improve the skills for your current job — not to get a new one.",
    records: "Receipts, and how the course relates to your current work.",
    source: "self-education",
  },
  {
    key: "TOOLS",
    label: "Tools, computers and equipment",
    canClaim: `The work-use share of tools and equipment. $${IMMEDIATE_DEDUCTION_LIMIT} or less: claim it straight away; more: depreciate it over its effective life.`,
    records: "Receipts, and how the work-use percentage is worked out.",
    source: "work-related-deductions",
  },
  {
    key: "PHONE_INTERNET",
    label: "Phone and internet",
    canClaim: "The work-use share, if not already covered by the working-from-home fixed rate.",
    records: "Bills, and a 4-week diary showing work use.",
    source: "work-related-deductions",
  },
  {
    key: "MEMBERSHIPS",
    label: "Union and professional fees",
    canClaim: "Union fees, professional association memberships and work-related subscriptions.",
    records: "Receipts or the annual statement.",
    source: "work-related-deductions",
  },
  { key: "OTHER", label: "Other work costs", canClaim: "Anything else spent to earn the income, not reimbursed.", records: "Receipts.", source: "work-related-deductions" },
];
