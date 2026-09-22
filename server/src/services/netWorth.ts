import { prisma } from "../db.js";
import { positionsForAccount } from "./positions.js";

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

const MORTGAGE_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"];

export async function computeLiveBreakdown(entityId?: string) {
  const where = entityId ? { entityId } : {};
  const [assets, accounts, liabilities, investmentAccounts] = await Promise.all([
    prisma.asset.findMany({ where }),
    prisma.account.findMany({ where }),
    prisma.liability.findMany({ where }),
    prisma.investmentAccount.findMany({ where }),
  ]);

  const { value: holdingsValue, valuedAtCost: holdingsAtCost } = await valueHoldings(investmentAccounts);

  const sumType = (types: string[]) =>
    assets.filter((a) => types.includes(a.assetType)).reduce((s, a) => s + (a.currentValue ?? 0), 0);

  const cash = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0) + sumType(["CASH"]);
  const propertyValue = sumType(["PROPERTY", "COMMERCIAL_PROPERTY"]);
  // Manually-entered investment assets sit alongside tracked holdings. Both
  // are counted, because there is no link between the two and silently
  // dropping either would be wrong — but if both are present the same
  // shares may be counted twice, so that is flagged rather than hidden.
  const manualInvestmentValue = sumType(["SHARES", "MANAGED_FUND"]);
  const investmentValue = manualInvestmentValue + holdingsValue;
  const superValue = sumType(["SUPERANNUATION"]);
  const vehicleValue = sumType(["VEHICLE"]);
  // Anything not in a named category still counts — a type added later
  // (or sent directly to the API) must not fall out of the total.
  const NAMED_ASSET_TYPES = ["CASH", "PROPERTY", "COMMERCIAL_PROPERTY", "SHARES", "MANAGED_FUND", "SUPERANNUATION", "VEHICLE"];
  const otherAssets = assets
    .filter((a) => !NAMED_ASSET_TYPES.includes(a.assetType))
    .reduce((s, a) => s + (a.currentValue ?? 0), 0);
  const totalAssets = cash + propertyValue + investmentValue + superValue + vehicleValue + otherAssets;

  const sumLiabilityType = (types: string[]) =>
    liabilities.filter((l) => types.includes(l.liabilityType)).reduce((s, l) => s + (l.currentBalance ?? 0), 0);

  const mortgages = sumLiabilityType(MORTGAGE_TYPES);
  const creditCards = sumLiabilityType(["CREDIT_CARD"]);
  const personalLoans = sumLiabilityType(["PERSONAL_LOAN"]);
  const vehicleLoans = sumLiabilityType(["VEHICLE_LOAN"]);
  const NAMED_LIABILITY_TYPES = [...MORTGAGE_TYPES, "CREDIT_CARD", "PERSONAL_LOAN", "VEHICLE_LOAN"];
  const otherLiabilities = liabilities
    .filter((l) => !NAMED_LIABILITY_TYPES.includes(l.liabilityType))
    .reduce((s, l) => s + (l.currentBalance ?? 0), 0);
  const totalLiabilities = mortgages + creditCards + personalLoans + vehicleLoans + otherLiabilities;

  return {
    cash,
    propertyValue,
    investmentValue,
    investmentBreakdown: {
      fromHoldings: holdingsValue,
      fromManualAssets: manualInvestmentValue,
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
  };
}

