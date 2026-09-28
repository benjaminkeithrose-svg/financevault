import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { projectPlan, purchaseCosts } from "../services/planProjection.js";

export { purchaseCosts };

export const portfolioPlansRouter = Router();

// The property an equity draw comes from, with where its page is.
const sourceAssetSelect = {
  select: { id: true, name: true, disposalDate: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
} as const;

portfolioPlansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const plans = await prisma.portfolioPlan.findMany({
      where: entityId ? { entityId } : undefined,
      include: { entity: true, startFinancialYear: true, properties: true, holdings: true, basePlan: { select: { id: true, name: true } } },
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
            asset: { select: { id: true, name: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } } },
            equityDraws: { include: { sourceAsset: sourceAssetSelect, sourceCommercialProperty: true, liability: { select: { id: true, name: true } } }, orderBy: { yearNumber: "asc" } },
          },
          orderBy: { acquisitionYearNumber: "asc" },
        },
        holdings: { include: { asset: sourceAssetSelect }, orderBy: { createdAt: "asc" } },
        basePlan: { select: { id: true, name: true } },
        whatIfs: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
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
  startingCash: z.number().min(0).optional(),
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
  // Bought: the property in the records it became (any kind).
  assetId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/** Fills in both links to the property a purchase became, whichever was given. */
async function purchaseLink(input: { assetId?: string | null; commercialPropertyId?: string | null }) {
  if (input.assetId === undefined && input.commercialPropertyId === undefined) return {};
  if (input.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: input.assetId }, include: { commercialProperty: { select: { id: true } } } });
    if (!asset) throw new HttpError(400, "That property isn't in your records");
    return { assetId: asset.id, commercialPropertyId: asset.commercialProperty?.id ?? null };
  }
  if (input.commercialPropertyId) {
    const cp = await prisma.commercialProperty.findUnique({ where: { id: input.commercialPropertyId } });
    if (!cp) throw new HttpError(400, "That property isn't in your records");
    return { assetId: cp.assetId, commercialPropertyId: cp.id };
  }
  return { assetId: null, commercialPropertyId: null };
}

portfolioPlansRouter.post(
  "/:id/properties",
  asyncHandler(async (req, res) => {
    const { assetId, commercialPropertyId, ...parsed } = planPropertyInput.parse(req.body);
    const property = await prisma.planProperty.create({
      data: { planId: req.params.id, ...parsed, ...(await purchaseLink({ assetId, commercialPropertyId })) },
      include: { refinances: true, commercialProperty: true },
    });
    await logAudit("PLAN_PROPERTY_ADDED", { targetType: "PlanProperty", targetId: property.id });
    res.status(201).json(property);
  })
);

