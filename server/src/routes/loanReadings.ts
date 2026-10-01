import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { readDocumentFile } from "../services/documentFiles.js";
import { readLoanCsv, readLoanStatement } from "../services/loanStatement.js";
import { blankLayout } from "../services/layoutSample.js";
import { programVersion } from "../services/appInfo.js";

/**
 * A loan's history (its rate and balance over the years) and reading its
 * statements: propose what a statement says, then apply only what's ticked.
 */
export const loanReadingsRouter = Router();

const isCsv = (d: { mimeType: string; originalFilename: string }) => /csv/i.test(d.mimeType) || /\.csv$/i.test(d.originalFilename);

async function loanOr404(id: string) {
  const loan = await prisma.liability.findUnique({ where: { id } });
  if (!loan) throw new HttpError(404, "Loan not found");
  return loan;
}

/** The loan's readings, oldest first, with today's figures on the loan as the last point. */
loanReadingsRouter.get(
  "/:id/readings",
  asyncHandler(async (req, res) => {
    const loan = await loanOr404(req.params.id);
    const readings = await prisma.loanReading.findMany({
      where: { liabilityId: loan.id },
      orderBy: [{ asAt: "asc" }, { createdAt: "asc" }],
      include: { document: { select: { id: true, originalFilename: true } } },
    });
    const years = await prisma.loanInterestYear.findMany({ where: { liabilityId: loan.id }, orderBy: { fyLabel: "asc" } });
    res.json({
      readings,
      current: {
        asAt: loan.balanceAsAt ?? loan.updatedAt,
        interestRate: loan.interestRate,
        balance: loan.currentBalance,
        repayment: loan.repaymentAmount,
        repaymentFrequency: loan.repaymentFrequency,
      },
      interestYears: years.map((y) => ({ fyLabel: y.fyLabel, interestCharged: y.interestCharged, documentId: y.documentId })),
    });
  })
);

