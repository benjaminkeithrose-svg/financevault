import { Router } from "express";
import { ZipArchive, ArchiverError } from "archiver";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { readDocumentFile } from "../services/documentFiles.js";
import { purposeSplit } from "../services/debtAllocation.js";
import { fyRange } from "../services/superRules.js";

/**
 * "Why is this claimed?" (IDEAS.md idea 12). Behind a small icon next to a
 * claim: the reason, the rule (a Tax reference document and the paragraph),
 * the evidence, and the accountant's view — plus an export of all of it in
 * one file for the accountant or the ATO. Nothing shows day to day.
 */
export const claimNotesRouter = Router();

const TARGET_TYPES = ["LOAN_PURPOSE", "LOAN_INTEREST_YEAR", "WORK_DEDUCTION"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the claim is, in words, and the documents that back it up. */
async function describeTarget(targetType: TargetType, targetId: string): Promise<{ title: string; lines: string[]; evidenceIds: string[] }> {
  if (targetType === "LOAN_PURPOSE") {
    const p = await prisma.loanPurpose.findUnique({ where: { id: targetId }, include: { liability: true, asset: { select: { name: true } } } });
    if (!p) throw new HttpError(404, "That loan use no longer exists");
    return {
      title: `${p.liability.name}: ${p.description}`,
      lines: [
        `Loan: ${p.liability.name}${p.liability.lender ? ` (${p.liability.lender})` : ""}`,
        `Used for: ${p.description}${p.asset ? ` — ${p.asset.name}` : ""}`,
        `Amount: ${money(p.amount)}${p.date ? ` on ${p.date.toISOString().slice(0, 10)}` : ""}`,
        `Interest on it is ${p.deductible ? "claimed as deductible" : "not claimed (private)"}.`,
      ],
      evidenceIds: p.documentId ? [p.documentId] : [],
    };
  }
  if (targetType === "WORK_DEDUCTION") {
    const d = await prisma.workDeduction.findUnique({ where: { id: targetId }, include: { person: { select: { name: true, occupation: true } } } });
    if (!d) throw new HttpError(404, "That claim no longer exists");
    return {
      title: `${d.person.name}: ${d.description} (${d.fyLabel})`,
      lines: [
        `Work-related deduction for ${d.person.name}${d.person.occupation ? `, ${d.person.occupation}` : ""}, ${d.fyLabel}`,
        `${d.description}: ${money(d.amount)}${d.quantity ? ` (${d.quantity.toLocaleString("en-AU")} ${d.category === "CAR" ? "km" : "hours"})` : ""}`,
      ],
      evidenceIds: d.documentId ? [d.documentId] : [],
    };
  }
  const y = await prisma.loanInterestYear.findUnique({ where: { id: targetId }, include: { liability: { include: { purposes: true } } } });
  if (!y) throw new HttpError(404, "That interest year no longer exists");
  const split = purposeSplit(y.liability.purposes, fyRange(y.fyLabel).end);
  const share = split.deductibleShare ?? 0;
  return {
    title: `${y.liability.name}: interest ${y.fyLabel}`,
    lines: [
      `Loan: ${y.liability.name}${y.liability.lender ? ` (${y.liability.lender})` : ""}`,
      `Interest charged in ${y.fyLabel}: ${money(y.interestCharged)}`,
      `Deductible share: ${(share * 100).toFixed(2)}% — ${money(split.deductible)} of ${money(split.total)} borrowed went to producing income.`,
      `Deductible interest: ${money(y.interestCharged * share)}`,
    ],
    evidenceIds: [...new Set([y.documentId, ...y.liability.purposes.map((p) => p.documentId)].filter((d): d is string => !!d))],
  };
}

const targetQuery = z.object({ targetType: z.enum(TARGET_TYPES), targetId: z.string().min(1) });

claimNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { targetType, targetId } = targetQuery.parse(req.query);
    const [target, note] = await Promise.all([
      describeTarget(targetType, targetId),
      prisma.claimNote.findUnique({
        where: { targetType_targetId: { targetType, targetId } },
        include: {
          referenceDocument: {
            select: { id: true, originalFilename: true, referenceCode: true, referenceCheckBy: true, withdrawnNote: true, supersededAt: true, referenceLinkId: true },
          },
        },
      }),
    ]);
    const evidence = await prisma.document.findMany({ where: { id: { in: target.evidenceIds } }, select: { id: true, originalFilename: true, documentType: true } });
    const history = note
      ? await prisma.auditLog.findMany({ where: { targetType: "ClaimNote", targetId: note.id }, orderBy: { timestamp: "desc" }, select: { id: true, action: true, timestamp: true } })
      : [];
    // A reference past its check-by date may have been replaced or withdrawn.
    const checkBy = note?.referenceDocument?.referenceCheckBy ?? null;
    const referenceOverdue = !!checkBy && checkBy < new Date();
    // "Check for new versions" found it withdrawn, or saved a newer copy.
    const ref = note?.referenceDocument;
    const referenceWithdrawn = ref?.withdrawnNote ?? null;
    const newerCopy =
      ref?.supersededAt && ref.referenceLinkId
        ? await prisma.document.findFirst({ where: { referenceLinkId: ref.referenceLinkId, supersededAt: null }, select: { id: true } })
        : null;
    res.json({ target, note, evidence, history, referenceOverdue, referenceWithdrawn, newerReferenceId: newerCopy?.id ?? null });
  })
);

