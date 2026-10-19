import { prisma } from "../db.js";
import { computeLiveBreakdown } from "./netWorth.js";

/**
 * The whole family's net worth is saved once a month without anyone having
 * to remember, so the history on the Net Worth page fills itself in. Checked
 * at start-up and every few hours while the app is running; a month that
 * already has a snapshot (automatic or taken by hand) is left alone.
 */
export async function ensureMonthlySnapshot(now = new Date()): Promise<boolean> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const existing = await prisma.netWorthSnapshot.count({ where: { entityId: null, asAtDate: { gte: monthStart } } });
  // Nothing recorded yet means nothing to chart.
  if (existing > 0 || (await prisma.asset.count()) + (await prisma.account.count()) === 0) return false;
  const b = await computeLiveBreakdown();
  await prisma.netWorthSnapshot.create({
    data: {
      asAtDate: now,
      entityId: null,
      cash: b.cash,
      propertyValue: b.propertyValue,
      investmentValue: b.investmentValue,
      superValue: b.superValue,
      vehicleValue: b.vehicleValue,
      otherAssets: b.otherAssets,
      totalAssets: b.totalAssets,
      mortgages: b.mortgages,
      creditCards: b.creditCards,
      personalLoans: b.personalLoans,
      vehicleLoans: b.vehicleLoans,
      otherLiabilities: b.otherLiabilities,
      totalLiabilities: b.totalLiabilities,
      netPosition: b.netPosition,
      notes: "Saved automatically for the month",
    },
  });
  return true;
}
