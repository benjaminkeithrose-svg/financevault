import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { checkOwners, checkRoomFor, ownersInput } from "../services/ownership.js";

export const liabilitiesRouter = Router();

liabilitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityId, liabilityType } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;
    if (liabilityType) where.liabilityType = liabilityType;
    const liabilities = await prisma.liability.findMany({
      where,
      include: { entity: true, securityProperty: true, securityCommercialProperty: true, securityAsset: true, holdingTrust: true, ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } }, offsetAccounts: { select: { id: true, institution: true, accountName: true, currentBalance: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(liabilities);
  })
);

liabilitiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const liability = await prisma.liability.findUnique({
      where: { id: req.params.id },
      include: { entity: true, securityProperty: true, securityCommercialProperty: true, securityAsset: true, holdingTrust: true, ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } }, offsetAccounts: { select: { id: true, institution: true, accountName: true, currentBalance: true } } },
    });
    if (!liability) {
      res.status(404).json({ error: "Liability not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "LIABILITY", targetId: liability.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ...liability, documents: links.map((l) => l.document) });
  })
);

const liabilityInput = z.object({
  name: z.string().min(1),
  liabilityType: z.string().min(1), // HOME_LOAN | INVESTMENT_LOAN | COMMERCIAL_LOAN | LRBA_LOAN | VEHICLE_LOAN | CREDIT_CARD | PERSONAL_LOAN | OTHER
  entityId: z.string(),
  lender: z.string().optional().nullable(),
  originalAmount: z.number().optional().nullable(),
  currentBalance: z.number().optional().nullable(),
  interestRate: z.number().optional().nullable(),
  loanType: z.string().optional().nullable(), // fixed | variable
  fixedPeriodEnds: z.string().datetime().optional().nullable(),
  repaymentAmount: z.number().optional().nullable(),
  maturityDate: z.string().datetime().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  securityPropertyId: z.string().optional().nullable(),
  securityCommercialPropertyId: z.string().optional().nullable(),
  securityAssetId: z.string().optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  holdingTrustEntityId: z.string().optional().nullable(),
  facility: z.string().max(80).optional().nullable(),
  owners: ownersInput,
  interestOnly: z.boolean().optional().nullable(),
  loanTermYears: z.number().optional().nullable(),
  repaymentFrequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY"]).optional().nullable(),
  loanFees: z.number().optional().nullable(),
  establishmentFees: z.number().optional().nullable(),
  valuationFees: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function toData({ owners: _owners, ...parsed }: z.infer<typeof liabilityInput>) {
  return {
    ...parsed,
    fixedPeriodEnds: parsed.fixedPeriodEnds ? new Date(parsed.fixedPeriodEnds) : parsed.fixedPeriodEnds,
    maturityDate: parsed.maturityDate ? new Date(parsed.maturityDate) : parsed.maturityDate,
    startDate: parsed.startDate ? new Date(parsed.startDate) : parsed.startDate,
  };
}

liabilitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = liabilityInput.parse(req.body);
    // Owed jointly: the first borrower is the one on record, the split is kept alongside.
    const owners = checkOwners(parsed.owners);
    if (owners) parsed.entityId = owners[0].entityId;
    const liability = await prisma.liability.create({
      data: {
        ...toData(parsed),
        ...(owners ? { ownerships: { create: owners.map((o) => ({ ownerEntityId: o.entityId, ownershipPercent: o.percent })) } } : {}),
      },
      include: { entity: true, securityProperty: true, securityCommercialProperty: true, securityAsset: true, holdingTrust: true, ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } }, offsetAccounts: { select: { id: true, institution: true, accountName: true, currentBalance: true } } },
    });
    await logAudit("LIABILITY_CREATED", { targetType: "Liability", targetId: liability.id });
    res.status(201).json(liability);
  })
);

liabilitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = liabilityInput.partial().parse(req.body);
    const liability = await prisma.liability.update({
      where: { id: req.params.id },
      data: toData(parsed as z.infer<typeof liabilityInput>),
      include: { entity: true, securityProperty: true, securityCommercialProperty: true, securityAsset: true, holdingTrust: true, ownerships: { include: { ownerEntity: true }, orderBy: { createdAt: "asc" } }, offsetAccounts: { select: { id: true, institution: true, accountName: true, currentBalance: true } } },
    });
    await logAudit("LIABILITY_CHANGED", { targetType: "Liability", targetId: liability.id, data: parsed });
    res.json(liability);
  })
);

// Owed jointly: each borrower's share. Same rules as an asset's ownership split.
liabilitiesRouter.post(
  "/:id/ownerships",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ ownerEntityId: z.string(), ownershipPercent: z.number().gt(0).max(100), notes: z.string().optional().nullable() })
      .parse(req.body);
    checkRoomFor(await prisma.liabilityOwnership.findMany({ where: { liabilityId: req.params.id } }), parsed.ownershipPercent);
    const row = await prisma.liabilityOwnership.create({
      data: { liabilityId: req.params.id, ...parsed, notes: parsed.notes ?? null },
      include: { ownerEntity: true },
    });
    await logAudit("LIABILITY_OWNERSHIP_ADDED", { targetType: "Liability", targetId: req.params.id });
    res.status(201).json(row);
  })
);

liabilitiesRouter.delete(
  "/ownerships/:ownershipId",
  asyncHandler(async (req, res) => {
    const row = await prisma.liabilityOwnership.delete({ where: { id: req.params.ownershipId } });
    await logAudit("LIABILITY_OWNERSHIP_REMOVED", { targetType: "Liability", targetId: row.liabilityId });
    res.status(204).send();
  })
);

liabilitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Its uses and interest years go with it (cascade); so do their "why claimed" notes.
    const [purposes, years] = await Promise.all([
      prisma.loanPurpose.findMany({ where: { liabilityId: req.params.id }, select: { id: true } }),
      prisma.loanInterestYear.findMany({ where: { liabilityId: req.params.id }, select: { id: true } }),
    ]);
    const claimTargets = [...purposes, ...years].map((x) => x.id);
    await deleteWithLinks([{ type: "LIABILITY", id: req.params.id }], async (tx) => {
      await tx.claimNote.deleteMany({ where: { targetId: { in: claimTargets } } });
      return tx.liability.delete({ where: { id: req.params.id } });
    });
    await logAudit("LIABILITY_DELETED", { targetType: "Liability", targetId: req.params.id });
    res.status(204).send();
  })
);