const noteInput = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.string().min(1),
  referenceDocumentId: z.string().nullable().optional(),
  referencePinpoint: z.string().max(120).nullable().optional(),
  accountantNote: z.string().nullable().optional(),
  accountantAgreedOn: z.string().datetime().nullable().optional(),
});

claimNotesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const { targetType, targetId, ...rest } = noteInput.parse(req.body);
    await describeTarget(targetType, targetId); // the claim must exist
    const data = { ...rest, accountantAgreedOn: rest.accountantAgreedOn ? new Date(rest.accountantAgreedOn) : null };
    const existing = await prisma.claimNote.findUnique({ where: { targetType_targetId: { targetType, targetId } } });
    const note = await prisma.claimNote.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      create: { targetType, targetId, ...data },
      update: data,
    });
    await logAudit(existing ? "CLAIM_REASON_CHANGED" : "CLAIM_REASON_ADDED", { targetType: "ClaimNote", targetId: note.id, data: { ...rest } });
    res.json(note);
  })
);

claimNotesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.claimNote.delete({ where: { id: req.params.id } });
    await logAudit("CLAIM_REASON_DELETED", { targetType: "ClaimNote", targetId: req.params.id });
    res.status(204).send();
  })
);

/** "Explain this claim": the reason, the rule and the evidence in one ZIP. */
claimNotesRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const { targetType, targetId } = targetQuery.parse(req.query);
    const target = await describeTarget(targetType, targetId);
    const note = await prisma.claimNote.findUnique({
      where: { targetType_targetId: { targetType, targetId } },
      include: { referenceDocument: true },
    });
    const evidence = await prisma.document.findMany({ where: { id: { in: target.evidenceIds } } });

    const text = [
      `Why this is claimed — ${target.title}`,
      "",
      ...target.lines,
      "",
      "Reason",
      note?.reason ?? "(no reason recorded yet)",
      "",
      "The rule",
      note?.referenceDocument
        ? `${note.referenceDocument.referenceCode ?? note.referenceDocument.originalFilename}${note.referencePinpoint ? `, ${note.referencePinpoint}` : ""} — included as reference/${note.referenceDocument.originalFilename}`
        : "(no reference recorded)",
      "",
      "Accountant",
      note?.accountantNote ? `${note.accountantNote}${note.accountantAgreedOn ? ` (${note.accountantAgreedOn.toISOString().slice(0, 10)})` : ""}` : "(no note)",
      "",
      "Evidence",
      ...(evidence.length ? evidence.map((d) => `evidence/${d.originalFilename}`) : ["(none linked)"]),
      "",
      `Prepared by Financial Vault on ${new Date().toISOString().slice(0, 10)}. An organising aid, not tax advice.`,
    ].join("\n");

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="claim_${target.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}.zip"`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: ArchiverError) => {
      throw err;
    });
    archive.pipe(res);
    archive.append(text, { name: "why_this_is_claimed.txt" });
    const add = async (doc: { filePath: string; originalFilename: string }, folder: string) => {
      try {
        archive.append(await readDocumentFile(doc.filePath), { name: `${folder}/${doc.originalFilename}` });
      } catch {
        // A missing file is noted in the text, not fatal.
      }
    };
    if (note?.referenceDocument) await add(note.referenceDocument, "reference");
    for (const d of evidence) await add(d, "evidence");
    await logAudit("CLAIM_EXPLAINED", { targetType: "ClaimNote", targetId: note?.id ?? targetId });
    await archive.finalize();
  })
);
