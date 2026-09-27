import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { financialYearBounds, financialYearLabelForDate } from "./financialYear.js";

/**
 * Business use of a vehicle: the logbook, each year's odometer readings and
 * running costs, and the schedule the accountant needs at tax time. How the
 * business share is used depends on who owns the vehicle in the app's
 * structure (ATO, "Deductions for motor vehicle expenses"):
 *
 * - A person (an employee, or a sole trader) or a partnership: the logbook
 *   method — the business-use percentage of all the car's costs, including
 *   its decline in value. A logbook of at least 12 continuous weeks is good
 *   for the year it's kept and the next four, with odometer readings every
 *   year.
 * - A company or trust: can't use the logbook method; it claims the actual
 *   costs. Private use by a director, employee or working beneficiary is a
 *   car fringe benefit — with a logbook and odometer records the operating
 *   cost method taxes only the private share; without them, the statutory
 *   formula (20% of the car's cost) applies.
 * - A super fund: members and relatives can't use the fund's assets.
 */

export type Treatment = "LOGBOOK" | "COMPANY_TRUST" | "SUPER_FUND";

export function treatmentFor(entityType: string): Treatment {
  if (["COMPANY", "TRUST", "UNIT_TRUST", "HOLDING_TRUST"].includes(entityType)) return "COMPANY_TRUST";
  if (["SMSF", "SUPER_FUND"].includes(entityType)) return "SUPER_FUND";
  return "LOGBOOK";
}

export const TREATMENT_TEXT: Record<Treatment, { title: string; explain: string }> = {
  LOGBOOK: {
    title: "Logbook method",
    explain:
      "The owner claims the business share of all the car's costs, including its decline in value — as work-related car expenses for an employee, or motor vehicle expenses for a sole trader or partnership.",
  },
  COMPANY_TRUST: {
    title: "Actual costs, with fringe benefits tax on private use",
    explain:
      "A company or trust can't use the logbook method: it claims the car's actual costs. Private use by a director, employee or beneficiary who works in the business is a car fringe benefit. The logbook and odometer readings let the operating cost method tax only the private share; without them, the statutory formula (20% of the car's cost) applies. Private use by someone who doesn't work in the business is a question for your accountant.",
  },
  SUPER_FUND: {
    title: "Not for private use",
    explain: "A super fund's assets can't be used by its members or their relatives, so there's no private or business split to record.",
  },
};

/**
 * The car limit: the most of a car's cost that decline in value is worked
 * out on, by the financial year the car was bought (ATO, "Car thresholds").
 * Utes and vans built to carry a tonne or more aren't limited.
 */
const CAR_LIMITS: Record<string, number> = {
  "2018-19": 57_581,
  "2019-20": 57_581,
  "2020-21": 59_136,
  "2021-22": 60_733,
  "2022-23": 64_741,
  "2023-24": 68_108,
  "2024-25": 69_674,
  "2025-26": 69_674,
  "2026-27": 69_883,
};

export function carLimit(fy: string): number {
  if (CAR_LIMITS[fy]) return CAR_LIMITS[fy];
  const years = Object.keys(CAR_LIMITS).sort();
  return fy < years[0] ? 57_466 : CAR_LIMITS[years[years.length - 1]];
}

/** Cars have an 8-year effective life: diminishing value at 200% ÷ 8 = 25% a year. */
export const DIMINISHING_RATE = 0.25;
const DAY = 86_400_000;

/**
 * Decline in value for one financial year, diminishing value method: the
 * first year in proportion to the days it was held, then 25% of what's left
 * each year. Cars' cost is capped at the car limit for the year bought.
 */
export function declineInValue(opts: { cost: number; bought: Date; fy: string; isCar: boolean; sold?: Date | null }): { amount: number; base: number; capped: boolean } {
  const boughtFy = financialYearLabelForDate(opts.bought);
  const limit = carLimit(boughtFy);
  const capped = opts.isCar && opts.cost > limit;
  const base = capped ? limit : opts.cost;
  if (opts.fy < boughtFy) return { amount: 0, base, capped };
  let value = base;
  let fy = boughtFy;
  for (let guard = 0; guard < 60; guard++) {
    const { start, end } = financialYearBounds(fy);
    const from = fy === boughtFy ? opts.bought : start;
    const soldHere = opts.sold && opts.sold >= start && opts.sold <= end;
    if (opts.sold && opts.sold < start) return { amount: 0, base, capped };
    const to = soldHere ? opts.sold! : end;
    const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));
    const share = Math.min(1, days / 365);
    const amount = value * DIMINISHING_RATE * share;
    if (fy === opts.fy) return { amount: Math.round(amount), base, capped };
    value -= amount;
    const next = Number(fy.slice(0, 4)) + 1;
    fy = `${next}-${String((next + 1) % 100).padStart(2, "0")}`;
  }
  return { amount: 0, base, capped };
}

