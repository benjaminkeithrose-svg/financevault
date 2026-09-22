import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { financialYearBounds, financialYearLabelForDate } from "../services/financialYear.js";

export const bankingRouter = Router();

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

bankingRouter.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const accounts = await prisma.account.findMany({
      where: entityId ? { entityId } : undefined,
      include: { entity: true, _count: { select: { transactions: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(accounts);
  })
);

bankingRouter.get(
  "/accounts/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        entity: true,
        transactions: { orderBy: { date: "desc" }, include: { taxCategory: true, financialYear: true } },
      },
    });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "ACCOUNT", targetId: account.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ...account, documents: links.map((l) => l.document) });
  })
);

const accountInput = z.object({
  institution: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().optional().nullable(),
  bsb: z.string().optional().nullable(),
  entityId: z.string(),
  accountType: z.string().min(1), // TRANSACTION | SAVINGS | OFFSET | CREDIT_CARD | OTHER
  currency: z.string().optional(),
  openingBalance: z.number().optional().nullable(),
  currentBalance: z.number().optional().nullable(),
});

bankingRouter.post(
  "/accounts",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.parse(req.body);
    const account = await prisma.account.create({ data: parsed, include: { entity: true } });
    await logAudit("ACCOUNT_CREATED", { targetType: "Account", targetId: account.id });
    res.status(201).json(account);
  })
);

bankingRouter.put(
  "/accounts/:id",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.partial().parse(req.body);
    const existing = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Bank account not found" });
      return;
    }
    const account = await prisma.$transaction(async (tx) => {
      // Moving an account to another entity takes its transactions along —
      // otherwise they'd keep counting toward the old owner's tax figures.
      if (parsed.entityId && parsed.entityId !== existing.entityId) {
        await tx.transaction.updateMany({
          where: { accountId: existing.id, OR: [{ entityId: existing.entityId }, { entityId: null }] },
          data: { entityId: parsed.entityId },
        });
      }
      return tx.account.update({ where: { id: existing.id }, data: parsed, include: { entity: true } });
    });
    await logAudit("ACCOUNT_CHANGED", { targetType: "Account", targetId: account.id, data: parsed });
    res.json(account);
  })
);

bankingRouter.delete(
  "/accounts/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: { transactions: { select: { id: true } } },
    });
    if (!account) {
      res.status(404).json({ error: "Bank account not found" });
      return;
    }
    // Unlike property or share history, bank transactions come from the
    // bank's CSV export and can simply be imported again, so an account is
    // deleted together with its transactions (the app warns first) rather
    // than making someone delete hundreds of rows one by one.
    await deleteWithLinks(
      [{ type: "ACCOUNT", id: account.id }, ...account.transactions.map((t) => ({ type: "TRANSACTION", id: t.id }))],
      async (tx) => {
        await tx.transaction.deleteMany({ where: { accountId: account.id } });
        await tx.account.delete({ where: { id: account.id } });
      }
    );
    await logAudit("ACCOUNT_DELETED", {
      targetType: "Account",
      targetId: req.params.id,
      data: { accountName: account.accountName, transactionsDeleted: account.transactions.length },
    });
    res.status(204).send();
  })
);

const transactionInput = z.object({
  date: z.string().datetime(),
  description: z.string().min(1),
  amount: z.number(),
  counterparty: z.string().optional().nullable(),
  taxCategoryId: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  taxRelevance: z.enum(["UNKNOWN", "NOT_RELEVANT", "POSSIBLE", "CONFIRMED"]).optional(),
  status: z.enum(["UNREVIEWED", "CATEGORISED", "MATCHED", "RECONCILED", "NEEDS_REVIEW"]).optional(),
  notes: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
});

bankingRouter.post(
  "/accounts/:id/transactions",
  asyncHandler(async (req, res) => {
    const parsed = transactionInput.parse(req.body);
    const date = new Date(parsed.date);
    const financialYearId = await ensureFinancialYear(date);
    const transaction = await prisma.transaction.create({
      data: { ...parsed, date, accountId: req.params.id, financialYearId },
      include: { taxCategory: true, financialYear: true },
    });
    await logAudit("TRANSACTION_CREATED", { targetType: "Transaction", targetId: transaction.id });
    res.status(201).json(transaction);
  })
);

bankingRouter.put(
  "/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const parsed = transactionInput.partial().parse(req.body);
    const data: Record<string, unknown> = { ...parsed };
    if (parsed.date) {
      data.date = new Date(parsed.date);
      data.financialYearId = await ensureFinancialYear(new Date(parsed.date));
    }
    const transaction = await prisma.transaction.update({
      where: { id: req.params.transactionId },
      data,
      include: { taxCategory: true, financialYear: true },
    });
    await logAudit("TRANSACTION_CHANGED", { targetType: "Transaction", targetId: transaction.id, data: parsed });
    res.json(transaction);
  })
);

bankingRouter.delete(
  "/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "TRANSACTION", id: req.params.transactionId }], (tx) =>
      tx.transaction.delete({ where: { id: req.params.transactionId } })
    );
    res.status(204).send();
  })
);
