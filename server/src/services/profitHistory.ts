import { prisma } from "../db.js";
import { financialYearLabelForDate } from "./financialYear.js";
import { propertyProfit } from "./propertyProfit.js";

/**
 * Each property's profit, year by year. The current financial year is saved
 * from the Property Profit report and keeps updating; once 30 June passes
 * the last figures saved for it become that year's, and it's marked final.
 * Earlier years can be typed in from an old tax return or the accountant's
 * rental schedule — a typed-in year is never overwritten.
 */

export async function saveCurrentProfitYear(now = new Date()): Promise<number> {
  const fyLabel = financialYearLabelForDate(now);
  // Years that have ended are final.
  await prisma.propertyProfitYear.updateMany({ where: { source: "AUTO", final: false, fyLabel: { lt: fyLabel } }, data: { final: true } });
  const { rows } = await propertyProfit();
  let saved = 0;
  for (const r of rows) {
    const existing = await prisma.propertyProfitYear.findUnique({ where: { assetId_fyLabel: { assetId: r.assetId, fyLabel } } });
    if (existing?.source === "ENTERED") continue;
    const data = {
      rent: r.rent,
      costs: r.rent - r.netIncome,
      interest: r.interest,
      depreciation: r.depreciation + r.capitalWorks,
      taxResult: r.taxResult,
      cashBeforeTax: r.cashBeforeTax,
      cashAfterTax: r.cashAfterTax,
      value: r.value,
    };
    await prisma.propertyProfitYear.upsert({
      where: { assetId_fyLabel: { assetId: r.assetId, fyLabel } },
      create: { assetId: r.assetId, fyLabel, source: "AUTO", ...data },
      update: data,
    });
    saved++;
  }
  return saved;
}

/** A property's years, oldest first, and each year's interest from its loans' statements (to fill in a past year). */
export async function profitHistory(assetId: string) {
  const years = await prisma.propertyProfitYear.findMany({ where: { assetId }, orderBy: { fyLabel: "asc" } });
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { property: true, commercialProperty: true } });
  const loans = asset
    ? await prisma.liability.findMany({
        where: {
          OR: [
            { securityAssetId: asset.id },
            ...(asset.property ? [{ securityPropertyId: asset.property.id }] : []),
            ...(asset.commercialProperty ? [{ securityCommercialPropertyId: asset.commercialProperty.id }] : []),
          ],
        },
        select: { id: true },
      })
    : [];
  const interest = await prisma.loanInterestYear.findMany({ where: { liabilityId: { in: loans.map((l) => l.id) } } });
  const interestByYear: Record<string, number> = {};
  for (const y of interest) interestByYear[y.fyLabel] = (interestByYear[y.fyLabel] ?? 0) + y.interestCharged;
  return { years, interestByYear };
}
