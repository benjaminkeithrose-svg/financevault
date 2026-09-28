import { prismaAll } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { assess } from "./assessment.js";
import { financialYearLabelForDate } from "./financialYear.js";

/**
 * The assessment as it stood when a considered property was bought, kept
 * unchanged (a frozen copy of the working assessment), then compared with
 * what really happened: the price and buying costs paid, and each year's
 * rent, running costs and cash from Profit year by year. An estimate can be
 * corrected later, but the original and the date of the change are kept and
 * shown.
 */

export const ESTIMATES = {
  price: "Price",
  buyingCosts: "Stamp duty and buying costs",
  rent: "Rent a year",
  runningCosts: "Running costs a year",
  cashYear: "Cash a year",
} as const;
export type EstimateField = keyof typeof ESTIMATES;

interface Correction {
  field: string;
  from: number | string | null;
  to: number | string | null;
  at: string;
}

const parse = <T>(json: string | null | undefined, fallback: T): T => {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Keeps the assessment as it stands now, frozen, at the moment it's bought. */
export async function freezeAssessment(assetId: string, at = new Date()) {
  const a = await assess(assetId);
  if (!a) return null;
  const expected = a.columns[0];
  const estimates: Record<EstimateField, number | null> = {
    price: a.price,
    buyingCosts: a.purchase.stampDuty !== null ? a.purchase.stampDuty + a.purchase.otherCosts : a.purchase.otherCosts || null,
    rent: expected.inputs.rent,
    runningCosts: expected.inputs.costs,
    cashYear: expected.figures.cashAfterTax ?? expected.figures.cashBeforeTax,
  };
  const { id: _id, createdAt: _c, updatedAt: _u, frozenAt: _f, snapshot: _s, corrections: _k, assetId: _a, ...inputs } =
    (await prismaAll.propertyAssessment.findFirst({ where: { assetId, frozenAt: null } })) ?? ({} as Record<string, unknown>);
  return prismaAll.propertyAssessment.create({
    data: {
      ...(inputs as object),
      assetId,
      frozenAt: at,
      snapshot: JSON.stringify({ estimates, afterTax: expected.figures.cashAfterTax !== null, assessment: a }),
    },
  });
}

export async function estimateVsActual(assetId: string) {
  const frozen = await prismaAll.propertyAssessment.findFirst({ where: { assetId, frozenAt: { not: null } }, orderBy: { frozenAt: "desc" } });
  if (!frozen) return null;
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new HttpError(404, "Property not found");
  const snap = parse<{ estimates: Record<EstimateField, number | null>; afterTax: boolean }>(frozen.snapshot, { estimates: {} as Record<EstimateField, number | null>, afterTax: false });
  const corrections = parse<Correction[]>(frozen.corrections, []);
  const current = { ...snap.estimates };
  for (const c of corrections) if (c.field in current) current[c.field as EstimateField] = c.to as number | null;

  const firstYear = financialYearLabelForDate(asset.acquisitionDate ?? frozen.frozenAt!);
  const years = (await prismaAll.propertyProfitYear.findMany({ where: { assetId }, orderBy: { fyLabel: "asc" } }))
    .filter((y) => y.fyLabel >= firstYear)
    .map((y) => ({
      fyLabel: y.fyLabel,
      soFar: y.source === "AUTO" && !y.final,
      rent: y.rent,
      runningCosts: y.costs,
      cash: y.cashAfterTax ?? y.cashBeforeTax,
      cashAfterTax: y.cashAfterTax !== null,
    }));

  return {
    frozenAt: frozen.frozenAt,
    estimates: current,
    original: snap.estimates,
    afterTax: snap.afterTax,
    corrections,
    actual: { price: asset.acquisitionCost, buyingCosts: asset.buyingCosts },
    years,
  };
}

export async function correctEstimate(assetId: string, field: EstimateField, value: number | null) {
  const frozen = await prismaAll.propertyAssessment.findFirst({ where: { assetId, frozenAt: { not: null } }, orderBy: { frozenAt: "desc" } });
  if (!frozen) throw new HttpError(404, "There's no assessment kept from when it was bought.");
  const now = (await estimateVsActual(assetId))!;
  const corrections = parse<Correction[]>(frozen.corrections, []);
  corrections.push({ field, from: now.estimates[field] ?? null, to: value, at: new Date().toISOString() });
  await prismaAll.propertyAssessment.update({ where: { id: frozen.id }, data: { corrections: JSON.stringify(corrections) } });
}

/** A passed-on record's reason can be corrected; the original and the date stay with it. */
export async function correctPassedOnReason(assetId: string, reason: string | null) {
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "PASSED_ON") throw new HttpError(400, "Only a property you passed on has a reason to correct.");
  const trail = parse<Correction[]>(asset.recordCorrections, []);
  trail.push({ field: "passedOnReason", from: asset.passedOnReason, to: reason, at: new Date().toISOString() });
  await prismaAll.asset.update({ where: { id: assetId }, data: { passedOnReason: reason, recordCorrections: JSON.stringify(trail) } });
}
