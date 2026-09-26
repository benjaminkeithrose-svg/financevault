import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { checkOwners, checkRoomFor, ownersInput } from "../services/ownership.js";
import { CGT_ASSET_TYPES, saleGains } from "../services/assetSaleCgt.js";

export const assetsRouter = Router();

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityId, assetType, parentAssetId } = req.query as Record<string, string | undefined>;
    // Sub-assets (an air conditioner in a house) live under their parent, so
    // the register lists top-level assets unless a parent is asked for.
    const where: Record<string, unknown> = { parentAssetId: parentAssetId ?? null };
    if (entityId) where.entityId = entityId;
    if (assetType) where.assetType = assetType;
    const assets = await prisma.asset.findMany({
      where,
      include: { entity: true, property: true, securedLoans: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(assets);
  })
);

assetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        entity: true,
        property: true,
        commercialProperty: { select: { id: true, name: true } },
        securedLoans: true,
        parent: { select: { id: true, name: true, assetType: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } } },
        maintenance: { orderBy: { date: "desc" } },
        ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "ASSET", targetId: asset.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    const items = await itemTree(asset.id);
    res.json({
      ...asset,
      documents: links.map((l) => l.document),
      items,
      lifetimeCost: (asset.acquisitionCost ?? 0) + asset.maintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    });
  })
);

const assetInput = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1), // VEHICLE | MANAGED_FUND | SHARES | EQUIPMENT | SUPERANNUATION | CASH | OTHER (not PROPERTY — use /api/properties)
  // A sub-asset takes its owner from the asset it sits under.
  entityId: z.string().optional(),
  acquisitionDate: z.string().datetime().optional().nullable(),
  acquisitionCost: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  valuationDate: z.string().datetime().optional().nullable(),
  disposalDate: z.string().datetime().optional().nullable(),
  disposalValue: z.number().optional().nullable(),
  buyingCosts: z.number().min(0).optional().nullable(),
  improvementsCost: z.number().min(0).optional().nullable(),
  capitalWorksClaimed: z.number().min(0).optional().nullable(),
  lenderMaxLvr: z.number().min(0).max(1).optional().nullable(),
  ownershipReason: z.string().max(2000).optional().nullable(),
  landValue: z.number().nonnegative().optional().nullable(),
  landTaxPerYear: z.number().nonnegative().optional().nullable(),
  depreciationPerYear: z.number().nonnegative().optional().nullable(),
  capitalWorksPerYear: z.number().nonnegative().optional().nullable(),
  sellingCosts: z.number().min(0).optional().nullable(),
  mainResidence: z.enum(["NONE", "FULL", "PARTIAL"]).optional().nullable(),
  mainResidencePercent: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  vehicleType: z.string().optional().nullable(),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  registration: z.string().optional().nullable(),
  registrationExpiry: z.string().datetime().optional().nullable(),
  identifier: z.string().optional().nullable(),
  parentAssetId: z.string().optional().nullable(),
  itemCategory: z.string().optional().nullable(),
  warrantyExpiry: z.string().datetime().optional().nullable(),
  owners: ownersInput,
});

function assetData({ owners: _owners, ...parsed }: z.infer<typeof assetInput>) {
  if (parsed.assetType === "PROPERTY") {
    throw new HttpError(400, "Properties are added from the Properties page, not as a general asset.");
  }
  return {
    ...parsed,
    acquisitionDate: parsed.acquisitionDate ? new Date(parsed.acquisitionDate) : parsed.acquisitionDate,
    valuationDate: parsed.valuationDate ? new Date(parsed.valuationDate) : parsed.valuationDate,
    disposalDate: parsed.disposalDate ? new Date(parsed.disposalDate) : parsed.disposalDate,
    registrationExpiry: parsed.registrationExpiry ? new Date(parsed.registrationExpiry) : parsed.registrationExpiry,
    warrantyExpiry: parsed.warrantyExpiry ? new Date(parsed.warrantyExpiry) : parsed.warrantyExpiry,
  };
}

assetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = assetInput.parse(req.body);
    let entityId = parsed.entityId;
    if (parsed.parentAssetId) {
      const parent = await prisma.asset.findUnique({ where: { id: parsed.parentAssetId } });
      if (!parent) throw new HttpError(400, "The asset this item belongs under doesn't exist.");
      entityId = parent.entityId;
    }
    // Several owners: the first is the owner on record, the split is kept alongside.
    const owners = parsed.parentAssetId ? null : checkOwners(parsed.owners);
    if (owners) entityId = owners[0].entityId;
    if (!entityId) throw new HttpError(400, "Owned by is required");
    const asset = await prisma.asset.create({
      data: {
        ...assetData(parsed),
        entityId,
        ...(owners
          ? { ownerships: { create: owners.map((o) => ({ ownerEntityId: o.entityId, ownershipPercent: o.percent, ownershipType: "LEGAL" })) } }
          : {}),
      },
      include: { entity: true },
    });
    await logAudit("ASSET_CREATED", { targetType: "Asset", targetId: asset.id });
    res.status(201).json(asset);
  })
);

assetsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = assetInput.partial().parse(req.body);
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: assetData(parsed as z.infer<typeof assetInput>),
      include: { entity: true },
    });
    await logAudit("ASSET_CHANGED", { targetType: "Asset", targetId: asset.id, data: parsed });
    res.json(asset);
  })
);

// "Still right": the value was looked at and hasn't changed.
assetsRouter.post(
  "/:id/value-checked",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.update({ where: { id: req.params.id }, data: { valuationDate: new Date() } });
    res.json({ valuationDate: asset.valuationDate });
  })
);

// The capital gain a sale made, owner by owner — shown on the asset's page.
assetsRouter.get(
  "/:id/sale",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        ownerships: true,
        property: { select: { id: true, purchasePrice: true, purchaseDate: true } },
        commercialProperty: { select: { id: true, purchasePrice: true, purchaseDate: true } },
      },
    });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    const entities = await prisma.entity.findMany({ select: { id: true, name: true, entityType: true } });
    const rows = saleGains(asset, new Map(entities.map((e) => [e.id, e])));
    // Loans still recorded against it, which a sale would normally pay out.
    const openLoans = await prisma.liability.findMany({
      where: {
        currentBalance: { gt: 0 },
        OR: [
          { securityAssetId: asset.id },
          ...(asset.property ? [{ securityPropertyId: asset.property.id }] : []),
          ...(asset.commercialProperty ? [{ securityCommercialPropertyId: asset.commercialProperty.id }] : []),
        ],
      },
      select: { id: true, name: true, currentBalance: true },
    });
    res.json({ cgtApplies: CGT_ASSET_TYPES.includes(asset.assetType), rows, openLoans });
  })
);

assetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        property: true,
        commercialProperty: true,
        _count: { select: { securedLoans: true, children: true } },
      },
    });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    if (asset.property || asset.commercialProperty) {
      res.status(400).json({ error: "Delete the property instead — this asset backs a property record" });
      return;
    }
    refuseIfInUse(asset.assetType === "VEHICLE" ? "vehicle" : "asset", [
      { count: asset._count.securedLoans, one: "loan linked to it", many: "loans linked to it" },
      { count: asset._count.children, one: "item under it", many: "items under it" },
    ]);
    const maintenance = await prisma.maintenanceRecord.findMany({ where: { assetId: asset.id }, select: { id: true } });
    await deleteWithLinks(
      [{ type: "ASSET", id: asset.id }, ...maintenance.map((m) => ({ type: "MAINTENANCE", id: m.id }))],
      (tx) => tx.asset.delete({ where: { id: asset.id } })
    );
    await logAudit("ASSET_DELETED", { targetType: "Asset", targetId: req.params.id });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Asset ownership — fractional/time-boxed ownership records that sit
// alongside Asset.entityId (the primary/current owner, kept for simple
// queries). Recording a split here (e.g. 50/50 between two entities) never
// changes Asset.entityId; absence of any record here just means the primary
// entity is the sole 100% owner.
// ---------------------------------------------------------------------------

