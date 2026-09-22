import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";

export const peopleRouter = Router();

peopleRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const people = await prisma.person.findMany({
      orderBy: { name: "asc" },
      include: { entityRelationships: { include: { entity: true } } },
    });
    res.json(people);
  })
);

peopleRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findUnique({
      where: { id: req.params.id },
      include: { entityRelationships: { include: { entity: true } } },
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
    res.json({ ...person, documents: links.map((l) => l.document) });
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
    const person = await prisma.person.create({ data: personData(parsed) });
    await logAudit("PERSON_CREATED", { targetType: "Person", targetId: person.id, data: { name: person.name } });
    res.status(201).json(person);
  })
);

peopleRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = personInput.partial().parse(req.body);
    const person = await prisma.person.update({ where: { id: req.params.id }, data: personData(parsed) });
    await logAudit("PERSON_CHANGED", { targetType: "Person", targetId: person.id, data: parsed });
    res.json(person);
  })
);

peopleRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.person.delete({ where: { id: req.params.id } });
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
    res.status(201).json(relationship);
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
