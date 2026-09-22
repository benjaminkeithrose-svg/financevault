import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";

export const investmentsRouter = Router();

investmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const accounts = await prisma.investmentAccount.findMany({
      where: entityId ? { entityId } : undefined,
      include: { entity: true, holdings: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(accounts);
  })
);

investmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.investmentAccount.findUnique({
      where: { id: req.params.id },
      include: { entity: true, holdings: true },
    });
    if (!account) {
      res.status(404).json({ error: "Investment account not found" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType: "INVESTMENT_ACCOUNT", targetId: account.id },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });

    const realisedGainLoss = account.holdings
      .filter((h) => h.disposalDate && h.salePrice !== null)
      .reduce((sum, h) => sum + ((h.salePrice ?? 0) - (h.costBase ?? h.purchasePrice ?? 0) - (h.brokerage ?? 0)), 0);

    res.json({ ...account, documents: links.map((l) => l.document), realisedGainLoss });
  })
);

const accountInput = z.object({
  institution: z.string().min(1),
  accountRef: z.string().optional().nullable(),
  entityId: z.string(),
  accountType: z.string().min(1), // SHARES | ETF | MANAGED_FUND | TERM_DEPOSIT | BOND | OTHER
  notes: z.string().optional().nullable(),
});

investmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.parse(req.body);
    const account = await prisma.investmentAccount.create({ data: parsed, include: { entity: true, holdings: true } });
    await logAudit("INVESTMENT_ACCOUNT_CREATED", { targetType: "InvestmentAccount", targetId: account.id });
    res.status(201).json(account);
  })
);

investmentsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.partial().parse(req.body);
    const account = await prisma.investmentAccount.update({
      where: { id: req.params.id },
      data: parsed,
      include: { entity: true, holdings: true },
    });
    await logAudit("INVESTMENT_ACCOUNT_CHANGED", { targetType: "InvestmentAccount", targetId: account.id, data: parsed });
    res.json(account);
  })
);

investmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.investmentAccount.delete({ where: { id: req.params.id } });
    await logAudit("INVESTMENT_ACCOUNT_DELETED", { targetType: "InvestmentAccount", targetId: req.params.id });
    res.status(204).send();
  })
);

const holdingInput = z.object({
  code: z.string().min(1),
  quantity: z.number().optional().nullable(),
  acquisitionDate: z.string().datetime().optional().nullable(),
  purchasePrice: z.number().optional().nullable(),
  disposalDate: z.string().datetime().optional().nullable(),
  salePrice: z.number().optional().nullable(),
  costBase: z.number().optional().nullable(),
  brokerage: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function holdingData(parsed: z.infer<typeof holdingInput>) {
  return {
    ...parsed,
    acquisitionDate: parsed.acquisitionDate ? new Date(parsed.acquisitionDate) : parsed.acquisitionDate,
    disposalDate: parsed.disposalDate ? new Date(parsed.disposalDate) : parsed.disposalDate,
  };
}

investmentsRouter.post(
  "/:id/holdings",
  asyncHandler(async (req, res) => {
    const parsed = holdingInput.parse(req.body);
    const holding = await prisma.investmentHolding.create({
      data: { ...holdingData(parsed), investmentAccountId: req.params.id },
    });
    await logAudit("INVESTMENT_HOLDING_CREATED", { targetType: "InvestmentHolding", targetId: holding.id });
    res.status(201).json(holding);
  })
);

investmentsRouter.put(
  "/holdings/:holdingId",
  asyncHandler(async (req, res) => {
    const parsed = holdingInput.partial().parse(req.body);
    const holding = await prisma.investmentHolding.update({
      where: { id: req.params.holdingId },
      data: holdingData(parsed as z.infer<typeof holdingInput>),
    });
    await logAudit("INVESTMENT_HOLDING_CHANGED", { targetType: "InvestmentHolding", targetId: holding.id, data: parsed });
    res.json(holding);
  })
);

investmentsRouter.delete(
  "/holdings/:holdingId",
  asyncHandler(async (req, res) => {
    await prisma.investmentHolding.delete({ where: { id: req.params.holdingId } });
    res.status(204).send();
  })
);
