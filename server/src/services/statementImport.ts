import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "./audit.js";
import { ensureFinancialYear, ingestDocument } from "./documentIngest.js";
import { readDocumentFile } from "./documentFiles.js";
import { decryptField } from "./fieldCrypto.js";
import { financialYearLabelForDate } from "./financialYear.js";
import { sha256 } from "./hash.js";
import { recordLayout } from "./layoutRecords.js";
import { readStatement, type StatementReading } from "./pdfStatement.js";

/**
 * Bringing in transactions from PDF statements, on a bank account's page.
 *
 * Read first, write later: the statements are read and checked, and the
 * person sees each one — its dates, how many transactions, whether it adds
 * up — before anything is saved. Then the ticked ones are filed as documents
 * against the account and their transactions added.
 *
 * Statements overlap, and the same months may already have come in from the
 * bank's CSV (with the description worded differently), so a transaction
 * already on the account on the same day for the same amount isn't added
 * again. Two identical coffees on one statement are still two: a statement
 * is only compared with what was there before it.
 */

interface BatchFile {
  key: string;
  filename: string;
  buffer: Buffer | null;
  documentId: string | null;
  reading: StatementReading;
}
interface Batch {
  id: string;
  accountId: string;
  createdAt: number;
  files: BatchFile[];
}

const batches = new Map<string, Batch>();
const HOUR = 60 * 60 * 1000;

function tidy() {
  for (const [id, b] of batches) if (Date.now() - b.createdAt > HOUR) batches.delete(id);
  while (batches.size > 4) batches.delete(batches.keys().next().value!);
}

const dayKey = (d: Date, amount: number) => `${d.toISOString().slice(0, 10)}|${Math.round(amount * 100)}`;
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function accountOf(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new HttpError(404, "Account not found");
  let ending: string | null = null;
  try {
    // Account numbers are only ever fetched by name (db.ts).
    const secret = await prisma.account.findUnique({ where: { id: accountId }, select: { accountNumber: true } });
    const n = decryptField(secret?.accountNumber)?.replace(/\D/g, "");
    ending = n && n.length >= 4 ? n.slice(-4) : null;
  } catch {
    ending = null;
  }
  return { account, ending };
}

/** Counts of the account's transactions by day and amount, between two dates. */
async function existingCounts(accountId: string, from: Date, to: Date) {
  const rows = await prisma.transaction.findMany({
    where: { accountId, date: { gte: from, lte: to } },
    select: { date: true, amount: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(dayKey(r.date, r.amount), (counts.get(dayKey(r.date, r.amount)) ?? 0) + 1);
  return counts;
}

const byPeriod = (a: BatchFile, b: BatchFile) => (a.reading.period?.from.getTime() ?? 0) - (b.reading.period?.from.getTime() ?? 0);

/** Which of each statement's transactions are new, statement by statement in date order. */
async function plan(accountId: string, files: BatchFile[]) {
  const dates = files.flatMap((f) => f.reading.transactions.map((t) => t.date.getTime()));
  const counts = dates.length
    ? await existingCounts(accountId, new Date(Math.min(...dates)), new Date(Math.max(...dates)))
    : new Map<string, number>();
  const result = new Map<string, boolean[]>();
  for (const f of [...files].sort(byPeriod)) {
    const added = new Map<string, number>();
    const fresh = f.reading.transactions.map((t) => {
      const k = dayKey(t.date, t.amount);
      const left = counts.get(k) ?? 0;
      if (left > 0) {
        counts.set(k, left - 1);
        return false;
      }
      added.set(k, (added.get(k) ?? 0) + 1);
      return true;
    });
    for (const [k, n] of added) counts.set(k, (counts.get(k) ?? 0) + n);
    result.set(f.key, fresh);
  }
  return result;
}

function summary(f: BatchFile, fresh: boolean[], ending: string | null, alreadyRead: boolean) {
  const r = f.reading;
  const otherAccount = !!ending && r.accountEndings.length > 0 && !r.accountEndings.includes(ending);
  return {
    key: f.key,
    filename: f.filename,
    documentId: f.documentId,
    bank: r.bank,
    status: r.status,
    message: r.message,
    period: r.period ? { from: r.period.from.toISOString(), to: r.period.to.toISOString() } : null,
    openingBalance: r.openingBalance,
    closingBalance: r.closingBalance,
    count: r.transactions.length,
    moneyIn: Math.round(r.transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) * 100) / 100,
    moneyOut: Math.round(r.transactions.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0) * 100) / 100,
    newCount: fresh.filter(Boolean).length,
    duplicates: fresh.filter((x) => !x).length,
    otherAccount,
    alreadyRead,
    problems: r.problems
      .filter((p) => p.kind !== "UNREAD_LINE")
      .slice(0, 5)
      .map((p) => ({ page: p.page, line: p.line, detail: p.detail ?? null })),
    unreadLines: r.problems.filter((p) => p.kind === "UNREAD_LINE").length,
    transactions: r.transactions.map((t, i) => ({
      date: t.date.toISOString(),
      description: t.description,
      amount: t.amount,
      balance: t.balance,
      isNew: fresh[i],
    })),
    suggested: r.status === "ADDS_UP" && !otherAccount && fresh.some(Boolean),
  };
}

/** Gaps between one statement and the next: a missing statement, or one from another account. */
function continuity(files: BatchFile[]) {
  const sorted = files.filter((f) => f.reading.period && f.reading.status !== "NOT_READ").sort(byPeriod);
  const warnings: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1].reading;
    const b = sorted[i].reading;
    if (a.balanceSense !== b.balanceSense) continue;
    const gapDays = (b.period!.from.getTime() - a.period!.to.getTime()) / 86_400_000;
    if (gapDays > 4) warnings.push(`Nothing between ${day(a.period!.to)} and ${day(b.period!.from)} — a statement may be missing.`);
    else if (a.closingBalance !== null && b.openingBalance !== null && !near(a.closingBalance, b.openingBalance))
      warnings.push(
        `${sorted[i - 1].filename} closes at ${money(a.closingBalance)} but ${sorted[i].filename} opens at ${money(b.openingBalance)} — a statement may be missing, or one is for another account.`,
      );
  }
  return warnings;
}

