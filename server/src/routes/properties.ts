import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { checkOwners, ownersInput } from "../services/ownership.js";

export const propertiesRouter = Router();

propertiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const properties = await prisma.property.findMany({
      where: entityId ? { entityId } : undefined,
      include: { asset: true, entity: true, liabilities: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(properties);
  })
);

propertiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: {
        asset: { include: { ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } } } },
        entity: true,
        liabilities: true,
      },
    });
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const links = await prisma.documentLink.findMany({
      where: { targetType: "PROPERTY", targetId: property.id },
      include: { document: { include: { taxCategory: true, financialYear: true } } },
      orderBy: { createdAt: "desc" },
    });

    const summaryByGroup: Record<string, { total: number; byCategory: Record<string, number> }> = {
      INCOME: { total: 0, byCategory: {} },
      EXPENSE: { total: 0, byCategory: {} },
      CAPITAL: { total: 0, byCategory: {} },
    };
    for (const link of links) {
      const doc = link.document;
      const group = doc.taxCategory?.group;
      if (!group || !summaryByGroup[group] || doc.amount === null || doc.amount === undefined) continue;
      summaryByGroup[group].total += doc.amount;
      const catName = doc.taxCategory?.name || "Uncategorised";
      summaryByGroup[group].byCategory[catName] = (summaryByGroup[group].byCategory[catName] || 0) + doc.amount;
    }

    res.json({ ...property, documents: links.map((l) => l.document), summary: summaryByGroup });
  })
);

const createInput = z.object({
  name: z.string().min(1), // asset display name, e.g. "123 Example St, Sydney"
  entityId: z.string(),
  address: z.string().min(1),
  state: z.string().optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  settlementDate: z.string().datetime().optional().nullable(),
  purchasePrice: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  ownershipPercent: z.number().optional().nullable(),
  tenantInfo: z.string().optional().nullable(),
  propertyManager: z.string().optional().nullable(),
  weeklyRent: z.number().nonnegative().optional().nullable(),
  councilRates: z.number().nonnegative().optional().nullable(),
  waterRates: z.number().nonnegative().optional().nullable(),
  strataFees: z.number().nonnegative().optional().nullable(),
  managementPercent: z.number().nonnegative().optional().nullable(),
  repairsPerYear: z.number().nonnegative().optional().nullable(),
  otherCostsPerYear: z.number().nonnegative().optional().nullable(),
  owners: ownersInput,
});

propertiesRouter.post(
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
          assetType: "PROPERTY",
          entityId: parsed.entityId,
          acquisitionDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : undefined,
          acquisitionCost: parsed.purchasePrice ?? undefined,
          currentValue: parsed.currentValue ?? undefined,
        },
      });
      if (owners) {
        await tx.assetOwnership.createMany({
          data: owners.map((o) => ({ assetId: asset.id, ownerEntityId: o.entityId, ownershipPercent: o.percent, ownershipType: "LEGAL" })),
        });
      }
      return tx.property.create({
        data: {
          assetId: asset.id,
          entityId: parsed.entityId,
          address: parsed.address,
          state: parsed.state,
          purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : undefined,
          settlementDate: parsed.settlementDate ? new Date(parsed.settlementDate) : undefined,
          purchasePrice: parsed.purchasePrice,
          ownershipPercent: parsed.ownershipPercent,
          tenantInfo: parsed.tenantInfo,
          propertyManager: parsed.propertyManager,
          weeklyRent: parsed.weeklyRent,
          councilRates: parsed.councilRates,
          waterRates: parsed.waterRates,
          strataFees: parsed.strataFees,
          managementPercent: parsed.managementPercent,
          repairsPerYear: parsed.repairsPerYear,
          otherCostsPerYear: parsed.otherCostsPerYear,
        },
        include: { asset: true, entity: true },
      });
    });
    await logAudit("PROPERTY_CREATED", { targetType: "Property", targetId: property.id });
    res.status(201).json(property);
  })
);

// Owners are chosen when it's created; later changes go through the ownership split.
const updateInput = createInput.omit({ owners: true }).partial();

propertiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateInput.parse(req.body);
    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: property.assetId },
        data: {
          name: parsed.name,
          acquisitionDate: parsed.purchaseDate !== undefined ? (parsed.purchaseDate ? new Date(parsed.purchaseDate) : null) : undefined,
          acquisitionCost: parsed.purchasePrice,
          currentValue: parsed.currentValue,
        },
      });
      return tx.property.update({
        where: { id: req.params.id },
        data: {
          address: parsed.address,
          state: parsed.state,
          purchaseDate: parsed.purchaseDate !== undefined ? (parsed.purchaseDate ? new Date(parsed.purchaseDate) : null) : undefined,
          settlementDate:
            parsed.settlementDate !== undefined ? (parsed.settlementDate ? new Date(parsed.settlementDate) : null) : undefined,
          purchasePrice: parsed.purchasePrice,
          ownershipPercent: parsed.ownershipPercent,
          tenantInfo: parsed.tenantInfo,
          propertyManager: parsed.propertyManager,
          weeklyRent: parsed.weeklyRent,
          councilRates: parsed.councilRates,
          waterRates: parsed.waterRates,
          strataFees: parsed.strataFees,
          managementPercent: parsed.managementPercent,
          repairsPerYear: parsed.repairsPerYear,
          otherCostsPerYear: parsed.otherCostsPerYear,
        },
        include: { asset: true, entity: true },
      });
    });

    await logAudit("PROPERTY_CHANGED", { targetType: "Property", targetId: updated.id, data: parsed });
    res.json(updated);
  })
);

propertiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { liabilities: true } }, asset: { select: { _count: { select: { children: true } } } } },
    });
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }
    // Items under it (appliances, solar…) would otherwise quietly become assets of their own.
    refuseIfInUse("property", [
      { count: property._count.liabilities, one: "secured loan", many: "secured loans" },
      { count: property.asset._count.children, one: "item recorded under it", many: "items recorded under it" },
    ]);
    const maintenance = await prisma.maintenanceRecord.findMany({ where: { assetId: property.assetId }, select: { id: true } });
    await deleteWithLinks(
      [
        { type: "PROPERTY", id: property.id },
        { type: "ASSET", id: property.assetId },
        ...maintenance.map((m) => ({ type: "MAINTENANCE", id: m.id })),
      ],
      // Deleting the asset takes the property record with it.
      (tx) => tx.asset.delete({ where: { id: property.assetId } })
    );
    await logAudit("PROPERTY_DELETED", { targetType: "Property", targetId: req.params.id });
    res.status(204).send();
  })
);
