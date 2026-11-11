/**
 * Per-debt figures a lender works from when assessing a new loan: what each
 * debt costs per month, and — for credit cards — the limit, which lenders
 * count whether or not it's been used.
 */

export const PAYMENTS_PER_YEAR: Record<string, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
};

/** A repayment with no frequency recorded is taken as monthly, the usual default. */
export function monthlyRepayment(debt: { repaymentAmount: number | null; repaymentFrequency: string | null }): number | null {
  if (!debt.repaymentAmount) return null;
  const perYear = PAYMENTS_PER_YEAR[debt.repaymentFrequency ?? "MONTHLY"] ?? 12;
  return (debt.repaymentAmount * perYear) / 12;
}

export function describeVehicle(asset: {
  name: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  registration?: string | null;
}): string {
  const makeModel = [asset.year, asset.make, asset.model].filter(Boolean).join(" ");
  const base = makeModel || asset.name;
  return asset.registration ? `${base} (rego ${asset.registration})` : base;
}
