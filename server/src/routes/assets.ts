import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";

export const assetsRouter = Router();

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityId, assetType } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;
    if (assetType) where.assetType = assetType;
    const assets = await prisma.asset.findMany({
      where,
      include: { entity: true, property: true },
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
      include: { entity: true, property: true, ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } } },
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
    res.json({ ...asset, documents: links.map((l) => l.document) });
  })
);

const assetInput = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1), // VEHICLE | MANAGED_FUND | SHARES | EQUIPMENT | SUPERANNUATION | CASH | OTHER (not PROPERTY — use /api/properties)
  entityId: z.string(),
  acquisitionDate: z.string().datetime().optional().nullable(),
  acquisitionCost: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  valuationDate: z.string().datetime().optional().nullable(),
  disposalDate: z.string().datetime().optional().nullable(),
  disposalValue: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function assetData(parsed: z.infer<typeof assetInput>) {
  if (parsed.assetType === "PROPERTY") {
    throw new HttpError(400, "Properties are added from the Properties page, not as a general asset.");
  }
  return {
    ...parsed,
    acquisitionDate: parsed.acquisitionDate ? new Date(parsed.acquisitionDate) : parsed.acquisitionDate,
    valuationDate: parsed.valuationDate ? new Date(parsed.valuationDate) : parsed.valuationDate,
    disposalDate: parsed.disposalDate ? new Date(parsed.disposalDate) : parsed.disposalDate,
  };
}

assetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = assetInput.parse(req.body);
    const asset = await prisma.asset.create({ data: assetData(parsed), include: { entity: true } });
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

assetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: { property: true, commercialProperty: true },
    });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    if (asset.property || asset.commercialProperty) {
      res.status(400).json({ error: "Delete the property instead — this asset backs a property record" });
      return;
    }
    await deleteWithLinks([{ type: "ASSET", id: asset.id }], (tx) => tx.asset.delete({ where: { id: asset.id } }));
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
