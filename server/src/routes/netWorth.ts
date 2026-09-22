import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { positionsForAccount } from "../services/positions.js";

export const netWorthRouter = Router();

const MORTGAGE_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"];

async function computeLiveBreakdown(entityId?: string) {
  const where = entityId ? { entityId } : {};
  const [assets, accounts, liabilities, investmentAccounts] = await Promise.all([
    prisma.asset.findMany({ where }),
    prisma.account.findMany({ where }),
    prisma.liability.findMany({ where }),
    prisma.investmentAccount.findMany({ where }),
  ]);

  // Real holdings, valued at the latest price held for each security. Where
  // no price is known the cost base is used instead of dropping the holding
  // — leaving it out entirely would understate net worth, which is worse
  // than valuing it at what was paid. The count is reported so the figure
  // can be read for what it is.
  let holdingsValue = 0;
  let holdingsAtCost = 0;
  for (const account of investmentAccounts) {
    for (const position of await positionsForAccount(account.id)) {
      if (position.quantity <= 0) continue;
      if (position.marketValue === null) {
        holdingsValue += position.costBase;
        holdingsAtCost += 1;
      } else {
        holdingsValue += position.marketValue;
      }
    }
  }

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
  const otherAssets = sumType(["EQUIPMENT", "OTHER"]);
  const totalAssets = cash + propertyValue + investmentValue + superValue + vehicleValue + otherAssets;

  const sumLiabilityType = (types: string[]) =>
    liabilities.filter((l) => types.includes(l.liabilityType)).reduce((s, l) => s + (l.currentBalance ?? 0), 0);

  const mortgages = sumLiabilityType(MORTGAGE_TYPES);
  const creditCards = sumLiabilityType(["CREDIT_CARD"]);
  const personalLoans = sumLiabilityType(["PERSONAL_LOAN"]);
  const otherLiabilities = sumLiabilityType(["OTHER"]);
  const totalLiabilities = mortgages + creditCards + personalLoans + otherLiabilities;

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
    otherLiabilities,
    totalLiabilities,
    netPosition: totalAssets - totalLiabilities,
  };
}

netWorthRouter.get(
  "/preview",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    res.json(await computeLiveBreakdown(entityId));
  })
);

netWorthRouter.get(
  "/snapshots",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : null;
    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { entityId },
      include: { entity: true },
      orderBy: { asAtDate: "desc" },
    });
    res.json(snapshots);
  })
);

const snapshotInput = z.object({
  asAtDate: z.string().datetime(),
  entityId: z.string().optional().nullable(),
  cash: z.number(),
  propertyValue: z.number(),
  investmentValue: z.number(),
  superValue: z.number(),
  vehicleValue: z.number(),
  otherAssets: z.number(),
  totalAssets: z.number(),
  mortgages: z.number(),
  creditCards: z.number(),
  personalLoans: z.number(),
  otherLiabilities: z.number(),
  totalLiabilities: z.number(),
  netPosition: z.number(),
  notes: z.string().optional().nullable(),
});

netWorthRouter.post(
  "/snapshots",
  asyncHandler(async (req, res) => {
    const parsed = snapshotInput.parse(req.body);
    const snapshot = await prisma.netWorthSnapshot.create({
      data: { ...parsed, asAtDate: new Date(parsed.asAtDate) },
      include: { entity: true },
    });
    res.status(201).json(snapshot);
  })
);

netWorthRouter.delete(
  "/snapshots/:id",
  asyncHandler(async (req, res) => {
    await prisma.netWorthSnapshot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
