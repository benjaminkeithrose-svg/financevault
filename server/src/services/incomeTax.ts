/**
 * Income tax estimates, for the after-tax property figures and the borrowing
 * estimate. Resident rates from the ATO's "Tax rates – Australian resident"
 * (reference/sources/tax-rates-residents.pdf), plus the 2% Medicare levy
 * with its low-income phase-in (none up to the threshold, then 10c in each
 * dollar over it until the full 2% applies). The threshold is the $27,222
 * quoted in the saved ATO Medicare levy surcharge section; later years'
 * figures are a little higher — check the ATO "Medicare levy" page (still on
 * the link pack's to-get list). Offsets and the Medicare levy surcharge
 * aren't included — these are estimates, not a tax return.
 */

// [income from, tax at that point, rate above it]
type Bracket = [number, number, number];

const RESIDENT: Record<string, Bracket[]> = {
  "2024-25": [
    [0, 0, 0],
    [18_200, 0, 0.16],
    [45_000, 4_288, 0.3],
    [135_000, 31_288, 0.37],
    [190_000, 51_638, 0.45],
  ],
  "2025-26": [
    [0, 0, 0],
    [18_200, 0, 0.16],
    [45_000, 4_288, 0.3],
    [135_000, 31_288, 0.37],
    [190_000, 51_638, 0.45],
  ],
  "2026-27": [
    [0, 0, 0],
    [18_200, 0, 0.15],
    [45_000, 4_020, 0.3],
    [135_000, 31_020, 0.37],
    [190_000, 51_370, 0.45],
  ],
};
export const LATEST_RATES_YEAR = "2026-27";
export const MEDICARE_LEVY = 0.02;
export const MEDICARE_LOW_INCOME_THRESHOLD = 27_222;

/** Medicare levy on a single person's taxable income, with the low-income phase-in. */
export function medicareLevy(taxableIncome: number): number {
  if (taxableIncome <= MEDICARE_LOW_INCOME_THRESHOLD) return 0;
  return Math.min(taxableIncome * MEDICARE_LEVY, (taxableIncome - MEDICARE_LOW_INCOME_THRESHOLD) * 0.1);
}

/** The rates for a year; a year past the table uses the latest and says so. */
export function ratesFor(year: string): { brackets: Bracket[]; year: string; known: boolean } {
  if (RESIDENT[year]) return { brackets: RESIDENT[year], year, known: true };
  const years = Object.keys(RESIDENT).sort();
  const use = year < years[0] ? years[0] : years[years.length - 1];
  return { brackets: RESIDENT[use], year: use, known: false };
}

/** Income tax plus Medicare levy on a resident individual's taxable income. */
export function individualTax(taxableIncome: number, year = LATEST_RATES_YEAR): number {
  if (!(taxableIncome > 0)) return 0;
  const { brackets } = ratesFor(year);
  let b = brackets[0];
  for (const x of brackets) if (taxableIncome > x[0]) b = x;
  return b[1] + (taxableIncome - b[0]) * b[2] + medicareLevy(taxableIncome);
}

/** The top rate that applies to the last dollar, including Medicare. */
export function marginalRate(taxableIncome: number, year = LATEST_RATES_YEAR): number {
  const { brackets } = ratesFor(year);
  let rate = 0;
  for (const x of brackets) if (taxableIncome > x[0]) rate = x[2];
  const upper = MEDICARE_LOW_INCOME_THRESHOLD / 0.8; // where the phase-in reaches the full 2%
  if (taxableIncome <= MEDICARE_LOW_INCOME_THRESHOLD) return rate;
  return taxableIncome < upper ? rate + 0.1 : rate + MEDICARE_LEVY;
}

/**
 * How a change in taxable income changes an individual's tax — e.g. a
 * rental loss reducing it (negative gearing). Positive = more tax to pay.
 */
export function taxChange(baseIncome: number, change: number, year = LATEST_RATES_YEAR): number {
  return individualTax(baseIncome + change, year) - individualTax(baseIncome, year);
}

/**
 * Flat rates for owners that aren't individuals. Trusts aren't taxed
 * themselves — their net income is taxed in the beneficiaries' hands.
 */
export function flatRateFor(entityType: string): { rate: number | null; note: string } {
  switch (entityType) {
    case "COMPANY":
      return { rate: 0.25, note: "Company at the 25% base rate entity rate (30% if it doesn't qualify)." };
    case "SMSF":
    case "SUPER_FUND":
      return { rate: 0.15, note: "Super fund at 15% (nil on income supporting retirement pensions)." };
    case "TRUST":
    case "UNIT_TRUST":
    case "HOLDING_TRUST":
      return { rate: null, note: "A trust isn't taxed itself — its net income is taxed in the beneficiaries' hands." };
    default:
      return { rate: null, note: "No tax estimate for this kind of owner." };
  }
}
