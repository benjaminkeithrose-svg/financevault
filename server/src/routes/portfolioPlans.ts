import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { NSW_DUTY_RATES_YEAR, nswTransferDuty } from "../services/nswDuty.js";

export const portfolioPlansRouter = Router();

portfolioPlansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const plans = await prisma.portfolioPlan.findMany({
      where: entityId ? { entityId } : undefined,
      include: { entity: true, startFinancialYear: true, properties: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(plans);
  })
);

portfolioPlansRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const plan = await prisma.portfolioPlan.findUnique({
      where: { id: req.params.id },
      include: {
        entity: true,
        startFinancialYear: true,
        properties: {
          include: {
            refinances: { orderBy: { yearNumber: "asc" } },
            commercialProperty: true,
            equityDraws: { include: { sourceCommercialProperty: true }, orderBy: { yearNumber: "asc" } },
          },
          orderBy: { acquisitionYearNumber: "asc" },
        },
      },
    });
    if (!plan) {
      res.status(404).json({ error: "Portfolio plan not found" });
      return;
    }
    res.json(plan);
  })
);

const planInput = z.object({
  name: z.string().min(1),
  entityId: z.string().optional().nullable(),
  startFinancialYearId: z.string(),
  projectionYears: z.number().int().min(1).max(40).optional(),
  interestRate: z.number(),
  rentalGrowthRate: z.number(),
  capRate: z.number(),
  annualContribution: z.number().optional(),
  refinanceLvrTarget: z.number(),
  depositPercent: z.number().optional(),
  notes: z.string().optional().nullable(),
});

portfolioPlansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = planInput.parse(req.body);
    const plan = await prisma.portfolioPlan.create({
      data: parsed,
      include: { entity: true, startFinancialYear: true, properties: true },
    });
    await logAudit("PORTFOLIO_PLAN_CREATED", { targetType: "PortfolioPlan", targetId: plan.id, data: { name: plan.name } });
    res.status(201).json(plan);
  })
);

portfolioPlansRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = planInput.partial().parse(req.body);
    const plan = await prisma.portfolioPlan.update({
      where: { id: req.params.id },
      data: parsed,
      include: { entity: true, startFinancialYear: true, properties: true },
    });
    await logAudit("PORTFOLIO_PLAN_CHANGED", { targetType: "PortfolioPlan", targetId: plan.id, data: parsed });
    res.json(plan);
  })
);

portfolioPlansRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.portfolioPlan.delete({ where: { id: req.params.id } });
    await logAudit("PORTFOLIO_PLAN_DELETED", { targetType: "PortfolioPlan", targetId: req.params.id });
    res.status(204).send();
  })
);

