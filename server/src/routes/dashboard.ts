import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { financialYearLabelForDate } from "../services/financialYear.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const entityWhere = entityId ? { entityId } : {};

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const currentFyLabel = financialYearLabelForDate(now);

    const [
      pendingClassification,
      needsConfirmation,
      missingInformation,
      recentDocuments,
      upcomingRenewals,
      assets,
      liabilities,
      accounts,
      currentFy,
    ] = await Promise.all([
      prisma.document.count({ where: { reviewStatus: "PENDING_CLASSIFICATION", ...entityWhere } }),
      prisma.document.count({ where: { reviewStatus: "NEEDS_CONFIRMATION", ...entityWhere } }),
      prisma.document.count({ where: { reviewStatus: "MISSING_INFORMATION", ...entityWhere } }),
      prisma.document.findMany({
        where: entityWhere,
        orderBy: { uploadDate: "desc" },
        take: 10,
        include: { entity: true },
      }),
      prisma.document.findMany({
        where: { renewalDate: { gte: now, lte: in90Days }, ...entityWhere },
        orderBy: { renewalDate: "asc" },
        include: { entity: true },
      }),
      prisma.asset.findMany({ where: entityWhere }),
      prisma.liability.findMany({ where: entityWhere }),
      prisma.account.findMany({ where: entityWhere }),
      prisma.financialYear.findUnique({ where: { label: currentFyLabel } }),
    ]);

    const totalAssetValue = assets.reduce((sum, a) => sum + (a.currentValue ?? 0), 0);
    const totalCash = accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
    const propertyValue = assets.filter((a) => a.assetType === "PROPERTY").reduce((s, a) => s + (a.currentValue ?? 0), 0);
    const investmentValue = assets
      .filter((a) => ["SHARES", "MANAGED_FUND"].includes(a.assetType))
      .reduce((s, a) => s + (a.currentValue ?? 0), 0);
    const superValue = assets.filter((a) => a.assetType === "SUPERANNUATION").reduce((s, a) => s + (a.currentValue ?? 0), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.currentBalance ?? 0), 0);

    let taxSummary = {
      financialYearLabel: currentFyLabel,
      incomeRecorded: 0,
      expensesRecorded: 0,
      propertyIncome: 0,
      propertyExpenses: 0,
      investmentIncome: 0,
      needsReviewCount: 0,
    };

    if (currentFy) {
      const taxRecords = await prisma.taxRecord.findMany({
        where: { financialYearId: currentFy.id, ...entityWhere },
      });
      taxSummary.incomeRecorded = taxRecords
        .filter((t) => t.recordType === "INCOME" && t.status === "RECORDED")
        .reduce((s, t) => s + (t.amount ?? 0), 0);
      taxSummary.expensesRecorded = taxRecords
        .filter((t) => t.recordType === "EXPENSE" && t.status === "RECORDED")
        .reduce((s, t) => s + (t.amount ?? 0), 0);
      taxSummary.needsReviewCount = taxRecords.filter((t) => t.status === "NEEDS_REVIEW").length;
    }

    const unclassifiedTransactions = await prisma.transaction.count({
      where: { status: "UNREVIEWED", ...entityWhere },
    });

    res.json({
      documents: {
        pendingClassification,
        needsConfirmation,
        missingInformation,
        recentDocuments,
        upcomingRenewals,
      },
      financialSnapshot: {
        totalAssets: totalAssetValue,
        totalLiabilities,
        netPosition: totalAssetValue - totalLiabilities,
        cash: totalCash,
        investmentValue,
        propertyValue,
        superannuation: superValue,
      },
      tax: { ...taxSummary, unclassifiedTransactions },
    });
  })
);
