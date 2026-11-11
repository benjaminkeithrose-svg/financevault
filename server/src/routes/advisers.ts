import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";

/**
 * The professional advisers around the family — accountant, solicitor, real
 * estate agent, financial adviser — one list, not tied to a person or
 * entity, since the same accountant usually looks after everyone. Reused
 * whenever a broker or accountant asks who else to contact.
 */
export const advisersRouter = Router();

export const ADVISER_KINDS: Record<string, string> = {
  ACCOUNTANT: "Accountant",
  SOLICITOR: "Solicitor",
  REAL_ESTATE_AGENT: "Real estate agent",
  FINANCIAL_ADVISER: "Financial adviser",
  OTHER: "Other adviser",
};

const input = z.object({
  kind: z.enum(Object.keys(ADVISER_KINDS) as [string, ...string[]]),
  firm: z.string().optional().nullable(),
  contactFirstName: z.string().optional().nullable(),
  contactSurname: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

advisersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const advisers = await prisma.adviser.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
    res.json(advisers);
  })
);

advisersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = input.parse(req.body);
    const adviser = await prisma.adviser.create({ data: parsed });
    await logAudit("ADVISER_CREATED", { targetType: "Adviser", targetId: adviser.id, data: { kind: adviser.kind } });
    res.status(201).json(adviser);
  })
);

advisersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = input.partial().parse(req.body);
    const existing = await prisma.adviser.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Adviser not found");
    const adviser = await prisma.adviser.update({ where: { id: req.params.id }, data: parsed });
    await logAudit("ADVISER_CHANGED", { targetType: "Adviser", targetId: adviser.id });
    res.json(adviser);
  })
);

advisersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.adviser.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Adviser not found");
    await prisma.adviser.delete({ where: { id: req.params.id } });
    await logAudit("ADVISER_DELETED", { targetType: "Adviser", targetId: req.params.id });
    res.status(204).send();
  })
);
