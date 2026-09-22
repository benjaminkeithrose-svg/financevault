import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";
import { financialYearBounds, financialYearLabelForDate } from "../services/financialYear.js";
import {
  allocateFifo,
  computeDisposal,
  parcelCostBase,
  remainingQuantity,
  type AllocationLike,
  type ParcelLike,
} from "../services/cgt.js";
import { latestPrices, positionsForAccount } from "../services/positions.js";
import { fetchCoinGeckoPrices, fetchYahooPrices, yahooSymbolFor } from "../services/priceProviders.js";

export const investmentsRouter = Router();

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

investmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    const accounts = await prisma.investmentAccount.findMany({
      where: entityId ? { entityId } : undefined,
      include: { entity: true, _count: { select: { parcels: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(accounts);
  })
);

// Registered before "/:id" so the literal path isn't swallowed by the param.
investmentsRouter.get(
  "/securities",
  asyncHandler(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    const securities = await prisma.security.findMany({
      where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined,
      orderBy: { code: "asc" },
    });
    const priceMap = await latestPrices(securities.map((s) => s.id));
    res.json(
      securities.map((s) => ({
        ...s,
        latestPrice: priceMap.get(s.id)?.price ?? null,
        priceDate: priceMap.get(s.id)?.priceDate ?? null,
      }))
    );
  })
);

const securityInput = z.object({
  code: z.string().min(1),
  name: z.string().optional().nullable(),
  assetClass: z.enum(["SHARE", "ETF", "MANAGED_FUND", "CRYPTO", "SUPER", "BOND", "OTHER"]),
  exchange: z.string().optional().nullable(),
  priceSource: z.enum(["MANUAL", "YAHOO", "COINGECKO"]).optional(),
  providerSymbol: z.string().optional().nullable(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
});

investmentsRouter.post(
  "/securities",
  asyncHandler(async (req, res) => {
    const parsed = securityInput.parse(req.body);
    const existing = await prisma.security.findUnique({ where: { code: parsed.code } });
    if (existing) {
      res.status(200).json(existing);
      return;
    }
    const security = await prisma.security.create({ data: parsed });
    res.status(201).json(security);
  })
);

investmentsRouter.put(
  "/securities/:securityId",
  asyncHandler(async (req, res) => {
    const parsed = securityInput.partial().parse(req.body);
    const security = await prisma.security.update({ where: { id: req.params.securityId }, data: parsed });
    res.json(security);
  })
);

const priceInput = z.object({
  price: z.number().positive(),
  priceDate: z.string().datetime().optional(),
});

/** Manual price entry — the fallback for anything with no usable feed. */
investmentsRouter.post(
  "/securities/:securityId/prices",
  asyncHandler(async (req, res) => {
    const parsed = priceInput.parse(req.body);
    const priceDate = parsed.priceDate ? new Date(parsed.priceDate) : new Date();
    // Normalised to the day so one price per security per day is kept.
    priceDate.setUTCHours(0, 0, 0, 0);

    const price = await prisma.securityPrice.upsert({
      where: { securityId_priceDate: { securityId: req.params.securityId, priceDate } },
      update: { price: parsed.price, source: "MANUAL" },
      create: { securityId: req.params.securityId, priceDate, price: parsed.price, source: "MANUAL" },
    });
    res.status(201).json(price);
  })
);

investmentsRouter.get(
  "/securities/:securityId/prices",
  asyncHandler(async (req, res) => {
    const prices = await prisma.securityPrice.findMany({
      where: { securityId: req.params.securityId },
      orderBy: { priceDate: "desc" },
      take: 90,
    });
    res.json(prices);
  })
);

investmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.investmentAccount.findUnique({
      where: { id: req.params.id },
      include: { entity: true },
    });
    if (!account) {
      res.status(404).json({ error: "Investment account not found" });
      return;
    }

    const [positions, disposals, dividends, links] = await Promise.all([
      positionsForAccount(account.id),
      prisma.investmentDisposal.findMany({
        where: { investmentAccountId: account.id },
        include: { security: true, allocations: { include: { parcel: true } }, financialYear: true },
        orderBy: { disposalDate: "desc" },
      }),
      prisma.investmentDividend.findMany({
        where: { investmentAccountId: account.id },
        include: { security: true, financialYear: true },
        orderBy: { paymentDate: "desc" },
      }),
      prisma.documentLink.findMany({
        where: { targetType: "INVESTMENT_ACCOUNT", targetId: account.id },
        include: { document: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const disposalResults = disposals.map((d) => {
      const parcelsById = new Map<string, ParcelLike>(d.allocations.map((a) => [a.parcelId, a.parcel]));
      const result = computeDisposal(
        d,
        d.allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity })),
        parcelsById,
        account.entity.entityType
      );
      return { ...d, result };
    });

    res.json({
      ...account,
      positions,
      disposals: disposalResults,
      dividends,
      documents: links.map((l) => l.document),
      totals: {
        costBase: positions.reduce((s, p) => s + p.costBase, 0),
        // Null where any price is missing would hide the rest, so known
        // values are summed and the count of unpriced holdings is reported
        // alongside rather than silently treated as zero.
        marketValue: positions.reduce((s, p) => s + (p.marketValue ?? 0), 0),
        unpricedCount: positions.filter((p) => p.marketValue === null && p.quantity > 0).length,
        realisedNetGain: disposalResults.reduce((s, d) => s + d.result.netGain, 0),
        frankingCredits: dividends.reduce((s, d) => s + d.frankingCredit, 0),
      },
    });
  })
);

const accountInput = z.object({
  institution: z.string().min(1),
  accountRef: z.string().optional().nullable(),
  entityId: z.string(),
  accountType: z.string().min(1), // SHARES | ETF | MANAGED_FUND | TERM_DEPOSIT | BOND | CRYPTO | OTHER
  notes: z.string().optional().nullable(),
});

investmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.parse(req.body);
    const account = await prisma.investmentAccount.create({ data: parsed, include: { entity: true } });
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
      include: { entity: true },
    });
    await logAudit("INVESTMENT_ACCOUNT_CHANGED", { targetType: "InvestmentAccount", targetId: account.id, data: parsed });
    res.json(account);
  })
);

investmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.investmentAccount.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { parcels: true, disposals: true, dividends: true } } },
    });
    if (!account) {
      res.status(404).json({ error: "Investment account not found" });
      return;
    }
    // Parcels and disposals are the cost-base and CGT history — years of it
    // may be needed for a future sale or an ATO question.
    refuseIfInUse("investment account", [
      { count: account._count.parcels, one: "parcel", many: "parcels" },
      { count: account._count.disposals, one: "sale", many: "sales" },
      { count: account._count.dividends, one: "dividend", many: "dividends" },
    ]);
    await deleteWithLinks([{ type: "INVESTMENT_ACCOUNT", id: account.id }], (tx) =>
      tx.investmentAccount.delete({ where: { id: account.id } })
    );
    await logAudit("INVESTMENT_ACCOUNT_DELETED", { targetType: "InvestmentAccount", targetId: req.params.id });
    res.status(204).send();
  })
);

const parcelInput = z.object({
  securityId: z.string(),
  acquisitionDate: z.string().datetime(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  brokerage: z.number().nonnegative().optional(),
  acquisitionType: z.enum(["PURCHASE", "DRP", "BONUS_ISSUE", "TRANSFER_IN", "SPLIT_ADJUSTMENT"]).optional(),
  notes: z.string().optional().nullable(),
});

investmentsRouter.post(
  "/:id/parcels",
  asyncHandler(async (req, res) => {
    const parsed = parcelInput.parse(req.body);
    const parcel = await prisma.investmentParcel.create({
      data: {
        ...parsed,
        acquisitionDate: new Date(parsed.acquisitionDate),
        investmentAccountId: req.params.id,
      },
      include: { security: true },
    });
    await logAudit("INVESTMENT_PARCEL_CREATED", { targetType: "InvestmentParcel", targetId: parcel.id });
    res.status(201).json(parcel);
  })
);

investmentsRouter.put(
  "/parcels/:parcelId",
  asyncHandler(async (req, res) => {
    const parsed = parcelInput.partial().parse(req.body);
    const data: Record<string, unknown> = { ...parsed };
    if (parsed.acquisitionDate) data.acquisitionDate = new Date(parsed.acquisitionDate);
    const parcel = await prisma.investmentParcel.update({
      where: { id: req.params.parcelId },
      data,
      include: { security: true },
    });
    await logAudit("INVESTMENT_PARCEL_CHANGED", { targetType: "InvestmentParcel", targetId: parcel.id, data: parsed });
    res.json(parcel);
  })
);

investmentsRouter.delete(
  "/parcels/:parcelId",
  asyncHandler(async (req, res) => {
    const allocations = await prisma.disposalAllocation.count({ where: { parcelId: req.params.parcelId } });
    if (allocations > 0) {
      res.status(400).json({
        error: "This parcel has already been sold from, so deleting it would leave a disposal with no cost base. Remove the disposal first.",
      });
      return;
    }
    await prisma.investmentParcel.delete({ where: { id: req.params.parcelId } });
    res.status(204).send();
  })
);

/**
 * Shows what a sale would look like before it's recorded — which parcels it
 * would draw on and what the gain would be — since which parcels go has real
 * tax consequences and shouldn't be discovered afterwards.
 */
investmentsRouter.get(
  "/:id/disposal-preview",
  asyncHandler(async (req, res) => {
    const securityId = String(req.query.securityId || "");
    const quantity = Number(req.query.quantity || 0);
    const unitPrice = Number(req.query.unitPrice || 0);
    const brokerage = Number(req.query.brokerage || 0);
    const disposalDate = req.query.disposalDate ? new Date(String(req.query.disposalDate)) : new Date();

    const account = await prisma.investmentAccount.findUnique({
      where: { id: req.params.id },
      include: { entity: true },
    });
    if (!account) {
      res.status(404).json({ error: "Investment account not found" });
      return;
    }

    const parcels = await prisma.investmentParcel.findMany({
      where: { investmentAccountId: req.params.id, securityId },
      orderBy: { acquisitionDate: "asc" },
    });
    const existing = await prisma.disposalAllocation.findMany({
      where: { parcel: { investmentAccountId: req.params.id, securityId } },
    });
    const existingAllocations: AllocationLike[] = existing.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity }));

    const available = parcels.reduce((s, p) => s + remainingQuantity(p, existingAllocations), 0);
    const allocations = allocateFifo(parcels, existingAllocations, quantity);
    const parcelsById = new Map<string, ParcelLike>(parcels.map((p) => [p.id, p]));
    const result = computeDisposal(
      { disposalDate, quantity, unitPrice, brokerage },
      allocations,
      parcelsById,
      account.entity.entityType
    );

    res.json({
      available,
      entityType: account.entity.entityType,
      allocations,
      result,
      parcels: parcels.map((p) => ({
        id: p.id,
        acquisitionDate: p.acquisitionDate,
        remainingQuantity: remainingQuantity(p, existingAllocations),
        unitPrice: p.unitPrice,
        costBase: parcelCostBase(p),
      })),
    });
  })
);