const planPropertyInput = z.object({
  name: z.string().min(1),
  acquisitionYearNumber: z.number().int().min(1),
  purchasePrice: z.number(),
  initialLvr: z.number().min(0).max(1.2),
  initialRent: z.number().optional().nullable(),
  transferDuty: z.number().min(0).optional().nullable(),
  otherBuyingCosts: z.number().min(0).optional().nullable(),
  gstPayable: z.boolean().optional(),
  commercialPropertyId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

portfolioPlansRouter.post(
  "/:id/properties",
  asyncHandler(async (req, res) => {
    const parsed = planPropertyInput.parse(req.body);
    const property = await prisma.planProperty.create({
      data: { planId: req.params.id, ...parsed },
      include: { refinances: true, commercialProperty: true },
    });
    await logAudit("PLAN_PROPERTY_ADDED", { targetType: "PlanProperty", targetId: property.id });
    res.status(201).json(property);
  })
);

portfolioPlansRouter.put(
  "/properties/:propertyId",
  asyncHandler(async (req, res) => {
    const parsed = planPropertyInput.partial().parse(req.body);
    const property = await prisma.planProperty.update({
      where: { id: req.params.propertyId },
      data: parsed,
      include: { refinances: true, commercialProperty: true },
    });
    await logAudit("PLAN_PROPERTY_CHANGED", { targetType: "PlanProperty", targetId: property.id, data: parsed });
    res.json(property);
  })
);

portfolioPlansRouter.delete(
  "/properties/:propertyId",
  asyncHandler(async (req, res) => {
    await prisma.planProperty.delete({ where: { id: req.params.propertyId } });
    await logAudit("PLAN_PROPERTY_REMOVED", { targetType: "PlanProperty", targetId: req.params.propertyId });
    res.status(204).send();
  })
);

const refinanceInput = z.object({
  yearNumber: z.number().int().min(1),
  targetLvr: z.number().min(0).max(1.2).optional().nullable(),
  notes: z.string().optional().nullable(),
});

portfolioPlansRouter.post(
  "/properties/:propertyId/refinances",
  asyncHandler(async (req, res) => {
    const parsed = refinanceInput.parse(req.body);
    const refinance = await prisma.planRefinance.create({
      data: { planPropertyId: req.params.propertyId, ...parsed },
    });
    await logAudit("PLAN_REFINANCE_ADDED", { targetType: "PlanRefinance", targetId: refinance.id });
    res.status(201).json(refinance);
  })
);

portfolioPlansRouter.delete(
  "/refinances/:refinanceId",
  asyncHandler(async (req, res) => {
    await prisma.planRefinance.delete({ where: { id: req.params.refinanceId } });
    res.status(204).send();
  })
);

const equityDrawInput = z.object({
  yearNumber: z.number().int().min(1),
  amount: z.number(),
  interestRate: z.number().optional().nullable(),
  sourceCommercialPropertyId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

portfolioPlansRouter.post(
  "/properties/:propertyId/equity-draws",
  asyncHandler(async (req, res) => {
    const parsed = equityDrawInput.parse(req.body);
    const draw = await prisma.planEquityDraw.create({
      data: { planPropertyId: req.params.propertyId, ...parsed },
      include: { sourceCommercialProperty: true },
    });
    await logAudit("PLAN_EQUITY_DRAW_ADDED", { targetType: "PlanEquityDraw", targetId: draw.id });
    res.status(201).json(draw);
  })
);

portfolioPlansRouter.delete(
  "/equity-draws/:drawId",
  asyncHandler(async (req, res) => {
    await prisma.planEquityDraw.delete({ where: { id: req.params.drawId } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Projection engine — always computed live from the plan's stored inputs,
// never persisted, so changing an assumption is reflected immediately. Each
// property's value and rent grow at the plan's rate; its loan is
// interest-only and held flat between refinances, resetting at each
// refinance to (that refinance's target LVR) x (property value at that
// point) — this is the exact arithmetic behind the source portfolio-
// compounding illustration this feature is modelled on.
//
// Refinance/purchase timing is never auto-decided — "redeployment capacity"
// (accumulated cashflow + equity releasable at the target LVR) is surfaced
// per property and at the portfolio level purely as information to help the
// user judge when they could act, same as the source material.
// ---------------------------------------------------------------------------

/**
 * Cash needed to buy a planned property: the deposit plus the buying costs
 * the loan doesn't cover. Duty is estimated from the NSW general rates unless
 * a figure is entered. A tenanted commercial property sold as a going
 * concern is GST-free (GSTR 2002/5); otherwise 10% GST is paid at settlement,
 * even if a GST-registered buyer later claims it back.
 */
export function purchaseCosts(p: {
  purchasePrice: number;
  initialLvr: number;
  transferDuty: number | null;
  otherBuyingCosts: number | null;
  gstPayable: boolean;
}) {
  const deposit = Math.max(0, p.purchasePrice * (1 - p.initialLvr));
  const dutyEstimated = p.transferDuty === null || p.transferDuty === undefined;
  const transferDuty = dutyEstimated ? nswTransferDuty(p.purchasePrice) : p.transferDuty!;
  const gst = p.gstPayable ? p.purchasePrice * 0.1 : 0;
  const otherCosts = p.otherBuyingCosts ?? 0;
  return {
    deposit,
    transferDuty,
    dutyEstimated,
    dutyRatesYear: NSW_DUTY_RATES_YEAR,
    gst,
    otherCosts,
    cashNeeded: deposit + transferDuty + gst + otherCosts,
  };
}

function financialYearLabelForOffset(startLabel: string, yearNumber: number): string {
  const startYear = Number(startLabel.split("-")[0]);
  const fyStartYear = startYear + (yearNumber - 1);
  return `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

portfolioPlansRouter.get(
  "/:id/projection",
  asyncHandler(async (req, res) => {
    const plan = await prisma.portfolioPlan.findUnique({
      where: { id: req.params.id },
      include: {
        startFinancialYear: true,
        properties: {
          include: {
            refinances: { orderBy: { yearNumber: "asc" } },
            commercialProperty: true,
            equityDraws: { orderBy: { yearNumber: "asc" } },
          },
        },
      },
    });
    if (!plan) {
      res.status(404).json({ error: "Portfolio plan not found" });
      return;
    }

    const years = Array.from({ length: plan.projectionYears }, (_, i) => i + 1);

    const propertyRows = await Promise.all(
      plan.properties.map(async (property) => {
        const initialRent = property.initialRent ?? property.purchasePrice * plan.capRate;
        const rows = [];

        for (const yearNumber of years) {
          if (yearNumber < property.acquisitionYearNumber) continue;
          const yearsSincePurchase = yearNumber - property.acquisitionYearNumber;
          const value = property.purchasePrice * Math.pow(1 + plan.rentalGrowthRate, yearsSincePurchase);
          const rent = initialRent * Math.pow(1 + plan.rentalGrowthRate, yearsSincePurchase);

          const priorRefinances = property.refinances.filter((r) => r.yearNumber <= yearNumber);
          const trancheStartYear =
            priorRefinances.length > 0 ? Math.max(...priorRefinances.map((r) => r.yearNumber)) : property.acquisitionYearNumber;
          const trancheStartValue =
            property.purchasePrice * Math.pow(1 + plan.rentalGrowthRate, trancheStartYear - property.acquisitionYearNumber);

          let loan: number;
          if (trancheStartYear === property.acquisitionYearNumber) {
            loan = property.purchasePrice * property.initialLvr;
          } else {
            const refinanceAtTrancheStart = priorRefinances.find((r) => r.yearNumber === trancheStartYear)!;
            const targetLvr = refinanceAtTrancheStart.targetLvr ?? plan.refinanceLvrTarget;
            loan = trancheStartValue * targetLvr;
          }

          const interest = loan * plan.interestRate;
          const cashflow = rent - interest;
          const lvr = value ? loan / value : null;
          const equity = value - loan;
          const growthEquitySinceTranche = value - trancheStartValue;
          const releasableEquity = plan.refinanceLvrTarget * value - loan;

          let accumulatedCashflow = 0;
          for (let y = trancheStartYear; y <= yearNumber; y++) {
            if (y < property.acquisitionYearNumber) continue;
            const ySincePurchase = y - property.acquisitionYearNumber;
            const yRent = initialRent * Math.pow(1 + plan.rentalGrowthRate, ySincePurchase);
            accumulatedCashflow += yRent - interest; // loan flat within tranche, so interest is constant across it
          }

          let actual: Record<string, number | null> | null = null;
          if (property.commercialPropertyId) {
            const fyLabel = financialYearLabelForOffset(plan.startFinancialYear.label, yearNumber);
            const fy = await prisma.financialYear.findUnique({ where: { label: fyLabel } });
            if (fy) {
              const snapshot = await prisma.annualPropertySnapshot.findUnique({
                where: { commercialPropertyId_financialYearId: { commercialPropertyId: property.commercialPropertyId, financialYearId: fy.id } },
              });
              if (snapshot) {
                actual = {
                  propertyValue: snapshot.propertyValue,
                  rent: snapshot.rent,
                  debt: snapshot.debt,
                  cashFlow: snapshot.cashFlow,
                  equity: snapshot.equity,
                };
              }
            }
          }

          const activeDraws = property.equityDraws.filter((d) => d.yearNumber <= yearNumber);
          const fundingCost = activeDraws.reduce((s, d) => s + d.amount * (d.interestRate ?? plan.interestRate), 0);
          const netCashflowAfterFunding = cashflow - fundingCost;

          rows.push({
            yearNumber,
            trancheStartYear,
            propertyValue: value,
            loan,
            lvr,
            rent,
            interest,
            cashflow,
            equity,
            accumulatedCashflowSinceTranche: accumulatedCashflow,
            growthEquitySinceTranche,
            releasableEquity,
            redeploymentCapacity: accumulatedCashflow + releasableEquity,
            fundingCost,
            netCashflowAfterFunding,
            actual,
          });
        }

        const positivelyGearedFromYear = rows.find((r) => r.netCashflowAfterFunding >= 0)?.yearNumber ?? null;
        const purchase = purchaseCosts(property);

        return {
          planPropertyId: property.id,
          name: property.name,
          acquisitionYearNumber: property.acquisitionYearNumber,
          linked: Boolean(property.commercialPropertyId),
          commercialPropertyName: property.commercialProperty?.name ?? null,
          hasFunding: property.equityDraws.length > 0,
          positivelyGearedFromYear,
          purchase,
          rows,
        };
      })
    );

    const portfolioByYear = years.map((yearNumber) => {
      const activeRows = propertyRows.flatMap((p) => p.rows.filter((r) => r.yearNumber === yearNumber));
      const totalValue = activeRows.reduce((s, r) => s + r.propertyValue, 0);
      const totalLoan = activeRows.reduce((s, r) => s + r.loan, 0);
      const totalCashflow = activeRows.reduce((s, r) => s + r.cashflow, 0);
      const totalFundingCost = activeRows.reduce((s, r) => s + r.fundingCost, 0);
      const totalRedeploymentCapacity = activeRows.reduce((s, r) => s + r.redeploymentCapacity, 0);
      const cumulativeContributions = plan.annualContribution * yearNumber;
      const cashToBuy = propertyRows
        .filter((p) => p.acquisitionYearNumber === yearNumber)
        .reduce((s, p) => s + p.purchase.cashNeeded, 0);
      return {
        yearNumber,
        numberOfProperties: activeRows.length,
        totalValue,
        totalLoan,
        totalEquity: totalValue - totalLoan,
        totalCashflow,
        totalFundingCost,
        totalCashflowAfterFunding: totalCashflow - totalFundingCost,
        cumulativeContributions,
        totalAvailableForRedeployment: totalRedeploymentCapacity + cumulativeContributions,
        cashToBuy,
      };
    });

    res.json({
      plan: { id: plan.id, name: plan.name, projectionYears: plan.projectionYears, startFinancialYearLabel: plan.startFinancialYear.label },
      properties: propertyRows,
      portfolioByYear,
      note:
        "Projected figures from the assumptions above — not a recommendation. Refinance timing and new purchases are your own decisions; redeployment capacity is shown to help judge when you could act, never auto-applied.",
    });
  })
);
