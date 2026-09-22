import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { computeFinancialPosition } from "../services/financialPosition.js";

export const entitiesRouter = Router();

// Legal/ownership vehicles only. PROPERTY, BANK_ACCOUNT and
// INVESTMENT_ACCOUNT are Asset/Account concepts, not entity types — an
// entity is who owns things, never the thing itself.
const entityInput = z.object({
  name: z.string().min(1),
  entityType: z.enum(["INDIVIDUAL", "JOINT", "TRUST", "COMPANY", "PARTNERSHIP", "SUPER_FUND", "SMSF", "OTHER"]),
  abn: z.string().optional().nullable(),
  tfn: z.string().optional().nullable(),
  acn: z.string().optional().nullable(),
  establishmentDate: z.string().datetime().optional().nullable(),
  ownershipInfo: z.string().optional().nullable(),
  contactInfo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function entityData<T extends Partial<z.infer<typeof entityInput>>>(parsed: T) {
  return {
    ...parsed,
    establishmentDate: parsed.establishmentDate !== undefined ? (parsed.establishmentDate ? new Date(parsed.establishmentDate) : null) : undefined,
  };
}

entitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType } = req.query;
    const entities = await prisma.entity.findMany({
      where: entityType ? { entityType: entityType as never } : undefined,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { documents: true, assets: true, liabilities: true } },
      },
    });
    res.json(entities);
  })
);

entitiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.id },
      include: {
        relationshipsFrom: { include: { toEntity: true } },
        relationshipsTo: { include: { fromEntity: true } },
        personRelationships: { include: { person: true } },
        documents: { orderBy: { uploadDate: "desc" }, take: 25 },
        assets: true,
        liabilities: true,
        accounts: true,
        properties: true,
        commercialProperties: true,
        investmentAccounts: true,
        taxRecords: true,
      },
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    const financialPosition = computeFinancialPosition(entity.assets, entity.accounts, entity.liabilities);
    res.json({ ...entity, financialPosition });
  })
);

entitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = entityInput.parse(req.body);
    const entity = await prisma.entity.create({ data: entityData(parsed) });
    await logAudit("ENTITY_CREATED", { targetType: "Entity", targetId: entity.id, data: { name: entity.name } });
    res.status(201).json(entity);
  })
);

entitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = entityInput.partial().parse(req.body);
    const entity = await prisma.entity.update({ where: { id: req.params.id }, data: entityData(parsed) });
    await logAudit("ENTITY_CHANGED", { targetType: "Entity", targetId: entity.id, data: parsed });
    res.json(entity);
  })
);

entitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.entity.delete({ where: { id: req.params.id } });
    await logAudit("ENTITY_DELETED", { targetType: "Entity", targetId: req.params.id });
    res.status(204).send();
  })
);

const relationshipInput = z.object({
  fromEntityId: z.string(),
  toEntityId: z.string(),
  relationshipType: z.string().min(1),
  ownershipPercent: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

entitiesRouter.post(
  "/relationships",
  asyncHandler(async (req, res) => {
    const parsed = relationshipInput.parse(req.body);
    const relationship = await prisma.entityRelationship.create({ data: parsed });
    await logAudit("ENTITY_RELATIONSHIP_CREATED", { targetType: "EntityRelationship", targetId: relationship.id });
    res.status(201).json(relationship);
  })
);

entitiesRouter.delete(
  "/relationships/:id",
  asyncHandler(async (req, res) => {
    await prisma.entityRelationship.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
