import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { interestSchedule, LOAN_USES, purposeSplit, usableEquity } from "../services/debtAllocation.js";

/**
 * Debt allocation, stage 1: what each loan's money was used for, the
 * interest each year from the lender's statement, and the deductible share
 * that follows. See services/debtAllocation.ts for the rules.
 */
export const debtAllocationRouter = Router();

const fyLabel = z.string().regex(/^\d{4}-\d{2}$/);

async function requireLoan(id: string) {
  const loan = await prisma.liability.findUnique({ where: { id } });
  if (!loan) throw new HttpError(404, "Loan not found");
  return loan;
}

debtAllocationRouter.get(
  "/loans/:id",
  asyncHandler(async (req, res) => {
    await requireLoan(req.params.id);
    const [purposes, interestYears] = await Promise.all([
      prisma.loanPurpose.findMany({
        where: { liabilityId: req.params.id },
        include: { asset: { select: { id: true, name: true } }, document: { select: { id: true, originalFilename: true } } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      prisma.loanInterestYear.findMany({
        where: { liabilityId: req.params.id },
        include: { document: { select: { id: true, originalFilename: true } } },
        orderBy: { fyLabel: "desc" },
      }),
    ]);
    // Which claims already have a "why" recorded, so their icon shows it.
    const reasons = await prisma.claimNote.findMany({
      where: { targetId: { in: [...purposes.map((p) => p.id), ...interestYears.map((y) => y.id)] } },
      select: { targetId: true },
    });
    res.json({ purposes, interestYears, split: purposeSplit(purposes), uses: LOAN_USES, reasonsFor: reasons.map((r) => r.targetId) });
  })
);

const purposeInput = z.object({
  date: z.string().datetime().nullable().optional(),
  amount: z.number().positive(),
  use: z.enum(LOAN_USES),
  deductible: z.boolean(),
  assetId: z.string().nullable().optional(),
  description: z.string().min(1),
  documentId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function purposeData(p: Partial<z.infer<typeof purposeInput>>) {
  return { ...p, ...(p.date !== undefined ? { date: p.date ? new Date(p.date) : null } : {}) };
}

debtAllocationRouter.post(
  "/loans/:id/purposes",
  asyncHandler(async (req, res) => {
    await requireLoan(req.params.id);
    const parsed = purposeInput.parse(req.body);
    const purpose = await prisma.loanPurpose.create({ data: { liabilityId: req.params.id, ...purposeData(parsed) } as never });
    await logAudit("LOAN_PURPOSE_ADDED", { targetType: "LoanPurpose", targetId: purpose.id, data: { ...parsed } });
    res.status(201).json(purpose);
  })
);

debtAllocationRouter.put(
  "/purposes/:id",
  asyncHandler(async (req, res) => {
    const parsed = purposeInput.partial().parse(req.body);
    const purpose = await prisma.loanPurpose.update({ where: { id: req.params.id }, data: purposeData(parsed) as never });
    await logAudit("LOAN_PURPOSE_CHANGED", { targetType: "LoanPurpose", targetId: purpose.id, data: { ...parsed } });
    res.json(purpose);
  })
);

debtAllocationRouter.delete(
  "/purposes/:id",
  asyncHandler(async (req, res) => {
    await prisma.$transaction([
      prisma.claimNote.deleteMany({ where: { targetType: "LOAN_PURPOSE", targetId: req.params.id } }),
      prisma.loanPurpose.delete({ where: { id: req.params.id } }),
    ]);
    await logAudit("LOAN_PURPOSE_DELETED", { targetType: "LoanPurpose", targetId: req.params.id });
    res.status(204).send();
  })
);

const interestInput = z.object({
  fyLabel,
  interestCharged: z.number().min(0),
  documentId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

debtAllocationRouter.put(
  "/loans/:id/interest-years",
  asyncHandler(async (req, res) => {
    await requireLoan(req.params.id);
    const parsed = interestInput.parse(req.body);
    const { fyLabel: label, ...rest } = parsed;
    const year = await prisma.loanInterestYear.upsert({
      where: { liabilityId_fyLabel: { liabilityId: req.params.id, fyLabel: label } },
      create: { liabilityId: req.params.id, fyLabel: label, ...rest },
      update: rest,
    });
    await logAudit("LOAN_INTEREST_RECORDED", { targetType: "LoanInterestYear", targetId: year.id, data: { ...parsed } });
    res.json(year);
  })
);

debtAllocationRouter.delete(
  "/interest-years/:id",
  asyncHandler(async (req, res) => {
    await prisma.$transaction([
      prisma.claimNote.deleteMany({ where: { targetType: "LOAN_INTEREST_YEAR", targetId: req.params.id } }),
      prisma.loanInterestYear.delete({ where: { id: req.params.id } }),
    ]);
    await logAudit("LOAN_INTEREST_DELETED", { targetType: "LoanInterestYear", targetId: req.params.id });
    res.status(204).send();
  })
);

debtAllocationRouter.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const fy = fyLabel.parse(req.query.fy);
    const entityId = typeof req.query.entityId === "string" && req.query.entityId ? req.query.entityId : undefined;
    const rows = await interestSchedule(fy, entityId);
    const years = (await prisma.loanInterestYear.findMany({ distinct: ["fyLabel"], select: { fyLabel: true } })).map((y) => y.fyLabel).sort().reverse();
    res.json({ fy, rows, years });
  })
);

/** Usable equity on a property: value × lender's maximum LVR − loans secured on it. */
debtAllocationRouter.get(
  "/usable-equity/:assetId",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.assetId },
      include: { property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
    });
    if (!asset) throw new HttpError(404, "Asset not found");
    const loans = await prisma.liability.findMany({
      where: {
        OR: [
          { securityAssetId: asset.id },
          ...(asset.property ? [{ securityPropertyId: asset.property.id }] : []),
          ...(asset.commercialProperty ? [{ securityCommercialPropertyId: asset.commercialProperty.id }] : []),
        ],
      },
      select: { id: true, name: true, currentBalance: true, creditLimit: true },
    });
    const owing = loans.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
    res.json({ loans, equity: usableEquity(asset.currentValue, asset.lenderMaxLvr, owing) });
  })
);
