import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { financialYearBounds, financialYearLabelForDate } from "../services/financialYear.js";
import { convertRows, inspectCsv, type ColumnMapping } from "../services/bankCsv.js";

export const transactionImportRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function ensureFinancialYear(date: Date) {
  const label = financialYearLabelForDate(date);
  const { start, end } = financialYearBounds(label);
  const fy = await prisma.financialYear.upsert({
    where: { label },
    update: {},
    create: { label, startDate: start, endDate: end },
  });
  return fy.id;
}

/**
 * Reads the file and proposes a column mapping without writing anything —
 * the user confirms the mapping before any transaction is created.
 */
transactionImportRouter.post(
  "/inspect",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    try {
      res.json(inspectCsv(req.file.buffer.toString("utf8")));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  })
);

const mappingSchema = z.object({
  dateColumn: z.number().int().min(0),
  descriptionColumn: z.number().int().min(0),
  amountColumn: z.number().int().min(0).nullable().optional(),
  debitColumn: z.number().int().min(0).nullable().optional(),
  creditColumn: z.number().int().min(0).nullable().optional(),
  dateFormat: z.enum(["DMY", "MDY", "YMD"]),
  hasHeaderRow: z.boolean(),
  invertSign: z.boolean().optional(),
});

/**
 * Re-exporting an overlapping date range is the normal way people use bank
 * exports, so the same transaction arriving twice has to be expected rather
 * than treated as an error. Matching on account + date + amount + description
 * is what distinguishes a genuine repeat purchase from a re-import: a real
 * duplicate pair shares all four, and so is indistinguishable anyway.
 */
async function findExistingKeys(accountId: string, dates: Date[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const times = dates.map((d) => d.getTime());
  const existing = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) },
    },
    select: { date: true, amount: true, description: true },
  });
  return new Set(existing.map((t) => `${t.date.getTime()}|${t.amount}|${t.description}`));
}

const previewInput = z.object({ mapping: mappingSchema, accountId: z.string() });

transactionImportRouter.post(
  "/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const parsed = previewInput.parse({
      mapping: JSON.parse(String(req.body.mapping)),
      accountId: String(req.body.accountId),
    });

    const { rows, skipped } = convertRows(req.file.buffer.toString("utf8"), parsed.mapping as ColumnMapping);
    const existingKeys = await findExistingKeys(parsed.accountId, rows.map((r) => r.date));

    let duplicates = 0;
    const preview = rows.slice(0, 10).map((r) => ({
      date: r.date.toISOString(),
      description: r.description,
      amount: r.amount,
      duplicate: existingKeys.has(`${r.date.getTime()}|${r.amount}|${r.description}`),
    }));
    for (const r of rows) {
      if (existingKeys.has(`${r.date.getTime()}|${r.amount}|${r.description}`)) duplicates += 1;
    }

    const dates = rows.map((r) => r.date.getTime());
    res.json({
      totalParsed: rows.length,
      duplicates,
      willImport: rows.length - duplicates,
      skipped,
      preview,
      dateRange:
        dates.length > 0
          ? { from: new Date(Math.min(...dates)).toISOString(), to: new Date(Math.max(...dates)).toISOString() }
          : null,
    });
  })
);

transactionImportRouter.post(
  "/commit",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const parsed = previewInput.parse({
      mapping: JSON.parse(String(req.body.mapping)),
      accountId: String(req.body.accountId),
    });

    const account = await prisma.account.findUnique({ where: { id: parsed.accountId } });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const { rows, skipped } = convertRows(req.file.buffer.toString("utf8"), parsed.mapping as ColumnMapping);
    const existingKeys = await findExistingKeys(parsed.accountId, rows.map((r) => r.date));

    const financialYearIds = new Map<string, string>();
    let imported = 0;
    let duplicates = 0;

    for (const row of rows) {
      const key = `${row.date.getTime()}|${row.amount}|${row.description}`;
      if (existingKeys.has(key)) {
        duplicates += 1;
        continue;
      }
      // Guards against a duplicate appearing twice within the same file.
      existingKeys.add(key);

      const label = financialYearLabelForDate(row.date);
      let financialYearId = financialYearIds.get(label);
      if (!financialYearId) {
        financialYearId = await ensureFinancialYear(row.date);
        financialYearIds.set(label, financialYearId);
      }

      await prisma.transaction.create({
        data: {
          accountId: parsed.accountId,
          date: row.date,
          description: row.description,
          amount: row.amount,
          entityId: account.entityId,
          financialYearId,
          status: "UNREVIEWED",
        },
      });
      imported += 1;
    }

    await logAudit("TRANSACTIONS_IMPORTED", {
      targetType: "Account",
      targetId: parsed.accountId,
      data: { imported, duplicates, skipped: skipped.length },
    });

    res.json({ imported, duplicates, skipped: skipped.length });
  })
);
