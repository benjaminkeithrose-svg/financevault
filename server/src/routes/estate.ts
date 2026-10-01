import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { deleteWithLinks } from "../services/deletion.js";

/**
 * Wills and estate papers for each person: will, powers of attorney,
 * guardianship, advance care directive, and super death benefit
 * nominations. Where the original is kept, when it was signed, and when it
 * needs looking at again — lapsing nominations usually last three years.
 */
export const estateRouter = Router();

export const ESTATE_KINDS: Record<string, string> = {
  WILL: "Will",
  ENDURING_POA: "Enduring power of attorney",
  GENERAL_POA: "General power of attorney",
  GUARDIANSHIP: "Enduring guardianship",
  ADVANCE_CARE: "Advance care directive",
  BDBN_LAPSING: "Binding death benefit nomination (lapsing)",
  BDBN_NON_LAPSING: "Binding death benefit nomination (non-lapsing)",
  REVERSIONARY: "Reversionary pension nomination",
  OTHER: "Other estate paper",
};

const input = z.object({
  personId: z.string(),
  kind: z.enum(Object.keys(ESTATE_KINDS) as [string, ...string[]]),
  signedDate: z.string().datetime().nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
  reviewDate: z.string().datetime().nullable().optional(),
  heldBy: z.string().nullable().optional(),
  fundEntityId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

function data(parsed: Partial<z.infer<typeof input>>) {
  const signed = date(parsed.signedDate);
  // A lapsing nomination lasts three years from signing unless a date is given.
  const expiry =
    parsed.expiryDate === undefined && parsed.kind === "BDBN_LAPSING" && signed
      ? new Date(Date.UTC(signed.getUTCFullYear() + 3, signed.getUTCMonth(), signed.getUTCDate()))
      : date(parsed.expiryDate);
  return { ...parsed, signedDate: signed, expiryDate: expiry, reviewDate: date(parsed.reviewDate) };
}

const include = { fund: { select: { id: true, name: true } } };

estateRouter.get(
  "/person/:personId",
  asyncHandler(async (req, res) => {
    const docs = await prisma.estateDocument.findMany({ where: { personId: req.params.personId }, include, orderBy: { createdAt: "asc" } });
    const links = await prisma.documentLink.groupBy({
      by: ["targetId"],
      where: { targetType: "ESTATE_DOCUMENT", targetId: { in: docs.map((d) => d.id) } },
      _count: { _all: true },
    });
    const counts = new Map(links.map((l) => [l.targetId, l._count._all]));
    res.json(docs.map((d) => ({ ...d, documentCount: counts.get(d.id) ?? 0 })));
  })
);

estateRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = input.parse(req.body);
    const doc = await prisma.estateDocument.create({ data: data(parsed) as never, include });
    await logAudit("ESTATE_DOCUMENT_CREATED", { targetType: "EstateDocument", targetId: doc.id, data: { kind: doc.kind } });
    res.status(201).json(doc);
  })
);

estateRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = input.omit({ personId: true }).partial().parse(req.body);
    const existing = await prisma.estateDocument.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Not found");
    const doc = await prisma.estateDocument.update({ where: { id: req.params.id }, data: data({ kind: existing.kind, ...parsed }), include });
    res.json(doc);
  })
);

estateRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "ESTATE_DOCUMENT", id: req.params.id }], (tx) => tx.estateDocument.delete({ where: { id: req.params.id } }));
    await logAudit("ESTATE_DOCUMENT_DELETED", { targetType: "EstateDocument", targetId: req.params.id });
    res.status(204).send();
  })
);
