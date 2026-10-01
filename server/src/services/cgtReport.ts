import { prisma } from "../db.js";
import { computeDisposal, discountRateFor, netCapitalGain } from "./cgt.js";
import { saleGainsBetween } from "./assetSaleCgt.js";

/**
 * Every share/ETF/crypto sale in a financial year, with the net capital gain
 * worked out per entity. Shared by the Capital Gains report and the tax
 * summary so the two can't disagree.
 */
export async function capitalGainsForYear(financialYearId: string) {
  const [disposals, dividends] = await Promise.all([
    prisma.investmentDisposal.findMany({
      where: { financialYearId },
      include: {
        security: true,
        allocations: { include: { parcel: true } },
        investmentAccount: { include: { entity: true } },
      },
      orderBy: { disposalDate: "asc" },
    }),
    prisma.investmentDividend.findMany({
      where: { financialYearId },
      include: { security: true, investmentAccount: { include: { entity: true } } },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const rows = disposals.map((d) => {
    const entity = d.investmentAccount.entity;
    const parcelsById = new Map(d.allocations.map((a) => [a.parcelId, a.parcel]));
    const result = computeDisposal(
      d,
      d.allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity })),
      parcelsById,
      entity.entityType
    );
    const gainSlices = result.allocations.filter((a) => a.grossGain > 0);
    const eligibleSlices = gainSlices.filter((a) => a.discountEligible).length;
    return {
      id: d.id,
      disposalDate: d.disposalDate,
      code: d.security.code,
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.entityType,
      quantity: d.quantity,
      proceeds: result.proceeds,
      costBase: result.costBase,
      grossGain: result.grossGain,
      // Whether the 12-month discount applies to this sale's gain. The
      // dollar discount is worked out per entity, after losses — see byEntity.
      discount: gainSlices.length === 0 ? "NONE" : eligibleSlices === gainSlices.length ? "YES" : eligibleSlices === 0 ? "NO" : "PART",
      kind: "SHARES" as "SHARES" | "ASSET",
      exemptPortion: 0,
      notes: [] as string[],
      parcels: result.allocations.map((a) => ({
        acquisitionDate: a.acquisitionDate as Date | null,
        quantity: a.quantity,
        costBase: a.costBase,
        grossGain: a.grossGain,
        discountEligible: a.discountEligible,
      })),
    };
  });

  // Property and other assets marked as sold in the year, owner by owner.
  const fy = await prisma.financialYear.findUnique({ where: { id: financialYearId } });
  const assetSales = fy ? await saleGainsBetween(fy.startDate, fy.endDate) : [];
  for (const s of assetSales) {
    rows.push({
      id: `sale-${s.assetId}-${s.entityId}`,
      disposalDate: s.disposalDate,
      code: s.assetName,
      entityId: s.entityId,
      entityName: s.entityName,
      entityType: s.entityType,
      quantity: Math.round(s.share * 10000) / 100,
      proceeds: s.proceeds,
      costBase: s.costBase,
      grossGain: s.grossGain,
      discount: s.grossGain <= 0 ? "NONE" : s.discountEligible ? "YES" : "NO",
      parcels: [
        { acquisitionDate: null, quantity: 1, costBase: s.costBase, grossGain: s.grossGain, discountEligible: s.discountEligible },
      ],
      kind: "ASSET",
      exemptPortion: s.exemptPortion,
      notes: s.notes,
    });
  }

  const entityIds = [...new Set(rows.map((r) => r.entityId))];
  const byEntity = entityIds.map((entityId) => {
    const entityRows = rows.filter((r) => r.entityId === entityId);
    const { entityName, entityType } = entityRows[0];
    const discountRate = discountRateFor(entityType);
    return {
      entityId,
      entityName,
      entityType,
      discountRate,
      disposalCount: entityRows.length,
      ...netCapitalGain(
        entityRows.flatMap((r) => r.parcels),
        discountRate
      ),
    };
  });

  return { rows, byEntity, dividends };
}