const ownershipInput = z.object({
  ownerEntityId: z.string(),
  ownershipPercent: z.number().min(0).max(100),
  ownershipType: z.string().optional().nullable(), // LEGAL | BENEFICIAL
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

assetsRouter.post(
  "/:id/ownerships",
  asyncHandler(async (req, res) => {
    const parsed = ownershipInput.parse(req.body);
    const isCurrent = !parsed.endDate || new Date(parsed.endDate) >= new Date();
    if (isCurrent) checkRoomFor(await prisma.assetOwnership.findMany({ where: { assetId: req.params.id } }), parsed.ownershipPercent);
    const ownership = await prisma.assetOwnership.create({
      data: {
        assetId: req.params.id,
        ownerEntityId: parsed.ownerEntityId,
        ownershipPercent: parsed.ownershipPercent,
        ownershipType: parsed.ownershipType ?? null,
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        notes: parsed.notes ?? null,
      },
      include: { ownerEntity: true },
    });
    await logAudit("ASSET_OWNERSHIP_ADDED", { targetType: "Asset", targetId: req.params.id });
    res.status(201).json(ownership);
  })
);

assetsRouter.put(
  "/ownerships/:ownershipId",
  asyncHandler(async (req, res) => {
    const parsed = ownershipInput.partial().parse(req.body);
    const ownership = await prisma.assetOwnership.update({
      where: { id: req.params.ownershipId },
      data: {
        ...parsed,
        startDate: parsed.startDate !== undefined ? (parsed.startDate ? new Date(parsed.startDate) : null) : undefined,
        endDate: parsed.endDate !== undefined ? (parsed.endDate ? new Date(parsed.endDate) : null) : undefined,
      },
      include: { ownerEntity: true },
    });
    await logAudit("ASSET_OWNERSHIP_CHANGED", { targetType: "Asset", targetId: ownership.assetId });
    res.json(ownership);
  })
);

assetsRouter.delete(
  "/ownerships/:ownershipId",
  asyncHandler(async (req, res) => {
    const ownership = await prisma.assetOwnership.delete({ where: { id: req.params.ownershipId } });
    await logAudit("ASSET_OWNERSHIP_REMOVED", { targetType: "Asset", targetId: ownership.assetId });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Sub-assets and their service history
// ---------------------------------------------------------------------------

type ItemNode = {
  id: string;
  name: string;
  itemCategory: string | null;
  make: string | null;
  model: string | null;
  acquisitionDate: Date | null;
  acquisitionCost: number | null;
  warrantyExpiry: Date | null;
  maintenanceCost: number;
  lifetimeCost: number;
  lastServiced: Date | null;
  nextDue: Date | null;
  documentCount: number;
  children: ItemNode[];
};

/**
 * Everything under an asset, as a tree, with each item's running costs — so
 * a property page can show the air con, the hot water system and what each
 * has cost to own. Depth is capped as a guard against a loop in the data.
 */
export async function itemTree(parentAssetId: string, depth = 0): Promise<ItemNode[]> {
  if (depth > 6) return [];
  const items = await prisma.asset.findMany({
    where: { parentAssetId },
    include: { maintenance: true },
    orderBy: { name: "asc" },
  });
  const docCounts = await prisma.documentLink.groupBy({
    by: ["targetId"],
    where: { targetType: "ASSET", targetId: { in: items.map((i) => i.id) } },
    _count: { _all: true },
  });
  const docs = new Map(docCounts.map((d) => [d.targetId, d._count._all]));
  const now = Date.now();
  return Promise.all(
    items.map(async (item) => {
      const maintenanceCost = item.maintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0);
      const dates = item.maintenance.map((m) => m.date.getTime());
      const upcoming = item.maintenance
        .map((m) => m.nextDueDate?.getTime())
        .filter((t): t is number => t !== undefined && t >= now)
        .sort((a, b) => a - b);
      return {
        id: item.id,
        name: item.name,
        itemCategory: item.itemCategory,
        make: item.make,
        model: item.model,
        acquisitionDate: item.acquisitionDate,
        acquisitionCost: item.acquisitionCost,
        warrantyExpiry: item.warrantyExpiry,
        maintenanceCost,
        lifetimeCost: (item.acquisitionCost ?? 0) + maintenanceCost,
        lastServiced: dates.length ? new Date(Math.max(...dates)) : null,
        nextDue: upcoming.length ? new Date(upcoming[0]) : null,
        documentCount: docs.get(item.id) ?? 0,
        children: await itemTree(item.id, depth + 1),
      };
    })
  );
}

const maintenanceInput = z.object({
  date: z.string().datetime(),
  kind: z.enum(["SERVICE", "REPAIR", "INSPECTION", "INSTALLATION", "PART", "OTHER"]),
  description: z.string().min(1),
  cost: z.number().optional().nullable(),
  provider: z.string().optional().nullable(),
  nextDueDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function maintenanceData(parsed: Partial<z.infer<typeof maintenanceInput>>) {
  return {
    ...parsed,
    date: parsed.date ? new Date(parsed.date) : undefined,
    nextDueDate: parsed.nextDueDate === undefined ? undefined : parsed.nextDueDate ? new Date(parsed.nextDueDate) : null,
  };
}

assetsRouter.post(
  "/:id/maintenance",
  asyncHandler(async (req, res) => {
    const parsed = maintenanceInput.parse(req.body);
    const record = await prisma.maintenanceRecord.create({
      data: {
        ...parsed,
        date: new Date(parsed.date),
        nextDueDate: parsed.nextDueDate ? new Date(parsed.nextDueDate) : null,
        assetId: req.params.id,
      },
    });
    await logAudit("MAINTENANCE_RECORDED", { targetType: "Asset", targetId: req.params.id, data: { kind: parsed.kind } });
    res.status(201).json(record);
  })
);

assetsRouter.put(
  "/maintenance/:recordId",
  asyncHandler(async (req, res) => {
    const parsed = maintenanceInput.partial().parse(req.body);
    const record = await prisma.maintenanceRecord.update({ where: { id: req.params.recordId }, data: maintenanceData(parsed) });
    res.json(record);
  })
);

assetsRouter.delete(
  "/maintenance/:recordId",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "MAINTENANCE", id: req.params.recordId }], (tx) =>
      tx.maintenanceRecord.delete({ where: { id: req.params.recordId } })
    );
    res.status(204).send();
  })
);
