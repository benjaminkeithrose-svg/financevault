import { prisma } from "../db.js";
import { positionsForAccount } from "./positions.js";
import { ShareRow, shareOf } from "./ownership.js";

/**
 * The one place net worth is added up. The dashboard, the Net Worth page and
 * each entity's balance sheet all read from here, so the same assets can't
 * be totalled three different ways and show three different answers.
 */

/**
 * Real holdings, valued at the latest price held for each security. Where no
 * price is known the cost base is used instead of dropping the holding —
 * leaving it out entirely would understate net worth, which is worse than
 * valuing it at what was paid. The count is reported so the figure can be
 * read for what it is.
 */
export async function valueHoldings(investmentAccounts: Array<{ id: string }>) {
  let value = 0;
  let valuedAtCost = 0;
  for (const account of investmentAccounts) {
    for (const position of await positionsForAccount(account.id)) {
      if (position.quantity <= 0) continue;
      if (position.marketValue === null) {
        value += position.costBase;
        valuedAtCost += 1;
      } else {
        value += position.marketValue;
      }
    }
  }
  return { value, valuedAtCost };
}

// An SMSF's limited recourse loan is a property loan like any other.
const MORTGAGE_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN", "LRBA_LOAN"];

export interface BreakdownOptions {
  /**
   * For one entity's own figures: count its share of any unit trust it
   * holds units in. Off when entities are listed side by side, where the
   * trust has its own row and counting it again would double up.
   */
  lookThrough?: boolean;
}

type UnitHolding = { trustId: string; trustName: string; percent: number; value: number };

/**
 * Everything is added up at full value for the whole family (no entity
 * given). For one entity, each asset and loan counts at that entity's share
 * of it (services/ownership.ts), plus — when looking through — its share of
 * the net assets of unit trusts it holds units in.
 */
export async function computeLiveBreakdown(entityId?: string, options: BreakdownOptions = {}, visited: string[] = []) {
  const lookThrough = options.lookThrough ?? true;
  const ownedBy = entityId
    ? { OR: [{ entityId }, { ownerships: { some: { ownerEntityId: entityId } } }] }
    : {};
  const [assets, accounts, liabilities, investmentAccounts, unitRelations] = await Promise.all([
    // Sub-assets are part of their parent's value, so only top-level assets count.
    prisma.asset.findMany({ where: { ...ownedBy, parentAssetId: null }, include: { ownerships: true } }),
    prisma.account.findMany({ where: entityId ? { entityId } : {} }),
    prisma.liability.findMany({ where: ownedBy, include: { ownerships: true } }),
    prisma.investmentAccount.findMany({ where: entityId ? { entityId } : {} }),
    entityId && lookThrough
      ? prisma.entityRelationship.findMany({
          where: { fromEntityId: entityId, relationshipType: "UNITHOLDER" },
          include: { toEntity: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const share = (r: { entityId: string; ownerships: ShareRow[] }) => (entityId ? shareOf(r, entityId) : 1);
  const assetValue = (a: (typeof assets)[number]) => (a.currentValue ?? 0) * share(a);
  const debtValue = (l: (typeof liabilities)[number]) => (l.currentBalance ?? 0) * share(l);
  const sharedItems = entityId ? [...assets, ...liabilities].filter((r) => share(r) < 1).length : 0;

  const { value: holdingsValue, valuedAtCost: holdingsAtCost } = await valueHoldings(investmentAccounts);

  // A unit trust's units are worth the holder's share of its net assets
  // (never less than nothing). Nested trusts are followed, loops aren't.
  const unitHoldings: UnitHolding[] = [];
  for (const r of unitRelations) {
    if (!r.ownershipPercent || visited.includes(r.toEntityId) || r.toEntityId === entityId) continue;
    const trust = await computeLiveBreakdown(r.toEntityId, options, [...visited, entityId!]);
    unitHoldings.push({
      trustId: r.toEntityId,
      trustName: r.toEntity.name,
      percent: r.ownershipPercent,
      value: (Math.max(0, trust.netPosition) * r.ownershipPercent) / 100,
    });
  }
  const unitTrustValue = unitHoldings.reduce((s, u) => s + u.value, 0);

  const sumType = (types: string[]) => assets.filter((a) => types.includes(a.assetType)).reduce((s, a) => s + assetValue(a), 0);

  const byAssetType: Record<string, number> = {};
  for (const a of assets) byAssetType[a.assetType] = (byAssetType[a.assetType] ?? 0) + assetValue(a);
  if (holdingsValue > 0) byAssetType.INVESTMENT_HOLDINGS = holdingsValue;
  if (unitTrustValue > 0) byAssetType.UNIT_TRUST_UNITS = unitTrustValue;

  const cash = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0) + sumType(["CASH"]);
  const propertyValue = sumType(["PROPERTY", "COMMERCIAL_PROPERTY"]);
  // Manually-entered investment assets sit alongside tracked holdings. Both
  // are counted, because there is no link between the two and silently
  // dropping either would be wrong — but if both are present the same
  // shares may be counted twice, so that is flagged rather than hidden.
  const manualInvestmentValue = sumType(["SHARES", "MANAGED_FUND"]);
  const investmentValue = manualInvestmentValue + holdingsValue + unitTrustValue;
  const superValue = sumType(["SUPERANNUATION"]);
  const vehicleValue = sumType(["VEHICLE"]);
  // Anything not in a named category still counts — a type added later
  // (or sent directly to the API) must not fall out of the total.
  const NAMED_ASSET_TYPES = ["CASH", "PROPERTY", "COMMERCIAL_PROPERTY", "SHARES", "MANAGED_FUND", "SUPERANNUATION", "VEHICLE"];
  const otherAssets = assets.filter((a) => !NAMED_ASSET_TYPES.includes(a.assetType)).reduce((s, a) => s + assetValue(a), 0);
  const totalAssets = cash + propertyValue + investmentValue + superValue + vehicleValue + otherAssets;

  const sumLiabilityType = (types: string[]) =>
    liabilities.filter((l) => types.includes(l.liabilityType)).reduce((s, l) => s + debtValue(l), 0);

  const mortgages = sumLiabilityType(MORTGAGE_TYPES);
  const creditCards = sumLiabilityType(["CREDIT_CARD"]);
  const personalLoans = sumLiabilityType(["PERSONAL_LOAN"]);
  const vehicleLoans = sumLiabilityType(["VEHICLE_LOAN"]);
  const NAMED_LIABILITY_TYPES = [...MORTGAGE_TYPES, "CREDIT_CARD", "PERSONAL_LOAN", "VEHICLE_LOAN"];
  const otherLiabilities = liabilities
    .filter((l) => !NAMED_LIABILITY_TYPES.includes(l.liabilityType))
    .reduce((s, l) => s + debtValue(l), 0);
  const totalLiabilities = mortgages + creditCards + personalLoans + vehicleLoans + otherLiabilities;

  return {
    cash,
    propertyValue,
    investmentValue,
    investmentBreakdown: {
      fromHoldings: holdingsValue,
      fromManualAssets: manualInvestmentValue,
      fromUnitTrusts: unitTrustValue,
      positionsValuedAtCost: holdingsAtCost,
      possibleDoubleCount: holdingsValue > 0 && manualInvestmentValue > 0,
    },
    superValue,
    vehicleValue,
    otherAssets,
    totalAssets,
    mortgages,
    creditCards,
    personalLoans,
    vehicleLoans,
    otherLiabilities,
    totalLiabilities,
    netPosition: totalAssets - totalLiabilities,
    byAssetType,
    unitHoldings,
    sharedItems,
  };
}
