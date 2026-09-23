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

/** "Partner of Sam · Parent of Kid One, Kid Two" from a person's family links. */
export function familySummary(p: {
  familyFrom?: Array<{ relationshipType: string; toPerson: { name: string } }>;
  familyTo?: Array<{ relationshipType: string; fromPerson: { name: string } }>;
}): string {
  const partners = [
    ...(p.familyFrom ?? []).filter((f) => f.relationshipType === "PARTNER").map((f) => f.toPerson.name),
    ...(p.familyTo ?? []).filter((f) => f.relationshipType === "PARTNER").map((f) => f.fromPerson.name),
  ];
  const children = (p.familyFrom ?? []).filter((f) => f.relationshipType === "PARENT").map((f) => f.toPerson.name);
  const parents = (p.familyTo ?? []).filter((f) => f.relationshipType === "PARENT").map((f) => f.fromPerson.name);
  return [
    partners.length ? `Partner of ${partners.join(", ")}` : "",
    children.length ? `Parent of ${children.join(", ")}` : "",
    parents.length ? `Child of ${parents.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const ITEM_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "APPLIANCE", label: "Appliance" },
  { value: "HEATING_COOLING", label: "Heating / cooling" },
  { value: "HOT_WATER", label: "Hot water" },
  { value: "SOLAR", label: "Solar / battery" },
  { value: "POOL_SPA", label: "Pool / spa" },
  { value: "SECURITY", label: "Security / smart home" },
  { value: "FURNITURE", label: "Furniture" },
  { value: "ELECTRONICS", label: "Electronics" },
  { value: "FIXTURE", label: "Fixture / fitting" },
  { value: "EQUIPMENT", label: "Tools / equipment" },
  { value: "OTHER", label: "Other" },
];

export function itemCategoryLabel(value?: string | null): string {
  return ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? "Item";
}

/** "expired" / "soon" (within 60 days) / null, for highlighting a date. */
export function dueState(date?: string | null): "expired" | "soon" | null {
  if (!date) return null;
  const days = (new Date(date).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return null;
}

/** Each kind of debt has one list. Used by the lists and by a debt's page to find its way back. */
export const DEBT_LISTS = {
  property: {
    route: "/loans",
    title: "Property loans",
    blurb: "Home, investment and commercial property loans.",
    types: ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"],
  },
  vehicle: {
    route: "/vehicle-loans",
    title: "Vehicle & boat loans",
    blurb: "Loans for cars, motorcycles, boats, jet skis, caravans and the like.",
    types: ["VEHICLE_LOAN"],
  },
  cards: {
    route: "/credit-cards",
    title: "Credit cards",
    blurb: "Each card with its limit — lenders count the limit, not what's owing.",
    types: ["CREDIT_CARD"],
  },
  other: {
    route: "/liabilities",
    title: "Personal & other debts",
    blurb: "Personal loans and anything else owed.",
    types: ["PERSONAL_LOAN", "OTHER"],
  },
} as const;

export type DebtList = keyof typeof DEBT_LISTS;

export function debtListFor(liabilityType: string): DebtList {
  const found = (Object.keys(DEBT_LISTS) as DebtList[]).find((k) =>
    (DEBT_LISTS[k].types as readonly string[]).includes(liabilityType)
  );
  return found ?? "other";
}

/** Kinds offered on the Other assets page. */
export const OTHER_ASSET_TYPES: Array<{ value: string; label: string }> = [
  { value: "EQUIPMENT", label: "Equipment & tools" },
  { value: "COLLECTIBLE", label: "Collectibles, art & jewellery" },
  { value: "CASH", label: "Cash held elsewhere" },
  { value: "OTHER", label: "Other" },
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  VEHICLE: "Vehicle or boat",
  SUPERANNUATION: "Super",
  SHARES: "Shares (entered by value)",
  MANAGED_FUND: "Managed fund (entered by value)",
  ...Object.fromEntries(OTHER_ASSET_TYPES.map((t) => [t.value, t.label])),
};

export function assetTypeLabel(type: string): string {
  return ASSET_TYPE_LABELS[type] ?? humanize(type);
}

/** The list page a (top-level) asset belongs on. */
export function assetListRoute(type: string): string {
  if (type === "VEHICLE") return "/vehicles";
  if (type === "SUPERANNUATION") return "/super";
  return "/assets";
}