const disposalInput = z.object({
  securityId: z.string(),
  disposalDate: z.string().datetime(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  brokerage: z.number().nonnegative().optional(),
  method: z.enum(["FIFO", "SPECIFIC"]).optional(),
  /** Omitted means "work it out FIFO"; supplied means the user nominated parcels. */
  allocations: z.array(z.object({ parcelId: z.string(), quantity: z.number().positive() })).optional(),
});

investmentsRouter.post(
  "/:id/disposals",
  asyncHandler(async (req, res) => {
    const parsed = disposalInput.parse(req.body);
    const disposalDate = new Date(parsed.disposalDate);

    const parcels = await prisma.investmentParcel.findMany({
      where: { investmentAccountId: req.params.id, securityId: parsed.securityId },
      orderBy: { acquisitionDate: "asc" },
    });
    const existing = await prisma.disposalAllocation.findMany({
      where: { parcel: { investmentAccountId: req.params.id, securityId: parsed.securityId } },
    });
    const existingAllocations: AllocationLike[] = existing.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity }));

    const allocations = parsed.allocations ?? allocateFifo(parcels, existingAllocations, parsed.quantity);
    const allocated = allocations.reduce((s, a) => s + a.quantity, 0);

    // Selling more than is held would silently create a gain out of nothing.
    if (allocated < parsed.quantity - 1e-9) {
      const available = parcels.reduce((s, p) => s + remainingQuantity(p, existingAllocations), 0);
      res.status(400).json({
        error: `Only ${available} units are held, so ${parsed.quantity} can't be sold. Record the missing purchase first.`,
      });
      return;
    }

    // A nominated parcel can't give up more than it still holds.
    for (const allocation of allocations) {
      const parcel = parcels.find((p) => p.id === allocation.parcelId);
      if (!parcel) {
        res.status(400).json({ error: "A chosen parcel doesn't belong to this account and security." });
        return;
      }
      const left = remainingQuantity(parcel, existingAllocations);
      if (allocation.quantity > left + 1e-9) {
        res.status(400).json({
          error: `A chosen parcel only has ${left} units left, but ${allocation.quantity} were allocated to it.`,
        });
        return;
      }
    }

    const disposal = await prisma.investmentDisposal.create({
      data: {
        investmentAccountId: req.params.id,
        securityId: parsed.securityId,
        disposalDate,
        quantity: parsed.quantity,
        unitPrice: parsed.unitPrice,
        brokerage: parsed.brokerage ?? 0,
        method: parsed.method ?? (parsed.allocations ? "SPECIFIC" : "FIFO"),
        financialYearId: await ensureFinancialYear(disposalDate),
        allocations: { create: allocations.map((a) => ({ parcelId: a.parcelId, quantity: a.quantity })) },
      },
      include: { security: true, allocations: { include: { parcel: true } } },
    });

    await logAudit("INVESTMENT_DISPOSAL_CREATED", { targetType: "InvestmentDisposal", targetId: disposal.id });
    res.status(201).json(disposal);
  })
);

