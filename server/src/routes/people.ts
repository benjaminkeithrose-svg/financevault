import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { deleteWithLinks, entityDependents, refuseIfInUse } from "../services/deletion.js";
import { createPersonalEntity } from "../services/personalEntity.js";
import { FOUNDING_TRUST_ROLES, trustFamilySuggestions } from "../services/family.js";
import { logAudit } from "../services/audit.js";
import { parseTfnInput, revealTfn, tfnSummary } from "../services/tfnAccess.js";

export const peopleRouter = Router();

peopleRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const people = await prisma.person.findMany({
      orderBy: { name: "asc" },
      include: {
        entityRelationships: { include: { entity: true } },
        personalEntity: true,
        familyFrom: { include: { toPerson: { select: { id: true, name: true } } } },
        familyTo: { include: { fromPerson: { select: { id: true, name: true } } } },
      },
    });
    res.json(people);
  })
);

peopleRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findUnique({
      where: { id: req.params.id },
      include: {
        entityRelationships: { include: { entity: true } },
        personalEntity: true,
        familyFrom: { include: { toPerson: { select: { id: true, name: true } } } },
        familyTo: { include: { fromPerson: { select: { id: true, name: true } } } },
      },
    });
    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "PERSON", targetId: person.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ...person, ...(await tfnSummary("person", person.id)), documents: links.map((l) => l.document) });
  })
);

const personInput = z.object({
  name: z.string().min(1),
  dateOfBirth: z.string().datetime().optional().nullable(),
  tfn: z.string().optional().nullable(),
  contactInfo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  payFrequency: z.string().optional().nullable(), // WEEKLY | FORTNIGHTLY | MONTHLY
});

function personData<T extends Partial<z.infer<typeof personInput>>>(parsed: T) {
  return {
    ...parsed,
    dateOfBirth: parsed.dateOfBirth !== undefined ? (parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null) : undefined,
  };
}

peopleRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = personInput.parse(req.body);
    const tfn = parseTfnInput(parsed.tfn);
    if (!tfn.ok) {
      res.status(400).json({ error: tfn.error });
      return;
    }
    // The person and their personal entity are created together, so nobody
    // has to set themselves up twice.
    const person = await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({ data: { ...personData(parsed), tfn: tfn.value } });
      await createPersonalEntity(tx, created.id, created.name);
      return created;
    });
    await logAudit("PERSON_CREATED", { targetType: "Person", targetId: person.id, data: { name: person.name } });
    res.status(201).json({ ...person, ...(await tfnSummary("person", person.id)) });
  })
);

peopleRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = personInput.partial().parse(req.body);
    const tfn = parseTfnInput(parsed.tfn);
    if (!tfn.ok) {
      res.status(400).json({ error: tfn.error });
      return;
    }
    const before = await prisma.person.findUnique({ where: { id: req.params.id }, include: { personalEntity: true } });
    if (!before) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    const person = await prisma.$transaction(async (tx) => {
      const updated = await tx.person.update({
        where: { id: req.params.id },
        data: { ...personData(parsed), tfn: tfn.value },
      });
      // A rename follows through to their personal entity — unless that
      // entity was given its own name (e.g. "Ben (Personal)"), which is kept.
      if (parsed.name && before.personalEntity && before.personalEntity.name === before.name) {
        await tx.entity.update({ where: { id: before.personalEntity.id }, data: { name: parsed.name } });
      }
      return updated;
    });
    await logAudit("PERSON_CHANGED", { targetType: "Person", targetId: person.id, data: parsed });
    res.json({ ...person, ...(await tfnSummary("person", person.id)) });
  })
);

/**
 * The full number, on explicit request only — every reveal is audited, since
 * it's the one moment the value leaves the vault in readable form.
 */
peopleRouter.get(
  "/:id/tfn",
  asyncHandler(async (req, res) => {
    const tfn = await revealTfn("person", req.params.id);
    if (tfn) await logAudit("TFN_REVEALED", { targetType: "Person", targetId: req.params.id });
    res.json({ tfn });
  })
);

peopleRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findUnique({
      where: { id: req.params.id },
      include: { identityRecords: { select: { id: true } } },
    });
    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    // Their personal entity goes with them, so it has to be empty first.
    if (person.entityId) refuseIfInUse("person's personal entity", await entityDependents(person.entityId));
    const targets = [{ type: "PERSON", id: person.id }];
    if (person.entityId) targets.push({ type: "ENTITY", id: person.entityId });
    for (const r of person.identityRecords) targets.push({ type: "IDENTITY_RECORD", id: r.id });
    await deleteWithLinks(targets, async (tx) => {
      await tx.person.delete({ where: { id: person.id } });
      if (person.entityId) await tx.entity.delete({ where: { id: person.entityId } });
    });
    await logAudit("PERSON_DELETED", { targetType: "Person", targetId: req.params.id });
    res.status(204).send();
  })
);

const relationshipInput = z.object({
  personId: z.string(),
  entityId: z.string(),
  relationshipType: z.string().min(1), // SETTLOR | TRUSTEE | DIRECTOR | SHAREHOLDER | BENEFICIARY | MEMBER | INDIVIDUAL_OWNER | JOINT_OWNER | GUARANTOR | BORROWER | APPOINTOR | ACCOUNTANT | TAX_AGENT | OTHER
  ownershipPercent: z.number().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

peopleRouter.post(
  "/relationships",
  asyncHandler(async (req, res) => {
    const parsed = relationshipInput.parse(req.body);
    const relationship = await prisma.personEntityRelationship.create({
      data: {
        ...parsed,
        startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
        endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
      },
      include: { entity: true, person: true },
    });
    await logAudit("PERSON_ENTITY_RELATIONSHIP_CREATED", {
      targetType: "PersonEntityRelationship",
      targetId: relationship.id,
    });
    // Setting up a family trust: offer the rest of the family as
    // beneficiaries. Nothing is added here — the person ticks who to include.
    const familySuggestions =
      relationship.entity.entityType === "TRUST" && FOUNDING_TRUST_ROLES.includes(relationship.relationshipType)
        ? await trustFamilySuggestions(relationship.personId, relationship.entityId)
        : [];
    res.status(201).json({ ...relationship, familySuggestions });
  })
);

peopleRouter.delete(
  "/relationships/:id",
  asyncHandler(async (req, res) => {
    await prisma.personEntityRelationship.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Family links between people (partner, parent/child).
// ---------------------------------------------------------------------------

const familyInput = z.object({
  personId: z.string(),
  relatedPersonId: z.string(),
  // Read as "relatedPerson is my …": PARTNER, CHILD or PARENT.
  relation: z.enum(["PARTNER", "CHILD", "PARENT"]),
});

peopleRouter.post(
  "/family",
  asyncHandler(async (req, res) => {
    const { personId, relatedPersonId, relation } = familyInput.parse(req.body);
    if (personId === relatedPersonId) throw new HttpError(400, "A person can't be related to themselves.");
    // Stored one way: PARENT always points from parent to child; a
    // partnership is stored once, whichever side it was added from.
    const [fromPersonId, toPersonId, relationshipType] =
      relation === "PARTNER"
        ? [personId, relatedPersonId, "PARTNER"]
        : relation === "CHILD"
          ? [personId, relatedPersonId, "PARENT"]
          : [relatedPersonId, personId, "PARENT"];
    const existing = await prisma.personRelationship.findFirst({
      where: {
        relationshipType,
        OR: [
          { fromPersonId, toPersonId },
          ...(relationshipType === "PARTNER" ? [{ fromPersonId: toPersonId, toPersonId: fromPersonId }] : []),
        ],
      },
    });
    if (existing) throw new HttpError(409, "That family link is already recorded.");
    const link = await prisma.personRelationship.create({ data: { fromPersonId, toPersonId, relationshipType } });
    await logAudit("FAMILY_LINK_CREATED", { targetType: "PersonRelationship", targetId: link.id, data: { relationshipType } });
    res.status(201).json(link);
  })
);

peopleRouter.delete(
  "/family/:id",
  asyncHandler(async (req, res) => {
    await prisma.personRelationship.delete({ where: { id: req.params.id } });
    await logAudit("FAMILY_LINK_DELETED", { targetType: "PersonRelationship", targetId: req.params.id });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Pay period tracking (Document Packs spec) — expected periods are generated
// from Person.payFrequency + a financial year's date range, then diffed
// against stored PayPeriodEntry rows. A period with no row is only ever
// flagged MISSING once it's already in the past; a period that hasn't
// happened yet is PENDING so it's never wrongly reported as missed.
// ---------------------------------------------------------------------------

function generateExpectedPeriods(frequency: string, fyStart: Date, fyEnd: Date): { periodStart: Date; periodEnd: Date }[] {
  const periods: { periodStart: Date; periodEnd: Date }[] = [];

  if (frequency === "WEEKLY" || frequency === "FORTNIGHTLY") {
    const stepDays = frequency === "WEEKLY" ? 7 : 14;
    let start = new Date(fyStart);
    while (start <= fyEnd) {
      const end = new Date(start);
      end.setDate(end.getDate() + stepDays - 1);
      periods.push({ periodStart: new Date(start), periodEnd: end });
      start = new Date(start);
      start.setDate(start.getDate() + stepDays);
    }
  } else if (frequency === "MONTHLY") {
    let cursor = new Date(fyStart.getFullYear(), fyStart.getMonth(), 1);
    while (cursor <= fyEnd) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      periods.push({ periodStart: new Date(cursor), periodEnd: monthEnd });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return periods;
}

peopleRouter.get(
  "/:id/pay-periods",
  asyncHandler(async (req, res) => {
    const financialYearId = req.query.financialYearId as string | undefined;
    if (!financialYearId) {
      res.status(400).json({ error: "financialYearId query param is required" });
      return;
    }
    const person = await prisma.person.findUnique({ where: { id: req.params.id } });
    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    const financialYear = await prisma.financialYear.findUnique({ where: { id: financialYearId } });
    if (!financialYear) {
      res.status(404).json({ error: "Financial year not found" });
      return;
    }
    if (!person.payFrequency) {
      res.json({ payFrequency: null, periods: [] });
      return;
    }

    const expected = generateExpectedPeriods(person.payFrequency, financialYear.startDate, financialYear.endDate);
    const entries = await prisma.payPeriodEntry.findMany({
      where: {
        personId: person.id,
        periodStart: { gte: financialYear.startDate, lte: financialYear.endDate },
      },
      include: { document: true },
    });
    const entryByStart = new Map(entries.map((e) => [e.periodStart.toISOString(), e]));
    const now = new Date();

    const periods = expected.map(({ periodStart, periodEnd }) => {
      const entry = entryByStart.get(periodStart.toISOString());
      let status: "LOGGED" | "NON_WORKING" | "MISSING" | "PENDING";
      if (entry) status = entry.status as "LOGGED" | "NON_WORKING";
      else if (periodEnd < now) status = "MISSING";
      else status = "PENDING";
      return { periodStart, periodEnd, status, entry: entry ?? null };
    });

    res.json({ payFrequency: person.payFrequency, periods });
  })
);

const payPeriodInput = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  status: z.enum(["LOGGED", "NON_WORKING"]),
  documentId: z.string().optional().nullable(),
  amount: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

peopleRouter.put(
  "/:id/pay-periods",
  asyncHandler(async (req, res) => {
    const parsed = payPeriodInput.parse(req.body);
    const periodStart = new Date(parsed.periodStart);
    const entry = await prisma.payPeriodEntry.upsert({
      where: { personId_periodStart: { personId: req.params.id, periodStart } },
      create: {
        personId: req.params.id,
        periodStart,
        periodEnd: new Date(parsed.periodEnd),
        status: parsed.status,
        documentId: parsed.documentId ?? null,
        amount: parsed.amount ?? null,
        notes: parsed.notes ?? null,
      },
      update: {
        status: parsed.status,
        documentId: parsed.documentId ?? null,
        amount: parsed.amount ?? null,
        notes: parsed.notes ?? null,
      },
      include: { document: true },
    });
    await logAudit("PAY_PERIOD_LOGGED", { targetType: "PayPeriodEntry", targetId: entry.id, data: { status: entry.status } });
    res.json(entry);
  })
);

peopleRouter.delete(
  "/pay-periods/:entryId",
  asyncHandler(async (req, res) => {
    await prisma.payPeriodEntry.delete({ where: { id: req.params.entryId } });
    res.status(204).send();
  })
);
