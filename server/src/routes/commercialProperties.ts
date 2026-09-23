import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { checkOwners, ownersInput } from "../services/ownership.js";
import { extractLeaseTerms } from "../services/leaseExtraction.js";
import {
  computeCoverageRatios,
  computeDebtMetrics,
  computeIncomeAndNoi,
  computeOccupancy,
  computeTenantConcentration,
  computeWale,
  computeYieldsAndCapRate,
} from "../services/commercialMetrics.js";

export const commercialPropertiesRouter = Router();

// ---------------------------------------------------------------------------
// Commercial property CRUD
// ---------------------------------------------------------------------------

commercialPropertiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const properties = await prisma.commercialProperty.findMany({
      where: entityId ? { entityId } : undefined,
      include: { asset: true, entity: true, tenancies: true, loans: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(properties);
  })
);

export async function loadMetrics(propertyId: string, valuationBasis: "current" | "purchase") {
  const property = await prisma.commercialProperty.findUnique({
    where: { id: propertyId },
    include: { asset: true, tenancies: true, loans: true },
  });
  if (!property) return null;

  const propertyValue = valuationBasis === "purchase" ? property.purchasePrice : property.asset.currentValue;
  const totalNla = property.nla ?? property.gla ?? null;

  // Outgoings within the trailing 12 months — a rolling annualised view,
  // clearly distinct from a saved historical AnnualPropertySnapshot.
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentOutgoings = await prisma.outgoingRecord.findMany({
    where: { commercialPropertyId: propertyId, date: { gte: oneYearAgo } },
  });

  const occupancy = computeOccupancy(totalNla, property.tenancies);
  const tenantConcentration = computeTenantConcentration(property.tenancies, totalNla);
  const wale = computeWale(property.tenancies);
  const income = computeIncomeAndNoi(property.tenancies, recentOutgoings);
  const yields = computeYieldsAndCapRate(income.grossPropertyIncome, income.noi, propertyValue, valuationBasis);
  const debt = computeDebtMetrics(property.loans, propertyValue);
  const cashFlowAfterFinancing = income.noi - debt.annualDebtService;
  const coverage = computeCoverageRatios(income.noi, debt.annualDebtService, debt.estimatedAnnualInterest);

  return {
    property,
    period: { basis: "trailing 12 months of recorded outgoings; rent is current annualised rent from active leases" },
    occupancy,
    tenantConcentration,
    wale,
    income,
    yields,
    debt,
    coverage,
    cashFlowAfterFinancing: {
      value: cashFlowAfterFinancing,
      status: "ESTIMATED",
      formula: "NOI - annualDebtService (interest is approximated, not from an amortisation schedule)",
    },
  };
}

