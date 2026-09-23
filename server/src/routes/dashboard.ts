import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { financialYearLabelForDate } from "../services/financialYear.js";
import { computeFinancialPosition } from "../services/financialPosition.js";
import { computeLiveBreakdown, valueHoldings } from "../services/netWorth.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const entityWhere = entityId ? { entityId } : {};

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const in180Days = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    const currentFyLabel = financialYearLabelForDate(now);

    const [
      pendingClassification,
      needsConfirmation,
      missingInformation,
      recentDocuments,
      upcomingRenewals,
      currentFy,
      leaseTenancies,
    ] = await Promise.all([
      prisma.document.count({ where: { reviewStatus: "PENDING_CLASSIFICATION", ...entityWhere } }),
      prisma.document.count({ where: { reviewStatus: "NEEDS_CONFIRMATION", ...entityWhere } }),
      prisma.document.count({ where: { reviewStatus: "MISSING_INFORMATION", ...entityWhere } }),
      prisma.document.findMany({
        where: { reviewStatus: { not: "ARCHIVED" }, ...entityWhere },
        orderBy: { uploadDate: "desc" },
        take: 10,
        include: { entity: true },
      }),
      prisma.document.findMany({
        where: { renewalDate: { gte: now, lte: in90Days }, reviewStatus: { not: "ARCHIVED" }, ...entityWhere },
        orderBy: { renewalDate: "asc" },
        include: { entity: true },
      }),
      prisma.financialYear.findUnique({ where: { label: currentFyLabel } }),
      prisma.tenancy.findMany({
        where: {
          leaseStatus: "ACTIVE",
          OR: [{ leaseExpiry: { gte: now, lte: in180Days } }, { nextRentReview: { gte: now, lte: in90Days } }],
          ...(entityId ? { commercialProperty: { entityId } } : {}),
        },
        include: { commercialProperty: true },
      }),
    ]);

    const upcomingLeaseEvents: Array<{
      tenancyId: string;
      tenantName: string;
      commercialPropertyId: string;
      commercialPropertyName: string;
      eventType: "EXPIRY" | "RENT_REVIEW";
      eventDate: string;
    }> = [];
    for (const t of leaseTenancies) {
      if (t.leaseExpiry && t.leaseExpiry >= now && t.leaseExpiry <= in180Days) {
        upcomingLeaseEvents.push({
          tenancyId: t.id,
          tenantName: t.tenantName,
          commercialPropertyId: t.commercialPropertyId,
          commercialPropertyName: t.commercialProperty.name,
          eventType: "EXPIRY",
          eventDate: t.leaseExpiry.toISOString(),
        });
      }
      if (t.nextRentReview && t.nextRentReview >= now && t.nextRentReview <= in90Days) {
        upcomingLeaseEvents.push({
          tenancyId: t.id,
          tenantName: t.tenantName,
          commercialPropertyId: t.commercialPropertyId,
          commercialPropertyName: t.commercialProperty.name,
          eventType: "RENT_REVIEW",
          eventDate: t.nextRentReview.toISOString(),
        });
      }
    }
    upcomingLeaseEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    // Same figures as the Net Worth page — both come from one calculation.
    const breakdown = await computeLiveBreakdown(entityId);

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

    // Consolidated, by-entity breakdown — a user-level convenience view
    // only, never a formal accounting consolidation. Only computed for the
    // "All entities" view; each asset/liability belongs to exactly one
    // entity so nothing here double-counts.
    let byEntity: Array<{
      entityId: string;
      entityName: string;
      entityType: string;
      totalAssets: number;
      totalLiabilities: number;
      netAssets: number;
    }> = [];
    if (!entityId) {
      const allEntities = await prisma.entity.findMany({
        include: { assets: { where: { parentAssetId: null } }, accounts: true, liabilities: true, investmentAccounts: true },
      });
      byEntity = [];
      for (const e of allEntities) {
        const holdings = await valueHoldings(e.investmentAccounts);
        const position = computeFinancialPosition(e.assets, e.accounts, e.liabilities, holdings.value);
        byEntity.push({
          entityId: e.id,
          entityName: e.name,
          entityType: e.entityType,
          totalAssets: position.totalAssets,
          totalLiabilities: position.totalLiabilities,
          netAssets: position.netAssets,
        });
      }
    }

    res.json({
      documents: {
        pendingClassification,
        needsConfirmation,
        missingInformation,
        recentDocuments,
        upcomingRenewals,
      },
      upcomingLeaseEvents,
      financialSnapshot: {
        totalAssets: breakdown.totalAssets,
        totalLiabilities: breakdown.totalLiabilities,
        netPosition: breakdown.netPosition,
        cash: breakdown.cash,
        investmentValue: breakdown.investmentValue,
        propertyValue: breakdown.propertyValue,
        superannuation: breakdown.superValue,
      },
      tax: { ...taxSummary, unclassifiedTransactions },
      consolidated: {
        byEntity,
        note: "User-level convenience view — not a formal accounting consolidation or tax statement.",
      },
    });
  })
);