export const COST_FIELDS = [
  { key: "fuel", label: "Fuel and oil (or charging)" },
  { key: "registration", label: "Registration and CTP" },
  { key: "insurance", label: "Insurance" },
  { key: "repairs", label: "Servicing, repairs and tyres" },
  { key: "interest", label: "Interest on the car loan" },
  { key: "leasePayments", label: "Lease payments" },
  { key: "other", label: "Other car costs" },
] as const;
type CostKey = (typeof COST_FIELDS)[number]["key"];

/** Road vehicles that can be used for work; boats, jet skis, caravans and trailers can't carry a logbook claim. */
export const BUSINESS_USE_TYPES = ["CAR", "MOTORCYCLE", "CAMPERVAN", "OTHER"];

const LOGBOOK_YEARS = 5;
const LOGBOOK_MIN_DAYS = 84; // 12 weeks

function fyStartYear(fy: string) {
  return Number(fy.slice(0, 4));
}

export async function businessUseSchedule(assetId: string, fy: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      entity: { select: { id: true, name: true, entityType: true } },
      ownerships: { select: { id: true } },
      logbooks: { orderBy: { startDate: "desc" }, include: { document: { select: { id: true, originalFilename: true } } } },
      vehicleYears: { where: { fyLabel: fy } },
    },
  });
  if (!asset || asset.assetType !== "VEHICLE") throw new HttpError(404, "Vehicle not found");
  const treatment = treatmentFor(asset.entity.entityType);
  const person = await prisma.person.findFirst({ where: { entityId: asset.entityId }, select: { id: true, name: true } });
  const year = asset.vehicleYears[0] ?? null;
  const { start, end } = financialYearBounds(fy);

  // The logbook for the year: the latest one kept by the end of the year,
  // and no more than four years before it.
  const logbook =
    asset.logbooks.find((l) => {
      const keptFy = financialYearLabelForDate(l.startDate);
      return l.startDate <= end && fyStartYear(fy) - fyStartYear(keptFy) < LOGBOOK_YEARS;
    }) ?? null;
  const logbookPercent = logbook && logbook.totalKm > 0 ? Math.min(100, (logbook.businessKm / logbook.totalKm) * 100) : null;
  const businessPercent = year?.businessPercent ?? logbookPercent;

  const isCar = asset.vehicleType === "CAR" || asset.vehicleType === "CAMPERVAN" || !asset.vehicleType;
  const worked =
    asset.acquisitionCost && asset.acquisitionDate
      ? declineInValue({ cost: asset.acquisitionCost, bought: asset.acquisitionDate, fy, isCar, sold: asset.disposalDate })
      : null;
  const decline = year?.declineInValue ?? worked?.amount ?? 0;

  const costs: Array<{ key: string; label: string; amount: number }> = COST_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    amount: (year?.[f.key as CostKey] as number | null | undefined) ?? 0,
  }));
  costs.push({ key: "declineInValue", label: "Decline in value (depreciation)", amount: decline });
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);

  const km =
    year?.openingOdometer != null && year?.closingOdometer != null && year.closingOdometer >= year.openingOdometer
      ? year.closingOdometer - year.openingOdometer
      : null;
  const pct = businessPercent ?? 0;

  const warnings: string[] = [];
  const notes: string[] = [];
  if (treatment !== "SUPER_FUND") {
    if (!logbook) {
      warnings.push(
        treatment === "LOGBOOK"
          ? "No logbook covers this year. Keep one for 12 continuous weeks that are typical of the year — without it, the most that can be claimed is 5,000 km at the cents-per-km rate."
          : "No logbook covers this year, so fringe benefits tax on private use falls back to the statutory formula (20% of the car's cost)."
      );
    } else {
      const days = Math.round((logbook.endDate.getTime() - logbook.startDate.getTime()) / DAY) + 1;
      if (days < LOGBOOK_MIN_DAYS) warnings.push(`The logbook covers ${days} days — it needs at least 12 continuous weeks (84 days).`);
      const lastFy = fyStartYear(financialYearLabelForDate(logbook.startDate)) + LOGBOOK_YEARS - 1;
      if (fyStartYear(fy) === lastFy) notes.push("This is the last year this logbook can be used. Keep a new one next year.");
    }
    if (year?.openingOdometer == null || year?.closingOdometer == null) {
      warnings.push("Record the odometer at the start and end of the year — it's needed every year a logbook is relied on.");
    }
    if (year?.businessPercent != null && logbookPercent != null && Math.abs(year.businessPercent - logbookPercent) >= 0.5) {
      notes.push(
        `This year's business share (${year.businessPercent.toFixed(1)}%) differs from the logbook's (${logbookPercent.toFixed(1)}%). If the car's use has changed, a new logbook is the evidence.`
      );
    }
  }
  if (worked?.capped) {
    notes.push(`Decline in value is worked out on the car limit, $${worked.base.toLocaleString("en-AU")}, not the full price. Utes and vans built to carry a tonne or more aren't limited.`);
  }
  if (worked && year?.declineInValue == null) {
    notes.push("Decline in value is worked out by the diminishing value method over 8 years (25% a year). If your accountant uses a different figure, enter theirs.");
  }
  if (asset.ownerships.length > 0) notes.push("This vehicle is owned in shares. Each owner claims only the costs they paid — worth checking with your accountant.");
  if (treatment === "COMPANY_TRUST") {
    notes.push("A business registered for GST works out decline in value on the cost less the GST it claimed back.");
  }

  // Companies and trusts: the fringe benefits figures the accountant needs.
  let fbt: null | { privatePercent: number; operatingCostTaxable: number; statutoryBase: number; statutoryTaxable: number } = null;
  if (treatment === "COMPANY_TRUST" && asset.acquisitionCost) {
    const heldYears = asset.acquisitionDate ? (end.getTime() - asset.acquisitionDate.getTime()) / (365.25 * DAY) : 0;
    const base = heldYears > 4 ? (asset.acquisitionCost * 2) / 3 : asset.acquisitionCost;
    const privatePercent = 100 - pct;
    fbt = {
      privatePercent,
      operatingCostTaxable: Math.round((totalCosts * privatePercent) / 100),
      statutoryBase: Math.round(base),
      statutoryTaxable: Math.round(base * 0.2),
    };
  }

  const claim = treatment === "LOGBOOK" ? Math.round((totalCosts * pct) / 100) : treatment === "COMPANY_TRUST" ? Math.round(totalCosts) : 0;

  return {
    asset: { id: asset.id, name: asset.name, vehicleType: asset.vehicleType, registration: asset.registration, make: asset.make, model: asset.model, year: asset.year },
    fy,
    period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    owner: { ...asset.entity, personId: person?.id ?? null, personName: person?.name ?? null },
    treatment,
    treatmentTitle: TREATMENT_TEXT[treatment].title,
    treatmentExplain: TREATMENT_TEXT[treatment].explain,
    logbook: logbook
      ? {
          id: logbook.id,
          startDate: logbook.startDate.toISOString().slice(0, 10),
          endDate: logbook.endDate.toISOString().slice(0, 10),
          totalKm: logbook.totalKm,
          businessKm: logbook.businessKm,
          percent: logbookPercent,
          validUntilFy: `${fyStartYear(financialYearLabelForDate(logbook.startDate)) + LOGBOOK_YEARS - 1}-${String((fyStartYear(financialYearLabelForDate(logbook.startDate)) + LOGBOOK_YEARS) % 100).padStart(2, "0")}`,
          document: logbook.document,
        }
      : null,
    year: year
      ? { ...year, updatedAt: undefined }
      : null,
    km,
    businessKm: km !== null && businessPercent !== null ? Math.round((km * businessPercent) / 100) : null,
    businessPercent,
    workedDecline: worked,
    costs,
    totalCosts: Math.round(totalCosts),
    claim,
    fbt,
    warnings,
    notes,
  };
}

export type BusinessUseSchedule = Awaited<ReturnType<typeof businessUseSchedule>>;