// Registered before "/:id" so the literal path isn't swallowed by the param route.
commercialPropertiesRouter.get(
  "/portfolio",
  asyncHandler(async (req, res) => {
    const valuationBasis = req.query.valuationBasis === "purchase" ? "purchase" : "current";
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;

    const properties = await prisma.commercialProperty.findMany({
      where: entityId ? { entityId } : undefined,
      select: { id: true },
    });

    const perProperty = await Promise.all(
      properties.map(async (p) => {
        const m = await loadMetrics(p.id, valuationBasis);
        return m ? { propertyId: p.id, name: m.property.name, metrics: m } : null;
      })
    );
    const rows = perProperty.filter((r): r is NonNullable<typeof r> => r !== null);

    const totalValue = rows.reduce((s, r) => s + (r.metrics.yields.propertyValue ?? 0), 0);
    const totalDebt = rows.reduce((s, r) => s + r.metrics.debt.totalDebt, 0);
    const totalEquity = totalValue - totalDebt;
    const totalNoi = rows.reduce((s, r) => s + r.metrics.income.noi, 0);
    const totalRent = rows.reduce((s, r) => s + r.metrics.income.grossRent, 0);
    const totalInterest = rows.reduce((s, r) => s + r.metrics.debt.estimatedAnnualInterest, 0);
    const totalCashFlow = rows.reduce((s, r) => s + r.metrics.cashFlowAfterFinancing.value, 0);
    const tenantCount = rows.reduce((s, r) => s + r.metrics.tenantConcentration.tenants.length, 0);
    const weightedOccupancy = rows.reduce(
      (s, r) => s + (r.metrics.occupancy.occupancyPercent ?? 0) * (r.metrics.yields.propertyValue ?? 0),
      0
    );
    const weightedWaleRent = rows.reduce(
      (s, r) => s + (r.metrics.wale.waleByRentYears ?? 0) * r.metrics.income.grossRent,
      0
    );

    res.json({
      properties: rows.map((r) => ({
        propertyId: r.propertyId,
        name: r.name,
        propertyValue: r.metrics.yields.propertyValue,
        debt: r.metrics.debt.totalDebt,
        equity: r.metrics.debt.equity,
        noi: r.metrics.income.noi,
        netYield: r.metrics.yields.netYield,
        capRate: r.metrics.yields.capRate,
        lvr: r.metrics.debt.lvr,
        occupancyPercent: r.metrics.occupancy.occupancyPercent,
        waleByRentYears: r.metrics.wale.waleByRentYears,
      })),
      portfolio: {
        numberOfProperties: rows.length,
        numberOfTenants: tenantCount,
        totalValue,
        totalDebt,
        totalEquity,
        weightedLvr: totalValue ? totalDebt / totalValue : null,
        totalNoi,
        portfolioNetYield: totalValue ? totalNoi / totalValue : null,
        totalAnnualRent: totalRent,
        weightedOccupancy: totalValue ? weightedOccupancy / totalValue : null,
        weightedWaleByRentYears: totalRent ? weightedWaleRent / totalRent : null,
        totalAnnualInterest: totalInterest,
        cashFlowAfterFinancing: totalCashFlow,
      },
      note: "Underlying per-property metrics only — properties are not ranked or scored against each other.",
    });
  })
);

commercialPropertiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const valuationBasis = req.query.valuationBasis === "purchase" ? "purchase" : "current";
    const property = await prisma.commercialProperty.findUnique({
      where: { id: req.params.id },
      include: {
        asset: { include: { ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } } } },
        entity: true,
        tenancies: { include: { rentReviews: { orderBy: { reviewDate: "desc" } } }, orderBy: { createdAt: "desc" } },
        loans: true,
        outgoings: { orderBy: { date: "desc" } },
        capitalExpenditure: { orderBy: { date: "desc" } },
        occupancySnapshots: { orderBy: { asAtDate: "desc" } },
        annualSnapshots: { include: { financialYear: true }, orderBy: { financialYear: { startDate: "desc" } } },
      },
    });
    if (!property) {
      res.status(404).json({ error: "Commercial property not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "COMMERCIAL_PROPERTY", targetId: property.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    const metrics = await loadMetrics(property.id, valuationBasis);
    res.json({ ...property, documents: links.map((l) => l.document), metrics });
  })
);

const createInput = z.object({
  name: z.string().min(1),
  entityId: z.string(),
  address: z.string().min(1),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  propertyTypes: z.array(z.string()).min(1), // OFFICE | RETAIL | INDUSTRIAL | WAREHOUSE | LOGISTICS | MEDICAL | CHILDCARE | HOSPITALITY | MIXED_USE | DEVELOPMENT_SITE | LAND | OTHER
  ownershipPercent: z.number().optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  settlementDate: z.string().datetime().optional().nullable(),
  purchasePrice: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  valuationDate: z.string().datetime().optional().nullable(),
  valuer: z.string().optional().nullable(),
  buildingArea: z.number().optional().nullable(),
  landArea: z.number().optional().nullable(),
  areaUnit: z.enum(["SQM", "HECTARES", "ACRES"]).optional().nullable(),
  numberOfTenancies: z.number().int().optional().nullable(),
  numberOfBuildings: z.number().int().optional().nullable(),
  carSpaces: z.number().int().optional().nullable(),
  zoning: z.string().optional().nullable(),
  constructionType: z.string().optional().nullable(),
  yearBuilt: z.number().int().optional().nullable(),
  refurbishmentDate: z.string().datetime().optional().nullable(),
  nla: z.number().optional().nullable(),
  gla: z.number().optional().nullable(),
  siteArea: z.number().optional().nullable(),
  owners: ownersInput,
});

