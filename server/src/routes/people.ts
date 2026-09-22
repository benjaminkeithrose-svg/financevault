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