investmentsRouter.delete(
  "/disposals/:disposalId",
  asyncHandler(async (req, res) => {
    await prisma.investmentDisposal.delete({ where: { id: req.params.disposalId } });
    await logAudit("INVESTMENT_DISPOSAL_DELETED", { targetType: "InvestmentDisposal", targetId: req.params.disposalId });
    res.status(204).send();
  })
);

const dividendInput = z.object({
  securityId: z.string(),
  paymentDate: z.string().datetime(),
  frankedAmount: z.number().nonnegative().optional(),
  unfrankedAmount: z.number().nonnegative().optional(),
  frankingCredit: z.number().nonnegative().optional(),
  capitalGainsAmount: z.number().optional(),
  foreignIncome: z.number().nonnegative().optional(),
  foreignTaxCredit: z.number().nonnegative().optional(),
  notes: z.string().optional().nullable(),
  /** Supplied when the dividend was reinvested — creates the resulting parcel. */
  reinvestment: z
    .object({ quantity: z.number().positive(), unitPrice: z.number().nonnegative() })
    .optional(),
});

investmentsRouter.post(
  "/:id/dividends",
  asyncHandler(async (req, res) => {
    const parsed = dividendInput.parse(req.body);
    const paymentDate = new Date(parsed.paymentDate);
    const { reinvestment, ...dividendFields } = parsed;

    // A reinvestment buys real units at a real price, so it becomes a parcel
    // in its own right — otherwise the cost base of those units is lost.
    let reinvestedParcelId: string | undefined;
    if (reinvestment) {
      const parcel = await prisma.investmentParcel.create({
        data: {
          investmentAccountId: req.params.id,
          securityId: parsed.securityId,
          acquisitionDate: paymentDate,
          quantity: reinvestment.quantity,
          unitPrice: reinvestment.unitPrice,
          acquisitionType: "DRP",
        },
      });
      reinvestedParcelId = parcel.id;
    }

    const dividend = await prisma.investmentDividend.create({
      data: {
        ...dividendFields,
        paymentDate,
        investmentAccountId: req.params.id,
        financialYearId: await ensureFinancialYear(paymentDate),
        reinvestedParcelId,
      },
      include: { security: true },
    });

    await logAudit("INVESTMENT_DIVIDEND_CREATED", { targetType: "InvestmentDividend", targetId: dividend.id });
    res.status(201).json(dividend);
  })
);

