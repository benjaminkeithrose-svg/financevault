import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const reportsRouter = Router();

// ---------------------------------------------------------------------------
// Property performance (residential) — spec section 22. Commercial property
// has its own, richer per-property metrics and portfolio view.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/property-performance",
  asyncHandler(async (_req, res) => {
    const properties = await prisma.property.findMany({
      include: { asset: true, entity: true, liabilities: true },
    });

    const rows = await Promise.all(
      properties.map(async (p) => {
        const links = await prisma.documentLink.findMany({
          where: { targetType: "PROPERTY", targetId: p.id },
          include: { document: { include: { taxCategory: true } } },
        });
        let grossRent = 0;
        let expenses = 0;
        for (const link of links) {
          const doc = link.document;
          const group = doc.taxCategory?.group;
          if (!doc.amount) continue;
          if (group === "INCOME") grossRent += doc.amount;
          if (group === "EXPENSE") expenses += doc.amount;
        }
        const debt = p.liabilities.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
        const interest = p.liabilities.reduce((s, l) => s + (l.currentBalance ?? 0) * ((l.interestRate ?? 0) / 100), 0);
        const currentValue = p.asset.currentValue ?? null;
        const equity = currentValue !== null ? currentValue - debt : null;
        const netCashFlow = grossRent - expenses - interest;
        const estimatedYield = currentValue ? grossRent / currentValue : null;

        return {
          id: p.id,
          name: p.asset.name,
          address: p.address,
          entityName: p.entity.name,
          purchasePrice: p.purchasePrice,
          currentValue,
          debt,
          equity,
          grossRent,
          expenses,
          interest: Math.round(interest * 100) / 100,
          netCashFlow,
          estimatedYield,
        };
      })
    );

    res.json({
      rows,
      formula: "netCashFlow = grossRent - expenses - estimatedInterest; estimatedYield = grossRent / currentValue",
    });
  })
);

// ---------------------------------------------------------------------------
// Investment portfolio — spec section 22. No live market pricing (record-
// keeping only, per the brief), so unrealised gain/loss is explicitly
// reported as unavailable rather than guessed at.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/investment-portfolio",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.investmentAccount.findMany({ include: { entity: true, holdings: true } });

    let totalCostBase = 0;
    let realisedGainLoss = 0;
    const rows = accounts.map((a) => {
      const costBase = a.holdings.reduce((s, h) => s + (h.costBase ?? h.purchasePrice ?? 0), 0);
      const realised = a.holdings
        .filter((h) => h.disposalDate && h.salePrice !== null)
        .reduce((s, h) => s + ((h.salePrice ?? 0) - (h.costBase ?? h.purchasePrice ?? 0) - (h.brokerage ?? 0)), 0);
      totalCostBase += costBase;
      realisedGainLoss += realised;
      return {
        id: a.id,
        institution: a.institution,
        entityName: a.entity.name,
        accountType: a.accountType,
        holdingCount: a.holdings.length,
        costBase,
        realisedGainLoss: realised,
      };
    });

    res.json({
      rows,
      totals: { totalCostBase, realisedGainLoss },
      note:
        "Current value, unrealised gain/loss, distribution income and fees are not shown — this application does not fetch live market prices or track dividend/distribution transactions. Cost base and realised gain/loss come from your own recorded holdings.",
    });
  })
);

// ---------------------------------------------------------------------------
// Tax summary by financial year — spec section 22.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/tax-summary",
  asyncHandler(async (req, res) => {
    const financialYearId = req.query.financialYearId ? String(req.query.financialYearId) : undefined;
    const records = await prisma.taxRecord.findMany({
      where: financialYearId ? { financialYearId } : undefined,
      include: { entity: true, financialYear: true },
    });

    const byEntity = new Map<string, { entityId: string; entityName: string; income: number; expenses: number; capitalGains: number; capitalLosses: number; needsReview: number }>();
    for (const r of records) {
      const key = r.entityId;
      if (!byEntity.has(key)) {
        byEntity.set(key, { entityId: r.entityId, entityName: r.entity.name, income: 0, expenses: 0, capitalGains: 0, capitalLosses: 0, needsReview: 0 });
      }
      const row = byEntity.get(key)!;
      const amount = r.amount ?? 0;
      if (r.recordType === "INCOME") row.income += amount;
      if (r.recordType === "EXPENSE") row.expenses += amount;
      if (r.recordType === "CAPITAL_GAIN") row.capitalGains += amount;
      if (r.recordType === "CAPITAL_LOSS") row.capitalLosses += amount;
      if (r.status === "NEEDS_REVIEW") row.needsReview += 1;
    }

    res.json({ rows: Array.from(byEntity.values()) });
  })
);

// ---------------------------------------------------------------------------
// Debt summary — spec section 22.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/debt-summary",
  asyncHandler(async (_req, res) => {
    const liabilities = await prisma.liability.findMany({
      include: { entity: true, securityProperty: { include: { asset: true } }, securityCommercialProperty: { include: { asset: true } } },
    });

    const rows = liabilities.map((l) => {
      const securedValue = l.securityProperty?.asset.currentValue ?? l.securityCommercialProperty?.asset.currentValue ?? null;
      const lvr = securedValue && l.currentBalance ? l.currentBalance / securedValue : null;
      return {
        id: l.id,
        name: l.name,
        liabilityType: l.liabilityType,
        entityName: l.entity.name,
        lender: l.lender,
        currentBalance: l.currentBalance,
        interestRate: l.interestRate,
        repaymentAmount: l.repaymentAmount,
        securedAsset: l.securityProperty?.address ?? l.securityCommercialProperty?.name ?? null,
        lvr,
      };
    });

    const totalDebt = liabilities.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
    res.json({ rows, totalDebt, formula: "LVR = loan balance / current value of the property securing it" });
  })
);