portfolioPlansRouter.put(
  "/properties/:propertyId",
  asyncHandler(async (req, res) => {
    const { assetId, commercialPropertyId, ...parsed } = planPropertyInput.partial().parse(req.body);
    const property = await prisma.planProperty.update({
      where: { id: req.params.propertyId },
      data: { ...parsed, ...(await purchaseLink({ assetId, commercialPropertyId })) },
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

// Properties already owned, in the plan.
portfolioPlansRouter.post(
  "/:id/holdings",
  asyncHandler(async (req, res) => {
    const { assetId } = z.object({ assetId: z.string() }).parse(req.body);
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { property: true, commercialProperty: true } });
    if (!asset || (!asset.property && !asset.commercialProperty)) throw new HttpError(400, "Pick a property from your records");
    if (await prisma.planHolding.findUnique({ where: { planId_assetId: { planId: req.params.id, assetId } } })) {
      throw new HttpError(400, `${asset.name} is already in this plan`);
    }
    const holding = await prisma.planHolding.create({ data: { planId: req.params.id, assetId }, include: { asset: sourceAssetSelect } });
    await logAudit("PLAN_HOLDING_ADDED", { targetType: "PlanHolding", targetId: holding.id });
    res.status(201).json(holding);
  })
);

portfolioPlansRouter.delete(
  "/holdings/:holdingId",
  asyncHandler(async (req, res) => {
    await prisma.planHolding.delete({ where: { id: req.params.holdingId } });
    await logAudit("PLAN_HOLDING_REMOVED", { targetType: "PlanHolding", targetId: req.params.holdingId });
    res.status(204).send();
  })
);

/**
 * A what-if version: a copy of the plan (its assumptions, planned purchases,
 * refinances, equity draws and properties owned) to change and compare. The
 * copy isn't linked to real purchases or loans — the original keeps those.
 */
portfolioPlansRouter.post(
  "/:id/copy",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1).optional() }).parse(req.body ?? {});
    const source = await prisma.portfolioPlan.findUnique({
      where: { id: req.params.id },
      include: { properties: { include: { refinances: true, equityDraws: true } }, holdings: true },
    });
    if (!source) throw new HttpError(404, "Portfolio plan not found");
    const copy = await prisma.$transaction(async (tx) => {
      const plan = await tx.portfolioPlan.create({
        data: {
          name: name ?? `${source.name} — what if`,
          entityId: source.entityId,
          startFinancialYearId: source.startFinancialYearId,
          projectionYears: source.projectionYears,
          interestRate: source.interestRate,
          rentalGrowthRate: source.rentalGrowthRate,
          capRate: source.capRate,
          annualContribution: source.annualContribution,
          refinanceLvrTarget: source.refinanceLvrTarget,
          depositPercent: source.depositPercent,
          startingCash: source.startingCash,
          notes: source.notes,
          basePlanId: source.id,
          holdings: { create: source.holdings.map((h) => ({ assetId: h.assetId })) },
        },
      });
      for (const p of source.properties) {
        await tx.planProperty.create({
          data: {
            planId: plan.id,
            name: p.name,
            acquisitionYearNumber: p.acquisitionYearNumber,
            purchasePrice: p.purchasePrice,
            initialLvr: p.initialLvr,
            initialRent: p.initialRent,
            transferDuty: p.transferDuty,
            otherBuyingCosts: p.otherBuyingCosts,
            gstPayable: p.gstPayable,
            notes: p.notes,
            refinances: { create: p.refinances.map((r) => ({ yearNumber: r.yearNumber, targetLvr: r.targetLvr, notes: r.notes })) },
            equityDraws: {
              create: p.equityDraws.map((d) => ({
                yearNumber: d.yearNumber,
                amount: d.amount,
                interestRate: d.interestRate,
                sourceAssetId: d.sourceAssetId,
                sourceCommercialPropertyId: d.sourceCommercialPropertyId,
                notes: d.notes,
              })),
            },
          },
        });
      }
      return plan;
    });
    await logAudit("PORTFOLIO_PLAN_COPIED", { targetType: "PortfolioPlan", targetId: copy.id, data: { from: source.id } });
    res.status(201).json(copy);
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
  // Any property owned: its asset. The older commercial-only link is still accepted.
  sourceAssetId: z.string().optional().nullable(),
  sourceCommercialPropertyId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/** Fills in both links to the source property, whichever one was given. */
async function drawSource(input: { sourceAssetId?: string | null; sourceCommercialPropertyId?: string | null }) {
  if (input.sourceAssetId) {
    const asset = await prisma.asset.findUnique({ where: { id: input.sourceAssetId }, include: { commercialProperty: { select: { id: true } } } });
    if (!asset) throw new HttpError(400, "That property isn't in your records");
    return { sourceAssetId: asset.id, sourceCommercialPropertyId: asset.commercialProperty?.id ?? null };
  }
  if (input.sourceCommercialPropertyId) {
    const cp = await prisma.commercialProperty.findUnique({ where: { id: input.sourceCommercialPropertyId } });
    if (!cp) throw new HttpError(400, "That property isn't in your records");
    return { sourceAssetId: cp.assetId, sourceCommercialPropertyId: cp.id };
  }
  return { sourceAssetId: null, sourceCommercialPropertyId: null };
}

portfolioPlansRouter.post(
  "/properties/:propertyId/equity-draws",
  asyncHandler(async (req, res) => {
    const { sourceAssetId, sourceCommercialPropertyId, ...parsed } = equityDrawInput.parse(req.body);
    const draw = await prisma.planEquityDraw.create({
      data: { planPropertyId: req.params.propertyId, ...parsed, ...(await drawSource({ sourceAssetId, sourceCommercialPropertyId })) },
      include: { sourceAsset: sourceAssetSelect, sourceCommercialProperty: true },
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

/** The year-by-year projection (services/planProjection.ts). */
portfolioPlansRouter.get(
  "/:id/projection",
  asyncHandler(async (req, res) => {
    const projection = await projectPlan(req.params.id);
    if (!projection) {
      res.status(404).json({ error: "Portfolio plan not found" });
      return;
    }
    res.json(projection);
  })
);
