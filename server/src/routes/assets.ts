import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
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
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, include: { entity: true, property: true } });
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
    throw new Error("Use /api/properties to create property assets");
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
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, include: { property: true } });
    if (asset?.property) {
      res.status(400).json({ error: "Delete the property instead — this asset backs a property record" });
      return;
    }
    await prisma.asset.delete({ where: { id: req.params.id } });
    await logAudit("ASSET_DELETED", { targetType: "Asset", targetId: req.params.id });
    res.status(204).send();
  })
);
