import { prisma } from "../db.js";
import { computePosition, parcelCostBase, remainingQuantity, type AllocationLike } from "./cgt.js";

/** Most recent price per security, as a lookup. */
export async function latestPrices(securityIds: string[]) {
  const prices = await prisma.securityPrice.findMany({
    where: { securityId: { in: securityIds } },
    orderBy: { priceDate: "desc" },
  });
  const byId = new Map<string, { price: number; priceDate: Date; source: string }>();
  for (const p of prices) {
    if (!byId.has(p.securityId)) byId.set(p.securityId, { price: p.price, priceDate: p.priceDate, source: p.source });
  }
  return byId;
}

/**
 * Current positions for an account: what's still held after disposals, what
 * it cost, and what it's worth where a price is known.
 */
export async function positionsForAccount(investmentAccountId: string) {
  const [parcels, disposals] = await Promise.all([
    prisma.investmentParcel.findMany({
      where: { investmentAccountId },
      include: { security: true, allocations: true },
      orderBy: { acquisitionDate: "asc" },
    }),
    prisma.investmentDisposal.findMany({
      where: { investmentAccountId },
      include: { allocations: true },
    }),
  ]);

  const allAllocations: AllocationLike[] = disposals.flatMap((d) =>
    d.allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity }))
  );

  const bySecurity = new Map<string, typeof parcels>();
  for (const parcel of parcels) {
    const list = bySecurity.get(parcel.securityId) ?? [];
    list.push(parcel);
    bySecurity.set(parcel.securityId, list);
  }

  const priceMap = await latestPrices([...bySecurity.keys()]);

  return [...bySecurity.entries()]
    .map(([securityId, securityParcels]) => {
      const priceRow = priceMap.get(securityId) ?? null;
      const position = computePosition({
        securityId,
        parcels: securityParcels,
        allocations: allAllocations,
        latestPrice: priceRow?.price ?? null,
        priceDate: priceRow?.priceDate ?? null,
      });
      return {
        ...position,
        security: securityParcels[0].security,
        priceSource: priceRow?.source ?? null,
        parcels: securityParcels
          .map((p) => ({
            id: p.id,
            acquisitionDate: p.acquisitionDate,
            acquisitionType: p.acquisitionType,
            quantity: p.quantity,
            remainingQuantity: remainingQuantity(p, allAllocations),
            unitPrice: p.unitPrice,
            brokerage: p.brokerage,
            costBase: parcelCostBase(p),
            notes: p.notes,
          }))
          .filter((p) => p.remainingQuantity > 0 || p.quantity === 0),
      };
    })
    .filter((p) => p.quantity > 0 || p.parcels.length > 0);
}
