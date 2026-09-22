import { Router } from "express";
import { prisma } from "../db.js";
import { computeDisposal } from "../services/cgt.js";
import { positionsForAccount } from "../services/positions.js";
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
// Investment portfolio — now parcel-level, with market value where a price
// is known. The previous version computed realised gain as
// (salePrice - costBase - brokerage) with no reference to quantity at all,
// so a sale of 100 units was reported as if it were one.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/investment-portfolio",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.investmentAccount.findMany({ include: { entity: true } });

    const rows = [];
    let totalCostBase = 0;
    let totalMarketValue = 0;
    let totalRealisedNetGain = 0;
    let totalFrankingCredits = 0;
    let unpricedCount = 0;

    for (const account of accounts) {
      const positions = await positionsForAccount(account.id);
      const disposals = await prisma.investmentDisposal.findMany({
        where: { investmentAccountId: account.id },
        include: { allocations: { include: { parcel: true } } },
      });
      const dividends = await prisma.investmentDividend.findMany({
        where: { investmentAccountId: account.id },
      });

      const costBase = positions.reduce((s, p) => s + p.costBase, 0);
      const marketValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
      const unpriced = positions.filter((p) => p.marketValue === null && p.quantity > 0).length;

      const realisedNetGain = disposals.reduce((sum, d) => {
        const parcelsById = new Map(d.allocations.map((a) => [a.parcelId, a.parcel]));
        return (
          sum +
          computeDisposal(
            d,
            d.allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity })),
            parcelsById,
            account.entity.entityType
          ).netGain
        );
      }, 0);

      const frankingCredits = dividends.reduce((s, d) => s + d.frankingCredit, 0);

      totalCostBase += costBase;
      totalMarketValue += marketValue;
      totalRealisedNetGain += realisedNetGain;
      totalFrankingCredits += frankingCredits;
      unpricedCount += unpriced;

      rows.push({
        id: account.id,
        institution: account.institution,
        entityName: account.entity.name,
        accountType: account.accountType,
        holdingCount: positions.length,
        costBase,
        marketValue,
        unrealisedGain: unpriced > 0 ? null : marketValue - costBase,
        unpricedCount: unpriced,
        realisedNetGain,
        frankingCredits,
      });
    }

    res.json({
      rows,
      totals: {
        totalCostBase,
        totalMarketValue,
        totalUnrealisedGain: unpricedCount > 0 ? null : totalMarketValue - totalCostBase,
        unpricedCount,
        realisedNetGain: totalRealisedNetGain,
        frankingCredits: totalFrankingCredits,
      },
      note:
        "Calculated from the parcels, disposals and dividends you recorded, using the most recent price held for each security. Realised gains apply the CGT discount per parcel based on how long it was held and the owning entity type. These are calculated figures for your accountant to confirm, not tax advice.",
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

// ---------------------------------------------------------------------------
// Capital gains for a financial year — the summary an accountant actually
// needs. Gains and losses are kept apart because losses offset gains BEFORE
// the discount is applied; netting them first would overstate the discount
// and understate the tax.
// ---------------------------------------------------------------------------

reportsRouter.get(
  "/capital-gains",
  asyncHandler(async (req, res) => {
    const financialYearId = req.query.financialYearId ? String(req.query.financialYearId) : undefined;
    if (!financialYearId) {
      res.status(400).json({ error: "financialYearId is required" });
      return;
    }

    const financialYear = await prisma.financialYear.findUnique({ where: { id: financialYearId } });
    if (!financialYear) {
      res.status(404).json({ error: "Financial year not found" });
      return;
    }

    const disposals = await prisma.investmentDisposal.findMany({
      where: { financialYearId },
      include: {
        security: true,
        allocations: { include: { parcel: true } },
        investmentAccount: { include: { entity: true } },
      },
      orderBy: { disposalDate: "asc" },
    });

    const dividends = await prisma.investmentDividend.findMany({
      where: { financialYearId },
      include: { security: true, investmentAccount: { include: { entity: true } } },
      orderBy: { paymentDate: "asc" },
    });

    const rows = disposals.map((d) => {
      const parcelsById = new Map(d.allocations.map((a) => [a.parcelId, a.parcel]));
      const result = computeDisposal(
        d,
        d.allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity })),
        parcelsById,
        d.investmentAccount.entity.entityType
      );
      return {
        id: d.id,
        disposalDate: d.disposalDate,
        code: d.security.code,
        entityName: d.investmentAccount.entity.name,
        entityType: d.investmentAccount.entity.entityType,
        quantity: d.quantity,
        proceeds: result.proceeds,
        costBase: result.costBase,
        grossGain: result.grossGain,
        discountAmount: result.discountAmount,
        netGain: result.netGain,
        parcels: result.allocations.map((a) => ({
          acquisitionDate: a.acquisitionDate,
          quantity: a.quantity,
          costBase: a.costBase,
          grossGain: a.grossGain,
          discountEligible: a.discountEligible,
        })),
      };
    });

    const gains = rows.filter((r) => r.grossGain > 0);
    const losses = rows.filter((r) => r.grossGain < 0);
    const totalGrossGains = gains.reduce((s, r) => s + r.grossGain, 0);
    const totalLosses = Math.abs(losses.reduce((s, r) => s + r.grossGain, 0));
    const totalDiscount = rows.reduce((s, r) => s + r.discountAmount, 0);

    res.json({
      financialYear,
      rows,
      dividends: dividends.map((d) => ({
        id: d.id,
        paymentDate: d.paymentDate,
        code: d.security.code,
        entityName: d.investmentAccount.entity.name,
        frankedAmount: d.frankedAmount,
        unfrankedAmount: d.unfrankedAmount,
        frankingCredit: d.frankingCredit,
        capitalGainsAmount: d.capitalGainsAmount,
        foreignIncome: d.foreignIncome,
        foreignTaxCredit: d.foreignTaxCredit,
      })),
      totals: {
        disposalCount: rows.length,
        totalProceeds: rows.reduce((s, r) => s + r.proceeds, 0),
        totalCostBase: rows.reduce((s, r) => s + r.costBase, 0),
        totalGrossGains,
        totalLosses,
        totalDiscount,
        netCapitalGain: rows.reduce((s, r) => s + r.netGain, 0),
        dividendIncome: dividends.reduce((s, d) => s + d.frankedAmount + d.unfrankedAmount, 0),
        frankingCredits: dividends.reduce((s, d) => s + d.frankingCredit, 0),
      },
      note:
        "Calculated from the parcels and disposals you recorded. Capital losses offset gains before the CGT discount is applied, and losses carried forward from earlier years are not included here. Figures are for your accountant to confirm, not tax advice.",
    });
  })
);