function dateOrUndefined(v: string | null | undefined) {
  if (v === undefined) return undefined;
  return v ? new Date(v) : null;
}

commercialPropertiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { owners: ownersRaw, ...parsed } = createInput.parse(req.body);
    // Several owners: the first is the owner on record, the split is kept alongside.
    const owners = checkOwners(ownersRaw);
    if (owners) parsed.entityId = owners[0].entityId;
    const property = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          name: parsed.name,
          assetType: "COMMERCIAL_PROPERTY",
          entityId: parsed.entityId,
          acquisitionDate: dateOrUndefined(parsed.purchaseDate) ?? undefined,
          acquisitionCost: parsed.purchasePrice ?? undefined,
          currentValue: parsed.currentValue ?? undefined,
          valuationDate: dateOrUndefined(parsed.valuationDate) ?? undefined,
        },
      });
      if (owners) {
        await tx.assetOwnership.createMany({
          data: owners.map((o) => ({ assetId: asset.id, ownerEntityId: o.entityId, ownershipPercent: o.percent, ownershipType: "LEGAL" })),
        });
      }
      return tx.commercialProperty.create({
        data: {
          assetId: asset.id,
          entityId: parsed.entityId,
          name: parsed.name,
          address: parsed.address,
          state: parsed.state,
          postcode: parsed.postcode,
          propertyTypes: parsed.propertyTypes.join(","),
          ownershipPercent: parsed.ownershipPercent,
          purchaseDate: dateOrUndefined(parsed.purchaseDate),
          settlementDate: dateOrUndefined(parsed.settlementDate),
          purchasePrice: parsed.purchasePrice,
          valuationDate: dateOrUndefined(parsed.valuationDate),
          valuer: parsed.valuer,
          buildingArea: parsed.buildingArea,
          landArea: parsed.landArea,
          areaUnit: parsed.areaUnit,
          numberOfTenancies: parsed.numberOfTenancies,
          numberOfBuildings: parsed.numberOfBuildings,
          carSpaces: parsed.carSpaces,
          zoning: parsed.zoning,
          constructionType: parsed.constructionType,
          yearBuilt: parsed.yearBuilt,
          refurbishmentDate: dateOrUndefined(parsed.refurbishmentDate),
          nla: parsed.nla,
          gla: parsed.gla,
          siteArea: parsed.siteArea,
        },
        include: { asset: true, entity: true },
      });
    });
    await logAudit("COMMERCIAL_PROPERTY_CREATED", { targetType: "CommercialProperty", targetId: property.id });
    res.status(201).json(property);
  })
);

// Owners are chosen when it's created; later changes go through the ownership split.
const updateInput = createInput.omit({ owners: true }).partial();

commercialPropertiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateInput.parse(req.body);
    const property = await prisma.commercialProperty.findUnique({ where: { id: req.params.id } });
    if (!property) {
      res.status(404).json({ error: "Commercial property not found" });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: property.assetId },
        data: {
          name: parsed.name,
          acquisitionDate: dateOrUndefined(parsed.purchaseDate),
          acquisitionCost: parsed.purchasePrice,
          currentValue: parsed.currentValue,
          valuationDate: dateOrUndefined(parsed.valuationDate),
        },
      });
      return tx.commercialProperty.update({
        where: { id: req.params.id },
        data: {
          name: parsed.name,
          address: parsed.address,
          state: parsed.state,
          postcode: parsed.postcode,
          propertyTypes: parsed.propertyTypes ? parsed.propertyTypes.join(",") : undefined,
          ownershipPercent: parsed.ownershipPercent,
          purchaseDate: dateOrUndefined(parsed.purchaseDate),
          settlementDate: dateOrUndefined(parsed.settlementDate),
          purchasePrice: parsed.purchasePrice,
          valuationDate: dateOrUndefined(parsed.valuationDate),
          valuer: parsed.valuer,
          buildingArea: parsed.buildingArea,
          landArea: parsed.landArea,
          areaUnit: parsed.areaUnit,
          numberOfTenancies: parsed.numberOfTenancies,
          numberOfBuildings: parsed.numberOfBuildings,
          carSpaces: parsed.carSpaces,
          zoning: parsed.zoning,
          constructionType: parsed.constructionType,
          yearBuilt: parsed.yearBuilt,
          refurbishmentDate: dateOrUndefined(parsed.refurbishmentDate),
          nla: parsed.nla,
          gla: parsed.gla,
          siteArea: parsed.siteArea,
        },
        include: { asset: true, entity: true },
      });
    });
    await logAudit("COMMERCIAL_PROPERTY_CHANGED", { targetType: "CommercialProperty", targetId: updated.id, data: parsed });
    res.json(updated);
  })
);

commercialPropertiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.commercialProperty.findUnique({
      where: { id: req.params.id },
      include: {
        tenancies: { select: { id: true } },
        _count: {
          select: {
            tenancies: true,
            loans: true,
            outgoings: true,
            capitalExpenditure: true,
            occupancySnapshots: true,
            annualSnapshots: true,
            planEquityDrawSources: true,
          },
        },
      },
    });
    if (!property) {
      res.status(404).json({ error: "Commercial property not found" });
      return;
    }
    const c = property._count;
    refuseIfInUse("commercial property", [
      { count: c.tenancies, one: "tenancy", many: "tenancies" },
      { count: c.loans, one: "secured loan", many: "secured loans" },
      { count: c.outgoings, one: "outgoing", many: "outgoings" },
      { count: c.capitalExpenditure, one: "capital expenditure item", many: "capital expenditure items" },
      { count: c.occupancySnapshots, one: "occupancy snapshot", many: "occupancy snapshots" },
      { count: c.annualSnapshots, one: "annual snapshot", many: "annual snapshots" },
      { count: c.planEquityDrawSources, one: "portfolio plan equity draw", many: "portfolio plan equity draws" },
    ]);
    await deleteWithLinks(
      [
        { type: "COMMERCIAL_PROPERTY", id: property.id },
        { type: "ASSET", id: property.assetId },
      ],
      // Deleting the asset takes the commercial property record with it.
      (tx) => tx.asset.delete({ where: { id: property.assetId } })
    );
    await logAudit("COMMERCIAL_PROPERTY_DELETED", { targetType: "CommercialProperty", targetId: req.params.id });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Tenancies / leases
// ---------------------------------------------------------------------------

const tenancyInput = z.object({
  tenantName: z.string().min(1),
  tenantLegalName: z.string().optional().nullable(),
  tradingName: z.string().optional().nullable(),
  contactDetails: z.string().optional().nullable(),
  leaseCommencement: z.string().datetime().optional().nullable(),
  leaseExpiry: z.string().datetime().optional().nullable(),
  optionPeriods: z.string().optional().nullable(),
  rentCommencement: z.string().datetime().optional().nullable(),
  currentBaseRent: z.number().optional().nullable(),
  rentFrequency: z.enum(["WEEKLY", "MONTHLY", "ANNUALLY"]).optional().nullable(),
  rentPerAnnum: z.number().optional().nullable(),
  rentPerSqm: z.number().optional().nullable(),
  nlaOccupied: z.number().optional().nullable(),
  securityDeposit: z.number().optional().nullable(),
  bankGuarantee: z.number().optional().nullable(),
  bond: z.number().optional().nullable(),
  incentives: z.string().optional().nullable(),
  rentFreeMonths: z.number().optional().nullable(),
  reviewMechanism: z.enum(["FIXED_PERCENT", "CPI", "MARKET", "HYBRID", "FIXED"]).optional().nullable(),
  reviewPercentage: z.number().optional().nullable(),
  nextRentReview: z.string().datetime().optional().nullable(),
  cpiLinked: z.boolean().optional().nullable(),
  outgoingsArrangement: z.enum(["GROSS", "NET", "NET_NET", "NET_NET_NET", "GROSS_PLUS_RECOVERIES"]).optional().nullable(),
  gstTreatment: z.string().optional().nullable(),
  leaseStatus: z.enum(["PROPOSED", "NEGOTIATING", "ACTIVE", "EXPIRED", "TERMINATED", "VACANT"]).optional(),
  notes: z.string().optional().nullable(),
});