async function respond(batch: Batch) {
  const { ending } = await accountOf(batch.accountId);
  const fresh = await plan(batch.accountId, batch.files);
  const readDocs = new Set(
    (
      await prisma.transaction.findMany({
        where: { accountId: batch.accountId, documentId: { in: batch.files.map((f) => f.documentId).filter((x): x is string => !!x) } },
        select: { documentId: true },
        distinct: ["documentId"],
      })
    ).map((t) => t.documentId),
  );
  return {
    batchId: batch.id,
    statements: [...batch.files]
      .sort(byPeriod)
      .map((f) => summary(f, fresh.get(f.key)!, ending, !!f.documentId && readDocs.has(f.documentId))),
    warnings: continuity(batch.files),
  };
}

async function newBatch(accountId: string, sources: Array<{ filename: string; buffer: Buffer; documentId: string | null }>) {
  tidy();
  const { account } = await accountOf(accountId);
  const files: BatchFile[] = [];
  for (const s of sources) {
    let reading: StatementReading;
    try {
      reading = readStatement(s.buffer, { accountType: account.accountType });
    } catch {
      reading = {
        bank: null,
        scanned: false,
        pageCount: 0,
        period: null,
        openingBalance: null,
        closingBalance: null,
        transactions: [],
        status: "NOT_READ",
        message: "This file couldn't be opened as a PDF.",
        problems: [],
        balanceSense: null,
        accountEndings: [],
        layout: null as never,
      };
    }
    if (reading.layout) await recordLayout({ buffer: s.buffer, mimeType: "application/pdf", kind: "Bank Statement", reading });
    // An uploaded file already in Documents uses that document (it isn't stored twice).
    let documentId = s.documentId;
    if (!documentId)
      documentId = (await prisma.document.findFirst({ where: { fileHash: sha256(s.buffer) }, select: { id: true } }))?.id ?? null;
    files.push({ key: randomUUID(), filename: s.filename, buffer: s.documentId ? null : s.buffer, documentId, reading });
  }
  const batch: Batch = { id: randomUUID(), accountId, createdAt: Date.now(), files };
  batches.set(batch.id, batch);
  return respond(batch);
}

export async function readUploadedStatements(accountId: string, files: Array<{ originalname: string; buffer: Buffer }>) {
  if (!files.length) throw new HttpError(400, "Choose one or more PDF statements.");
  return newBatch(
    accountId,
    files.map((f) => ({ filename: f.originalname, buffer: f.buffer, documentId: null })),
  );
}

