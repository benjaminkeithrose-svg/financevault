import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { deleteWithLinks } from "../services/deletion.js";
import { decryptField } from "../services/fieldCrypto.js";

/**
 * A person's ID and cover: private health insurance, Medicare card, driver's
 * licence, passport and the like. Numbers are stored encrypted and shown
 * masked — the full number only on an explicit, audited reveal — the same
 * way tax file numbers are handled.
 */
export const identityRouter = Router();

export const IDENTITY_KINDS = [
  "PRIVATE_HEALTH",
  "MEDICARE",
  "DRIVERS_LICENCE",
  "PASSPORT",
  "BIRTH_CERTIFICATE",
  "CITIZENSHIP",
  "PROOF_OF_AGE",
  "OTHER",
] as const;

/** "1234 56789 1" -> "•••• 91": enough to tell cards apart, not enough to use one. */
export function maskNumber(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  return compact.length <= 3 ? "•••" : `•••• ${compact.slice(-3)}`;
}

async function withMasks<T extends { id: string }>(records: T[]) {
  // Numbers are omitted from queries by default, so they're read separately.
  const secrets = await prisma.identityRecord.findMany({
    where: { id: { in: records.map((r) => r.id) } },
    select: { id: true, number: true, referenceNumber: true },
  });
  const byId = new Map(secrets.map((s) => [s.id, s]));
  return records.map((r) => {
    const secret = byId.get(r.id);
    return {
      ...r,
      numberMasked: maskNumber(decryptField(secret?.number)),
      referenceMasked: maskNumber(decryptField(secret?.referenceNumber)),
    };
  });
}

identityRouter.get(
  "/person/:personId",
  asyncHandler(async (req, res) => {
    const records = await prisma.identityRecord.findMany({
      where: { personId: req.params.personId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    const links = await prisma.documentLink.groupBy({
      by: ["targetId"],
      where: { targetType: "IDENTITY_RECORD", targetId: { in: records.map((r) => r.id) } },
      _count: { _all: true },
    });
    const docCounts = new Map(links.map((l) => [l.targetId, l._count._all]));
    res.json((await withMasks(records)).map((r) => ({ ...r, documentCount: docCounts.get(r.id) ?? 0 })));
  })
);

const recordInput = z.object({
  personId: z.string(),
  kind: z.enum(IDENTITY_KINDS),
  label: z.string().optional().nullable(),
  issuer: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  issueDate: z.string().datetime().optional().nullable(),
  expiryDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function recordData(parsed: Partial<z.infer<typeof recordInput>>) {
  const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);
  return {
    ...parsed,
    number: blankToNull(parsed.number),
    referenceNumber: blankToNull(parsed.referenceNumber),
    issueDate: parsed.issueDate === undefined ? undefined : parsed.issueDate ? new Date(parsed.issueDate) : null,
    expiryDate: parsed.expiryDate === undefined ? undefined : parsed.expiryDate ? new Date(parsed.expiryDate) : null,
  };
}

identityRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = recordInput.parse(req.body);
    const record = await prisma.identityRecord.create({ data: recordData(parsed) as z.infer<typeof recordInput> });
    await logAudit("IDENTITY_RECORD_CREATED", { targetType: "IdentityRecord", targetId: record.id, data: { kind: record.kind } });
    res.status(201).json((await withMasks([record]))[0]);
  })
);

identityRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = recordInput.omit({ personId: true }).partial().parse(req.body);
    const record = await prisma.identityRecord.update({ where: { id: req.params.id }, data: recordData(parsed) });
    // Which fields changed is recorded; the numbers themselves never are.
    await logAudit("IDENTITY_RECORD_CHANGED", {
      targetType: "IdentityRecord",
      targetId: record.id,
      data: { fields: Object.keys(parsed) },
    });
    res.json((await withMasks([record]))[0]);
  })
);

/** The full numbers, on explicit request only — every reveal is audited. */
identityRouter.get(
  "/:id/reveal",
  asyncHandler(async (req, res) => {
    const record = await prisma.identityRecord.findUnique({
      where: { id: req.params.id },
      select: { id: true, number: true, referenceNumber: true },
    });
    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    await logAudit("IDENTITY_NUMBER_REVEALED", { targetType: "IdentityRecord", targetId: record.id });
    res.json({ number: decryptField(record.number), referenceNumber: decryptField(record.referenceNumber) });
  })
);

identityRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "IDENTITY_RECORD", id: req.params.id }], (tx) =>
      tx.identityRecord.delete({ where: { id: req.params.id } })
    );
    await logAudit("IDENTITY_RECORD_DELETED", { targetType: "IdentityRecord", targetId: req.params.id });
    res.status(204).send();
  })
);
