import { prisma } from "../db.js";
import { discountRateFor, isDiscountEligible } from "./cgt.js";
import { shareOf } from "./ownership.js";

/**
 * The capital gain on something sold that isn't a share parcel — mainly
 * property. Cost base = purchase price + buying costs + capital
 * improvements + selling costs, less any building write-off (capital works)
 * deductions claimed — the ATO requires that reduction for property bought
 * after 13 May 1997 (Rental expenses guide, "Cost base adjustments for
 * capital works"). Each owner's share of the gain goes to that
 * owner, with their own discount (none for a company, a third for a super
 * fund, half otherwise) when it was held more than 12 months. The main
 * residence exemption only applies to people, not trusts or companies.
 * Cars are exempt from CGT, and super, cash and household items aren't
 * worked out here.
 */

export const CGT_ASSET_TYPES = ["PROPERTY", "COMMERCIAL_PROPERTY", "SHARES", "MANAGED_FUND", "COLLECTIBLE", "OTHER"];
const PERSONAL_TYPES = ["INDIVIDUAL", "JOINT"];

export interface SaleGainRow {
  assetId: string;
  assetName: string;
  entityId: string;
  entityName: string;
  entityType: string;
  share: number;
  disposalDate: Date;
  proceeds: number;
  costBase: number;
  exemptPortion: number; // 0–1, main residence
  grossGain: number; // this owner's share, after any main residence exemption
  discountEligible: boolean;
  notes: string[];
}

type SoldAsset = {
  id: string;
  name: string;
  assetType: string;
  entityId: string;
  acquisitionDate: Date | null;
  acquisitionCost: number | null;
  disposalDate: Date | null;
  disposalValue: number | null;
  buyingCosts: number | null;
  improvementsCost: number | null;
  sellingCosts: number | null;
  capitalWorksClaimed?: number | null;
  mainResidence: string | null;
  mainResidencePercent: number | null;
  ownerships: Array<{ ownerEntityId: string; ownershipPercent: number; startDate?: Date | null; endDate?: Date | null }>;
  property?: { purchasePrice: number | null; purchaseDate: Date | null } | null;
  commercialProperty?: { purchasePrice: number | null; purchaseDate: Date | null } | null;
};

/** Property bought from this date has its cost base reduced by capital works deductions. */
export const CAPITAL_WORKS_REDUCTION_FROM = new Date(Date.UTC(1997, 4, 14));

const formatAud = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

/**
 * How much comes off the cost base for building write-off deductions. Only
 * for property bought after 13 May 1997 (an unknown purchase date is treated
 * as after, the usual case), and never more than the cost itself.
 */
export function capitalWorksReduction(claimed: number | null, acquired: Date | null, fullCost: number): number {
  if (!claimed || claimed <= 0) return 0;
  if (acquired && acquired < CAPITAL_WORKS_REDUCTION_FROM) return 0;
  return Math.min(claimed, Math.max(0, fullCost));
}

export function saleGains(asset: SoldAsset, entities: Map<string, { name: string; entityType: string }>): SaleGainRow[] {
  if (!asset.disposalDate || !CGT_ASSET_TYPES.includes(asset.assetType)) return [];
  const purchase = asset.acquisitionCost ?? asset.property?.purchasePrice ?? asset.commercialProperty?.purchasePrice ?? null;
  const acquired = asset.acquisitionDate ?? asset.property?.purchaseDate ?? asset.commercialProperty?.purchaseDate ?? null;
  const fullCost = (purchase ?? 0) + (asset.buyingCosts ?? 0) + (asset.improvementsCost ?? 0) + (asset.sellingCosts ?? 0);
  const proceeds = asset.disposalValue ?? 0;
  const notes: string[] = [];
  const capitalWorks = capitalWorksReduction(asset.capitalWorksClaimed ?? null, acquired, fullCost);
  const costBase = fullCost - capitalWorks;
  if (capitalWorks > 0) {
    notes.push(`${formatAud(capitalWorks)} of building write-off (capital works) deductions taken off the cost, as the ATO requires.`);
  } else if (asset.capitalWorksClaimed && acquired && acquired < CAPITAL_WORKS_REDUCTION_FROM) {
    notes.push("Bought before 14 May 1997, so building write-off deductions don't reduce the cost.");
  }
  if (purchase === null) notes.push("No purchase price recorded — the gain assumes it cost nothing.");
  if (!acquired) notes.push("No purchase date recorded — the 12-month discount can't be checked.");
  const discountEligible = !!acquired && isDiscountEligible(acquired, asset.disposalDate);

  const owners = [...new Set([asset.entityId, ...asset.ownerships.map((o) => o.ownerEntityId)])];
  return owners
    .map((entityId) => {
      const share = shareOf(asset, entityId, asset.disposalDate!);
      const entity = entities.get(entityId) ?? { name: "Unknown owner", entityType: "OTHER" };
      const personal = PERSONAL_TYPES.includes(entity.entityType);
      const exemptPortion =
        !personal || !asset.mainResidence || asset.mainResidence === "NONE"
          ? 0
          : asset.mainResidence === "FULL"
            ? 1
            : Math.min(1, Math.max(0, (asset.mainResidencePercent ?? 0) / 100));
      const rowNotes = [...notes];
      if (asset.mainResidence && asset.mainResidence !== "NONE" && !personal) {
        rowNotes.push(`The main residence exemption doesn't apply to ${entity.name}, as it isn't a person.`);
      }
      return {
        assetId: asset.id,
        assetName: asset.name,
        entityId,
        entityName: entity.name,
        entityType: entity.entityType,
        share,
        disposalDate: asset.disposalDate!,
        proceeds: proceeds * share,
        costBase: costBase * share,
        exemptPortion,
        grossGain: (proceeds - costBase) * share * (1 - exemptPortion),
        discountEligible,
        notes: rowNotes,
      };
    })
    .filter((r) => r.share > 0);
}

/** Every such sale between two dates, owner by owner. */
export async function saleGainsBetween(start: Date, end: Date): Promise<SaleGainRow[]> {
  const [assets, entities] = await Promise.all([
    prisma.asset.findMany({
      where: { disposalDate: { gte: start, lte: end }, parentAssetId: null, assetType: { in: CGT_ASSET_TYPES } },
      include: {
        ownerships: true,
        property: { select: { purchasePrice: true, purchaseDate: true } },
        commercialProperty: { select: { purchasePrice: true, purchaseDate: true } },
      },
      orderBy: { disposalDate: "asc" },
    }),
    prisma.entity.findMany({ select: { id: true, name: true, entityType: true } }),
  ]);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return assets.flatMap((a) => saleGains(a, byId));
}

export { discountRateFor };
