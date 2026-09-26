import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { deleteWithLinks, entityDependents, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { parseTfnInput, revealTfn, tfnSummary } from "../services/tfnAccess.js";
import { computeLiveBreakdown } from "../services/netWorth.js";
import { shareOf } from "../services/ownership.js";

export const entitiesRouter = Router();

// Legal/ownership vehicles only. PROPERTY, BANK_ACCOUNT and
// INVESTMENT_ACCOUNT are Asset/Account concepts, not entity types — an
// entity is who owns things, never the thing itself.
const entityInput = z.object({
  name: z.string().min(1),
  entityType: z.enum(["INDIVIDUAL", "JOINT", "TRUST", "UNIT_TRUST", "HOLDING_TRUST", "COMPANY", "PARTNERSHIP", "SUPER_FUND", "SMSF", "OTHER"]),
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
        personalFor: { select: { id: true, name: true } },
        personRelationships: { include: { person: { select: { id: true, name: true } } } },
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
        personalFor: { select: { id: true, name: true } },
        assets: { where: { parentAssetId: null }, include: { ownerships: true } },
        liabilities: { include: { ownerships: true } },
        accounts: true,
        properties: { include: { asset: true } },
        commercialProperties: { include: { asset: true } },
        investmentAccounts: true,
        taxRecords: true,
        heldForLoans: { select: { id: true, name: true, entity: { select: { id: true, name: true } } } },
      },
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    // Its own balance sheet: its share of anything shared, plus its share of
    // unit trusts it holds units in.
    const b = await computeLiveBreakdown(entity.id);
    const financialPosition = {
      byAssetType: b.byAssetType,
      cash: b.cash - (b.byAssetType.CASH ?? 0),
      totalAssets: b.totalAssets,
      totalLiabilities: b.totalLiabilities,
      netAssets: b.netPosition,
      unitHoldings: b.unitHoldings,
      sharedItems: b.sharedItems,
    };
    // Things it owns part of, where someone else is the owner on record.
    const [sharedAssets, sharedLiabilities, unitholders] = await Promise.all([
      prisma.asset.findMany({
        where: { parentAssetId: null, entityId: { not: entity.id }, ownerships: { some: { ownerEntityId: entity.id } } },
        include: { ownerships: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
      }),
      prisma.liability.findMany({
        where: { entityId: { not: entity.id }, ownerships: { some: { ownerEntityId: entity.id } } },
        include: { ownerships: true },
      }),
      prisma.entityRelationship.findMany({
        where: { toEntityId: entity.id, relationshipType: "UNITHOLDER" },
        include: { fromEntity: { select: { id: true, name: true, personalFor: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    res.json({
      ...entity,
      ...(await tfnSummary("entity", entity.id)),
      financialPosition,
      sharedAssets: sharedAssets.map((a) => ({ ...a, sharePercent: shareOf(a, entity.id) * 100 })),
      sharedLiabilities: sharedLiabilities.map((l) => ({ ...l, sharePercent: shareOf(l, entity.id) * 100 })),
      unitholders,
    });
  })
);

entitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = entityInput.parse(req.body);
    const tfn = parseTfnInput(parsed.tfn);
    if (!tfn.ok) {
      res.status(400).json({ error: tfn.error });
      return;
    }
    const entity = await prisma.entity.create({ data: { ...entityData(parsed), tfn: tfn.value } });
    await logAudit("ENTITY_CREATED", { targetType: "Entity", targetId: entity.id, data: { name: entity.name } });
    res.status(201).json({ ...entity, ...(await tfnSummary("entity", entity.id)) });
  })
);

entitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = entityInput.partial().parse(req.body);
    const tfn = parseTfnInput(parsed.tfn);
    if (!tfn.ok) {
      res.status(400).json({ error: tfn.error });
      return;
    }
    const entity = await prisma.entity.update({
      where: { id: req.params.id },
      data: { ...entityData(parsed), tfn: tfn.value },
    });
    await logAudit("ENTITY_CHANGED", { targetType: "Entity", targetId: entity.id, data: parsed });
    res.json({ ...entity, ...(await tfnSummary("entity", entity.id)) });
  })
);

/**
 * The full number, on explicit request only — every reveal is audited, since
 * it's the one moment the value leaves the vault in readable form.
 */
entitiesRouter.get(
  "/:id/tfn",
  asyncHandler(async (req, res) => {
    const tfn = await revealTfn("entity", req.params.id);
    if (tfn) await logAudit("TFN_REVEALED", { targetType: "Entity", targetId: req.params.id });
    res.json({ tfn });
  })
);

entitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const entity = await prisma.entity.findUnique({ where: { id: req.params.id }, include: { personalFor: true } });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    if (entity.personalFor) {
      throw new HttpError(
        409,
        `This is ${entity.personalFor.name}'s personal entity — it's removed together with them. Delete the person instead.`
      );
    }
    refuseIfInUse("entity", await entityDependents(entity.id));
    await deleteWithLinks([{ type: "ENTITY", id: entity.id }], (tx) => tx.entity.delete({ where: { id: entity.id } }));
    await logAudit("ENTITY_DELETED", { targetType: "Entity", targetId: req.params.id });
    res.status(204).send();
  })
);

// Adds the family members ticked on the "who else is in this trust?" list.
entitiesRouter.post(
  "/:id/beneficiaries",
  asyncHandler(async (req, res) => {
    const { personIds } = z.object({ personIds: z.array(z.string()).min(1) }).parse(req.body);
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.id },
      include: { personRelationships: { where: { relationshipType: "BENEFICIARY" } } },
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    const already = new Set(entity.personRelationships.map((r) => r.personId));
    const toAdd = [...new Set(personIds)].filter((id) => !already.has(id));
    await prisma.$transaction(
      toAdd.map((personId) =>
        prisma.personEntityRelationship.create({ data: { personId, entityId: entity.id, relationshipType: "BENEFICIARY" } })
      )
    );
    await logAudit("BENEFICIARIES_ADDED", { targetType: "Entity", targetId: entity.id, data: { count: toAdd.length } });
    res.status(201).json({ added: toAdd.length });
  })
);

/**
 * A unit trust's unitholders each hold a set share. The shares can't pass
 * 100%, and each holder is listed once — change a holding by removing it
 * and adding the new one.
 */
async function checkUnitholding(trustId: string, holderId: string, percent: number | null | undefined) {
  const trust = await prisma.entity.findUnique({ where: { id: trustId } });
  if (!trust || trust.entityType !== "UNIT_TRUST") throw new HttpError(400, "Units can only be held in a unit trust.");
  if (!percent || percent <= 0 || percent > 100) throw new HttpError(400, "Enter the share of the units held, between 0 and 100%.");
  const existing = await prisma.entityRelationship.findMany({ where: { toEntityId: trustId, relationshipType: "UNITHOLDER" } });
  if (existing.some((r) => r.fromEntityId === holderId)) {
    throw new HttpError(409, "They already hold units in this trust — remove that holding first to change it.");
  }
  const taken = existing.reduce((s, r) => s + (r.ownershipPercent ?? 0), 0);
  if (taken + percent > 100.01) {
    throw new HttpError(400, `That would make the units add up to ${Math.round((taken + percent) * 100) / 100}% — ${Math.round((100 - taken) * 100) / 100}% is left.`);
  }
}

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
    if (parsed.fromEntityId === parsed.toEntityId) throw new HttpError(400, "An entity can't be related to itself.");
    if (parsed.relationshipType === "UNITHOLDER") await checkUnitholding(parsed.toEntityId, parsed.fromEntityId, parsed.ownershipPercent);
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
