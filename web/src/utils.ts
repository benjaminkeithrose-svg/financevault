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