function tenancyData<T extends Partial<z.infer<typeof tenancyInput>>>(parsed: T) {
  return {
    ...parsed,
    leaseCommencement: dateOrUndefined(parsed.leaseCommencement),
    leaseExpiry: dateOrUndefined(parsed.leaseExpiry),
    rentCommencement: dateOrUndefined(parsed.rentCommencement),
    nextRentReview: dateOrUndefined(parsed.nextRentReview),
  };
}

commercialPropertiesRouter.post(
  "/:id/tenancies",
  asyncHandler(async (req, res) => {
    const parsed = tenancyInput.parse(req.body);
    const tenancy = await prisma.tenancy.create({
      data: { ...tenancyData(parsed), commercialPropertyId: req.params.id },
    });
    await logAudit("TENANCY_CREATED", { targetType: "Tenancy", targetId: tenancy.id });
    res.status(201).json(tenancy);
  })
);

commercialPropertiesRouter.put(
  "/tenancies/:tenancyId",
  asyncHandler(async (req, res) => {
    const parsed = tenancyInput.partial().parse(req.body);
    const tenancy = await prisma.tenancy.update({ where: { id: req.params.tenancyId }, data: tenancyData(parsed) });
    await logAudit("TENANCY_CHANGED", { targetType: "Tenancy", targetId: tenancy.id, data: parsed });
    res.json(tenancy);
  })
);

commercialPropertiesRouter.delete(
  "/tenancies/:tenancyId",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "TENANCY", id: req.params.tenancyId }], (tx) =>
      tx.tenancy.delete({ where: { id: req.params.tenancyId } })
    );
    await logAudit("TENANCY_DELETED", { targetType: "Tenancy", targetId: req.params.tenancyId });
    res.status(204).send();
  })
);