investmentsRouter.delete(
  "/dividends/:dividendId",
  asyncHandler(async (req, res) => {
    await prisma.investmentDividend.delete({ where: { id: req.params.dividendId } });
    res.status(204).send();
  })
);

/**
 * Refreshes prices for every security that has a feed configured.
 *
 * Manual-priced securities are left alone — that's a deliberate choice by
 * the user, not a gap to fill. Runs on demand only; nothing polls in the
 * background, which also means prices can't quietly change under a figure
 * you're looking at.
 */
investmentsRouter.post(
  "/prices/refresh",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings?.allowPriceLookups) {
      res.status(400).json({
        error:
          "Price lookups are turned off. Turn them on in Settings first — they're the only part of the investment module that reaches the internet.",
      });
      return;
    }

    const securities = await prisma.security.findMany({
      where: { priceSource: { in: ["YAHOO", "COINGECKO"] } },
    });
    if (securities.length === 0) {
      res.json({ updated: 0, failures: [], note: "No securities are set to use a price feed." });
      return;
    }

    const yahoo = securities.filter((s) => s.priceSource === "YAHOO");
    const coingecko = securities.filter((s) => s.priceSource === "COINGECKO");

    // Symbol back to security, since providers answer in their own terms.
    const yahooSymbols = new Map<string, string>();
    for (const s of yahoo) yahooSymbols.set(yahooSymbolFor(s.code, s.exchange, s.providerSymbol), s.id);
    const coingeckoIds = new Map<string, string>();
    for (const s of coingecko) coingeckoIds.set((s.providerSymbol || s.code).toLowerCase(), s.id);

    const [yahooResult, coingeckoResult] = await Promise.all([
      fetchYahooPrices([...yahooSymbols.keys()]),
      fetchCoinGeckoPrices([...coingeckoIds.keys()]),
    ]);

    let updated = 0;
    for (const quote of [...yahooResult.quotes, ...coingeckoResult.quotes]) {
      const securityId = yahooSymbols.get(quote.code) ?? coingeckoIds.get(quote.code.toLowerCase());
      if (!securityId) continue;

      const priceDate = new Date(quote.priceDate);
      priceDate.setUTCHours(0, 0, 0, 0);
      await prisma.securityPrice.upsert({
        where: { securityId_priceDate: { securityId, priceDate } },
        update: { price: quote.price, source: quote.source },
        create: { securityId, priceDate, price: quote.price, source: quote.source },
      });
      updated += 1;
    }

    const codeFor = (providerCode: string) => {
      const id = yahooSymbols.get(providerCode) ?? coingeckoIds.get(providerCode.toLowerCase());
      return securities.find((s) => s.id === id)?.code ?? providerCode;
    };
    const failures = [...yahooResult.failures, ...coingeckoResult.failures].map((f) => ({
      code: codeFor(f.code),
      reason: f.reason,
    }));

    await logAudit("SECURITY_PRICES_REFRESHED", { targetType: "Security", data: { updated, failed: failures.length } });
    res.json({ updated, failures });
  })
);
