export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

/**
 * Cents included — for transaction amounts, where rounding to the dollar
 * would hide exactly what's about to be imported or recorded.
 */
export function formatCurrencyExact(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

// Australian financial year: 1 July -> 30 June, labelled "YYYY-YY".
export function financialYearLabelForToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? year : year - 1; // July onward starts the FY
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function humanize(value?: string | null): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Asks before deleting, and if the server refuses (for example because other
 * records still depend on this one) shows its reason instead of failing
 * silently. Returns true only if the delete went through.
 */
export async function confirmThenDelete(question: string, action: () => Promise<unknown>): Promise<boolean> {
  if (!window.confirm(question)) return false;
  try {
    await action();
    return true;
  } catch (err) {
    window.alert((err as Error).message);
    return false;
  }
}

export const VEHICLE_TYPES: Array<{ value: string; label: string }> = [
  { value: "CAR", label: "Car / ute / 4WD" },
  { value: "MOTORCYCLE", label: "Motorcycle" },
  { value: "BOAT", label: "Boat" },
  { value: "JET_SKI", label: "Jet ski" },
  { value: "CARAVAN", label: "Caravan" },
  { value: "CAMPERVAN", label: "Campervan / motorhome" },
  { value: "TRAILER", label: "Trailer" },
  { value: "OTHER", label: "Other vehicle" },
];

export function vehicleTypeLabel(value?: string | null): string {
  return VEHICLE_TYPES.find((t) => t.value === value)?.label ?? "Vehicle";
}

/** "2021 Toyota Hilux · rego ABC123", falling back to the asset's name. */
export function describeVehicle(a: {
  name: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  registration?: string | null;
}): string {
  const makeModel = [a.year, a.make, a.model].filter(Boolean).join(" ");
  return [makeModel || a.name, a.registration ? `rego ${a.registration}` : ""].filter(Boolean).join(" · ");
}

export const REPAYMENT_FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly", perYear: 52 },
  { value: "FORTNIGHTLY", label: "Fortnightly", perYear: 26 },
  { value: "MONTHLY", label: "Monthly", perYear: 12 },
  { value: "QUARTERLY", label: "Quarterly", perYear: 4 },
];

export function monthlyEquivalent(amount?: number | null, frequency?: string | null): number | null {
  if (!amount) return null;
  const perYear = REPAYMENT_FREQUENCIES.find((f) => f.value === (frequency || "MONTHLY"))?.perYear ?? 12;
  return (amount * perYear) / 12;
}

const LIABILITY_TYPE_LABELS: Record<string, string> = {
  HOME_LOAN: "Home loan",
  INVESTMENT_LOAN: "Investment property loan",
  COMMERCIAL_LOAN: "Commercial property loan",
  VEHICLE_LOAN: "Vehicle / boat loan",
  CREDIT_CARD: "Credit card",
  PERSONAL_LOAN: "Personal loan",
  OTHER: "Other",
};

export function liabilityTypeLabel(type: string): string {
  return LIABILITY_TYPE_LABELS[type] ?? humanize(type);
}