export async function readFiledStatements(accountId: string, documentIds: string[]) {
  const docs = await prisma.document.findMany({ where: { id: { in: documentIds }, mimeType: "application/pdf" } });
  if (!docs.length) throw new HttpError(400, "Choose one or more PDF statements.");
  const sources = [];
  for (const d of docs) sources.push({ filename: d.originalFilename, buffer: await readDocumentFile(d.filePath), documentId: d.id });
  return newBatch(accountId, sources);
}

/** PDF bank statements in Documents: ones filed under this account first, then any not filed under an account. */
export async function filedStatements(accountId: string) {
  const linked = await prisma.documentLink.findMany({
    where: { targetType: "ACCOUNT", targetId: accountId },
    select: { documentId: true },
  });
  const linkedIds = new Set(linked.map((l) => l.documentId));
  const docs = await prisma.document.findMany({
    where: { mimeType: "application/pdf", OR: [{ id: { in: [...linkedIds] } }, { documentType: { in: ["Bank Statement"] } }] },
    include: { links: { where: { targetType: "ACCOUNT" }, select: { targetId: true } } },
    orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
    take: 1000,
  });
  const read = new Set(
    (
      await prisma.transaction.findMany({
        where: { accountId, documentId: { in: docs.map((d) => d.id) } },
        select: { documentId: true },
        distinct: ["documentId"],
      })
    ).map((t) => t.documentId),
  );
  return docs
    .filter((d) => linkedIds.has(d.id) || d.links.length === 0)
    .map((d) => ({
      id: d.id,
      name: d.originalFilename,
      date: d.documentDate?.toISOString() ?? null,
      filedHere: linkedIds.has(d.id),
      alreadyRead: read.has(d.id),
    }));
}

export async function commitStatements(batchId: string, keys: string[]) {
  const batch = batches.get(batchId);
  if (!batch) throw new HttpError(410, "That reading has expired — choose the statements again.");
  const { account } = await accountOf(batch.accountId);
  const chosen = batch.files.filter((f) => keys.includes(f.key) && f.reading.transactions.length);
  const fresh = await plan(batch.accountId, chosen);
  const fyIds = new Map<string, string>();
  let imported = 0;
  let duplicates = 0;
  let statements = 0;
  for (const f of [...chosen].sort(byPeriod)) {
    let documentId = f.documentId;
    if (!documentId && f.buffer) {
      const ingested = await ingestDocument({
        buffer: f.buffer,
        originalFilename: f.filename,
        mimeType: "application/pdf",
        fileSize: f.buffer.length,
        source: "STATEMENT_IMPORT",
        suggestedDocumentType: "Bank Statement",
        suggestedEntityId: account.entityId,
      });
      documentId = ingested.document!.id;
      // It came in as a statement on this account, whatever its transactions mention ("health insurance"…).
      if (!ingested.duplicate && ingested.document!.documentType !== "Bank Statement")
        await prisma.document.update({ where: { id: documentId }, data: { documentType: "Bank Statement", renewalDate: null } });
    }
    if (documentId && !(await prisma.documentLink.findFirst({ where: { documentId, targetType: "ACCOUNT", targetId: account.id } }))) {
      await prisma.documentLink.create({ data: { documentId, targetType: "ACCOUNT", targetId: account.id } });
    }
    const isNew = fresh.get(f.key)!;
    for (const [i, t] of f.reading.transactions.entries()) {
      if (!isNew[i]) {
        duplicates++;
        continue;
      }
      const label = financialYearLabelForDate(t.date);
      let fyId = fyIds.get(label);
      if (!fyId) {
        fyId = (await ensureFinancialYear(label))!;
        fyIds.set(label, fyId);
      }
      await prisma.transaction.create({
        data: {
          accountId: account.id,
          date: t.date,
          description: t.description || "(no description)",
          amount: t.amount,
          entityId: account.entityId,
          financialYearId: fyId,
          documentId,
          status: "UNREVIEWED",
        },
      });
      imported++;
    }
    statements++;
  }
  batches.delete(batchId);
  await logAudit("STATEMENTS_IMPORTED", { targetType: "Account", targetId: account.id, data: { statements, imported, duplicates } });
  return { statements, imported, duplicates };
}