/** A rate (and/or balance) from before, typed in — for years there's no statement for. */
loanReadingsRouter.post(
  "/:id/readings",
  asyncHandler(async (req, res) => {
    const loan = await loanOr404(req.params.id);
    const input = z
      .object({
        asAt: z.coerce.date(),
        interestRate: z.number().min(0).max(30).nullable().optional(),
        balance: z.number().min(0).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .refine((v) => v.interestRate != null || v.balance != null, "Enter a rate or a balance")
      .parse(req.body);
    const reading = await prisma.loanReading.create({
      data: { liabilityId: loan.id, asAt: input.asAt, interestRate: input.interestRate ?? null, balance: input.balance ?? null, note: input.note ?? null, source: "RECORDED" },
    });
    await logAudit("LOAN_READING_RECORDED", { targetType: "LoanReading", targetId: reading.id });
    res.status(201).json(reading);
  })
);

loanReadingsRouter.delete(
  "/readings/:readingId",
  asyncHandler(async (req, res) => {
    await prisma.loanReading.delete({ where: { id: req.params.readingId } });
    await logAudit("LOAN_READING_REMOVED", { targetType: "LoanReading", targetId: req.params.readingId });
    res.status(204).end();
  })
);

/** What a statement (PDF, photo or CSV already uploaded) says, next to what's recorded. Changes nothing. */
loanReadingsRouter.post(
  "/:id/statements/read",
  asyncHandler(async (req, res) => {
    const loan = await loanOr404(req.params.id);
    const { documentId } = z.object({ documentId: z.string() }).parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new HttpError(404, "Document not found");
    const current = {
      balance: loan.currentBalance,
      balanceAsAt: loan.balanceAsAt,
      interestRate: loan.interestRate,
      repayment: loan.repaymentAmount,
      repaymentFrequency: loan.repaymentFrequency,
    };
    const years = await prisma.loanInterestYear.findMany({ where: { liabilityId: loan.id } });
    const recordedYears = Object.fromEntries(years.map((y) => [y.fyLabel, y.interestCharged]));
    if (isCsv(doc)) {
      const text = (await readDocumentFile(doc.filePath)).toString("utf8");
      res.json({ kind: "CSV", csv: readLoanCsv(text), current, recordedYears });
      return;
    }
    if (!doc.ocrText || !doc.textExtractionEnabled) {
      throw new HttpError(400, "The app couldn't read any text from this document, so there's nothing to take from it. You can type the figures in instead.");
    }
    res.json({ kind: "STATEMENT", statement: readLoanStatement(doc.ocrText), current, recordedYears });
  })
);

const applyInput = z.object({
  documentId: z.string(),
  balance: z.object({ value: z.number().min(0), asAt: z.coerce.date() }).optional(),
  interestRate: z.object({ value: z.number().min(0).max(30), asAt: z.coerce.date() }).optional(),
  repayment: z.object({ value: z.number().min(0), frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY"]).nullable().optional() }).optional(),
  rateChanges: z.array(z.object({ date: z.coerce.date(), rate: z.number().min(0).max(30) })).max(200).optional(),
  interestYears: z.array(z.object({ fyLabel: z.string().regex(/^20\d{2}-\d{2}$/), interest: z.number().min(0) })).max(50).optional(),
});

/**
 * Applies what was ticked. The loan's own figures change only if the
 * statement is at least as recent as what's recorded — an older statement
 * goes into the history without winding the loan back.
 */
loanReadingsRouter.post(
  "/:id/statements/apply",
  asyncHandler(async (req, res) => {
    const loan = await loanOr404(req.params.id);
    const input = applyInput.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
    if (!doc) throw new HttpError(404, "Document not found");
    const source = isCsv(doc) ? "CSV" : "STATEMENT";

    const asAt = input.balance?.asAt ?? input.interestRate?.asAt ?? null;
    const newer = !!asAt && (!loan.balanceAsAt || asAt >= loan.balanceAsAt);
    const changed: string[] = [];

    await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (newer && input.balance) {
        data.currentBalance = input.balance.value;
        data.balanceAsAt = input.balance.asAt;
        changed.push("balance");
      }
      if (newer && input.interestRate) {
        data.interestRate = input.interestRate.value;
        changed.push("interest rate");
      }
      if (input.repayment && (newer || !asAt)) {
        data.repaymentAmount = input.repayment.value;
        if (input.repayment.frequency) data.repaymentFrequency = input.repayment.frequency;
        changed.push("repayment");
      }
      if (Object.keys(data).length) await tx.liability.update({ where: { id: loan.id }, data });

      if (asAt && (input.balance || input.interestRate)) {
        await tx.loanReading.create({
          data: {
            liabilityId: loan.id,
            asAt,
            balance: input.balance?.value ?? null,
            interestRate: input.interestRate?.value ?? null,
            repayment: input.repayment?.value ?? null,
            repaymentFrequency: input.repayment?.frequency ?? null,
            source,
            documentId: doc.id,
          },
        });
      }
      for (const c of input.rateChanges ?? []) {
        const exists = await tx.loanReading.findFirst({ where: { liabilityId: loan.id, asAt: c.date, interestRate: c.rate } });
        if (!exists) await tx.loanReading.create({ data: { liabilityId: loan.id, asAt: c.date, interestRate: c.rate, source: "RATE_CHANGE", documentId: doc.id } });
      }
      for (const y of input.interestYears ?? []) {
        await tx.loanInterestYear.upsert({
          where: { liabilityId_fyLabel: { liabilityId: loan.id, fyLabel: y.fyLabel } },
          create: { liabilityId: loan.id, fyLabel: y.fyLabel, interestCharged: y.interest, documentId: doc.id, notes: "From the lender's statement" },
          update: { interestCharged: y.interest, documentId: doc.id },
        });
        changed.push(`interest for ${y.fyLabel}`);
      }
      // Filed with the loan.
      const linked = await tx.documentLink.findFirst({ where: { documentId: doc.id, targetType: "LIABILITY", targetId: loan.id } });
      if (!linked) await tx.documentLink.create({ data: { documentId: doc.id, targetType: "LIABILITY", targetId: loan.id, label: "Statement" } });
      if (!doc.documentType) await tx.document.update({ where: { id: doc.id }, data: { documentType: "Loan statement" } });
    });

    await logAudit("LOAN_STATEMENT_APPLIED", { targetType: "Liability", targetId: loan.id, documentId: doc.id, data: { changed } });
    res.json({ changed, olderThanRecorded: !!asAt && !newer, recordedAsAt: loan.balanceAsAt });
  })
);

/**
 * A document's layout with every figure, date, name and address blanked
 * out — to share so the statement reader can learn a new lender's wording.
 * Mounted under /api/documents.
 */
export const layoutRouter = Router();

layoutRouter.get(
  "/:id/layout",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    const text = isCsv(doc) ? (await readDocumentFile(doc.filePath)).toString("utf8") : doc.ocrText;
    if (!text) throw new HttpError(400, "The app couldn't read any text from this document, so there's no layout to share.");
    const [people, entities, properties, commercial, accounts] = await Promise.all([
      prisma.person.findMany({ select: { name: true } }),
      prisma.entity.findMany({ select: { name: true } }),
      prisma.property.findMany({ select: { address: true } }),
      prisma.commercialProperty.findMany({ select: { name: true, address: true } }),
      prisma.account.findMany({ select: { accountName: true } }),
    ]);
    const known = [
      ...people.map((p) => p.name),
      ...entities.map((e) => e.name),
      ...properties.map((p) => p.address),
      ...commercial.flatMap((c) => [c.name, c.address ?? ""]),
      ...accounts.map((a) => a.accountName ?? ""),
    ];
    const found = isCsv(doc) ? readLoanCsv(text).found : readLoanStatement(text).found;
    const header = [
      "Financial Vault — a document's layout, with its figures blanked out",
      `App version ${programVersion()} · ${isCsv(doc) ? "CSV file" : "text read from a PDF or photo"}`,
      `The statement reader found: ${found.length ? found.join(", ") : "nothing"}`,
      "Every digit is shown as 0; names, emails and addresses the app knows are replaced. Please check nothing personal is left before sharing it.",
      "----",
    ].join("\n");
    res.json({ text: `${header}\n${blankLayout(text, known)}`, filename: `layout-${doc.originalFilename.replace(/\.[^.]+$/, "")}.txt` });
  })
);