// Heuristic only — proposes values from the most recently linked lease
// document's OCR text for the user to review and apply, same pattern as
// the general document classifier. Never writes to the tenancy itself.
commercialPropertiesRouter.get(
  "/tenancies/:tenancyId/extract-lease-terms",
  asyncHandler(async (req, res) => {
    const links = await prisma.documentLink.findMany({
      where: { targetType: "TENANCY", targetId: req.params.tenancyId },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    const leaseDoc = links.map((l) => l.document).find((d) => d.documentType === "Lease" || d.documentType === "Lease Amendment");
    if (!leaseDoc) {
      res.json({ found: false, suggestion: null, sourceDocument: null });
      return;
    }
    const suggestion = extractLeaseTerms(leaseDoc.textExtractionEnabled ? leaseDoc.ocrText || "" : "");
    res.json({
      found: true,
      suggestion,
      sourceDocument: { id: leaseDoc.id, originalFilename: leaseDoc.originalFilename },
    });
  })
);

const rentReviewInput = z.object({
  reviewDate: z.string().datetime(),
  reviewMechanism: z.enum(["FIXED_PERCENT", "CPI", "MARKET", "HYBRID", "FIXED"]).optional().nullable(),
  previousRent: z.number().optional().nullable(),
  newRent: z.number().optional().nullable(),
  actualVsExpected: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

commercialPropertiesRouter.post(
  "/tenancies/:tenancyId/rent-reviews",
  asyncHandler(async (req, res) => {
    const parsed = rentReviewInput.parse(req.body);
    const rentReview = await prisma.rentReview.create({
      data: { ...parsed, reviewDate: new Date(parsed.reviewDate), tenancyId: req.params.tenancyId },
    });
    // Keep the tenancy's current rent in step with its latest confirmed review.
    if (parsed.newRent !== undefined && parsed.newRent !== null) {
      await prisma.tenancy.update({
        where: { id: req.params.tenancyId },
        data: { currentBaseRent: parsed.newRent },
      });
    }
    await logAudit("RENT_REVIEW_RECORDED", { targetType: "RentReview", targetId: rentReview.id });
    res.status(201).json(rentReview);
  })
);

commercialPropertiesRouter.delete(
  "/rent-reviews/:id",
  asyncHandler(async (req, res) => {
    await prisma.rentReview.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Outgoings — gross expense vs recoverable vs recovered (spec section 10)
// ---------------------------------------------------------------------------

const outgoingInput = z.object({
  date: z.string().datetime(),
  category: z.string().min(1),
  supplier: z.string().optional().nullable(),
  amount: z.number(),
  gst: z.number().optional().nullable(),
  tenancyId: z.string().optional().nullable(),
  recoverable: z.boolean().optional(),
  recoveryPercent: z.number().optional().nullable(),
  recoveredAmount: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

commercialPropertiesRouter.post(
  "/:id/outgoings",
  asyncHandler(async (req, res) => {
    const parsed = outgoingInput.parse(req.body);
    const outgoing = await prisma.outgoingRecord.create({
      data: { ...parsed, date: new Date(parsed.date), commercialPropertyId: req.params.id },
    });
    await logAudit("OUTGOING_RECORDED", { targetType: "OutgoingRecord", targetId: outgoing.id });
    res.status(201).json(outgoing);
  })
);

commercialPropertiesRouter.put(
  "/outgoings/:id",
  asyncHandler(async (req, res) => {
    const parsed = outgoingInput.partial().parse(req.body);
    const data = { ...parsed, date: parsed.date ? new Date(parsed.date) : undefined };
    const outgoing = await prisma.outgoingRecord.update({ where: { id: req.params.id }, data });
    res.json(outgoing);
  })
);

commercialPropertiesRouter.delete(
  "/outgoings/:id",
  asyncHandler(async (req, res) => {
    await prisma.outgoingRecord.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Capital expenditure — kept separate from operating expenses (section 23)
// ---------------------------------------------------------------------------

const capexInput = z.object({
  date: z.string().datetime(),
  description: z.string().min(1),
  amount: z.number(),
  gst: z.number().optional().nullable(),
  usefulLifeYears: z.number().optional().nullable(),
  depreciationInfo: z.string().optional().nullable(),
  taxTreatmentStatus: z.enum(["CONFIRMED", "PROPOSED", "NEEDS_REVIEW"]).optional(),
  notes: z.string().optional().nullable(),
});

commercialPropertiesRouter.post(
  "/:id/capital-expenditure",
  asyncHandler(async (req, res) => {
    const parsed = capexInput.parse(req.body);
    const item = await prisma.capitalExpenditureItem.create({
      data: { ...parsed, date: new Date(parsed.date), commercialPropertyId: req.params.id },
    });
    await logAudit("CAPEX_RECORDED", { targetType: "CapitalExpenditureItem", targetId: item.id });
    res.status(201).json(item);
  })
);

commercialPropertiesRouter.put(
  "/capital-expenditure/:id",
  asyncHandler(async (req, res) => {
    const parsed = capexInput.partial().parse(req.body);
    const data = { ...parsed, date: parsed.date ? new Date(parsed.date) : undefined };
    const item = await prisma.capitalExpenditureItem.update({ where: { id: req.params.id }, data });
    res.json(item);
  })
);

commercialPropertiesRouter.delete(
  "/capital-expenditure/:id",
  asyncHandler(async (req, res) => {
    await prisma.capitalExpenditureItem.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Occupancy snapshots — historical vacancy record (section 8)
// ---------------------------------------------------------------------------

const occupancySnapshotInput = z.object({
  asAtDate: z.string().datetime(),
  totalNla: z.number(),
  occupiedNla: z.number(),
  notes: z.string().optional().nullable(),
});

commercialPropertiesRouter.post(
  "/:id/occupancy-snapshots",
  asyncHandler(async (req, res) => {
    const parsed = occupancySnapshotInput.parse(req.body);
    const snapshot = await prisma.occupancySnapshot.create({
      data: { ...parsed, asAtDate: new Date(parsed.asAtDate), commercialPropertyId: req.params.id },
    });
    res.status(201).json(snapshot);
  })
);

commercialPropertiesRouter.delete(
  "/occupancy-snapshots/:id",
  asyncHandler(async (req, res) => {
    await prisma.occupancySnapshot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Annual snapshots — immutable historical record per financial year (33/34)
// ---------------------------------------------------------------------------

commercialPropertiesRouter.get(
  "/:id/annual-snapshot-preview",
  asyncHandler(async (req, res) => {
    const valuationBasis = req.query.valuationBasis === "purchase" ? "purchase" : "current";
    const metrics = await loadMetrics(req.params.id, valuationBasis);
    if (!metrics) {
      res.status(404).json({ error: "Commercial property not found" });
      return;
    }
    res.json({
      propertyValue: metrics.yields.propertyValue,
      debt: metrics.debt.totalDebt,
      equity: metrics.debt.equity,
      rent: metrics.income.grossRent,
      recoveries: metrics.income.recoveries,
      operatingExpenses: metrics.income.grossOperatingExpenses,
      noi: metrics.income.noi,
      interest: metrics.debt.estimatedAnnualInterest,
      principal: null,
      cashFlow: metrics.cashFlowAfterFinancing.value,
      capRate: metrics.yields.capRate,
      grossYield: metrics.yields.grossYield,
      netYield: metrics.yields.netYield,
      lvr: metrics.debt.lvr,
      status: "ESTIMATED",
      note: "Pre-filled from the current trailing-12-month calculation — review and adjust before saving as this financial year's record.",
    });
  })
);

const annualSnapshotInput = z.object({
  financialYearId: z.string(),
  propertyValue: z.number().optional().nullable(),
  debt: z.number().optional().nullable(),
  equity: z.number().optional().nullable(),
  rent: z.number().optional().nullable(),
  recoveries: z.number().optional().nullable(),
  operatingExpenses: z.number().optional().nullable(),
  noi: z.number().optional().nullable(),
  interest: z.number().optional().nullable(),
  principal: z.number().optional().nullable(),
  cashFlow: z.number().optional().nullable(),
  capRate: z.number().optional().nullable(),
  grossYield: z.number().optional().nullable(),
  netYield: z.number().optional().nullable(),
  lvr: z.number().optional().nullable(),
  status: z.enum(["ACTUAL", "ESTIMATED", "PROJECTED"]).optional(),
  notes: z.string().optional().nullable(),
});

commercialPropertiesRouter.post(
  "/:id/annual-snapshots",
  asyncHandler(async (req, res) => {
    const parsed = annualSnapshotInput.parse(req.body);
    const snapshot = await prisma.annualPropertySnapshot.upsert({
      where: { commercialPropertyId_financialYearId: { commercialPropertyId: req.params.id, financialYearId: parsed.financialYearId } },
      update: parsed,
      create: { ...parsed, commercialPropertyId: req.params.id },
      include: { financialYear: true },
    });
    await logAudit("ANNUAL_SNAPSHOT_SAVED", { targetType: "AnnualPropertySnapshot", targetId: snapshot.id });
    res.status(201).json(snapshot);
  })
);

commercialPropertiesRouter.put(
  "/annual-snapshots/:id",
  asyncHandler(async (req, res) => {
    const parsed = annualSnapshotInput.partial().parse(req.body);
    const snapshot = await prisma.annualPropertySnapshot.update({
      where: { id: req.params.id },
      data: parsed,
      include: { financialYear: true },
    });
    res.json(snapshot);
  })
);

commercialPropertiesRouter.delete(
  "/annual-snapshots/:id",
  asyncHandler(async (req, res) => {
    await prisma.annualPropertySnapshot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
