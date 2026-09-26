import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { compareCars } from "../services/carCompare.js";
import { taxChange } from "../services/incomeTax.js";
import { carRateFor, CAR_KM_CAP, DEDUCTION_CATEGORIES, IMMEDIATE_DEDUCTION_LIMIT, wfhRateFor } from "../services/workDeductions.js";

/**
 * PAYG employees (IDEAS.md idea 10): work-related deductions by year, the
 * end-of-year income statement, and the car comparison.
 */
export const paygRouter = Router();

const fyLabel = z.string().regex(/^\d{4}-\d{2}$/);
const CATEGORY_KEYS = DEDUCTION_CATEGORIES.map((c) => c.key) as [string, ...string[]];

async function requirePerson(id: string) {
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) throw new HttpError(404, "Person not found");
  return person;
}

paygRouter.get(
  "/people/:id",
  asyncHandler(async (req, res) => {
    const person = await requirePerson(req.params.id);
    const fy = fyLabel.parse(req.query.fy);
    const [deductions, statements] = await Promise.all([
      prisma.workDeduction.findMany({
        where: { personId: person.id, fyLabel: fy },
        include: { document: { select: { id: true, originalFilename: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.incomeStatement.findMany({
        where: { personId: person.id },
        include: { document: { select: { id: true, originalFilename: true } } },
        orderBy: { fyLabel: "desc" },
      }),
    ]);
    const total = deductions.reduce((s, d) => s + d.amount, 0);
    const income = (person.grossSalary ?? 0) + (person.variableIncome ?? 0) + (person.carAllowance ?? 0);
    const hasIncome = person.grossSalary !== null || person.variableIncome !== null;
    const car = carRateFor(fy);
    const wfh = wfhRateFor(fy);

    // Things worth a look before 30 June.
    const checks: string[] = [];
    if (person.carAllowance && !deductions.some((d) => d.category === "CAR")) {
      checks.push("A car allowance is taxed as income — record the work kilometres so the car claim offsets it.");
    }
    const carKm = deductions.filter((d) => d.category === "CAR" && d.method === "CENTS_PER_KM").reduce((s, d) => s + (d.quantity ?? 0), 0);
    if (carKm > CAR_KM_CAP) checks.push(`Cents per km covers at most ${CAR_KM_CAP.toLocaleString("en-AU")} km a car. For more, the logbook method may give a bigger claim.`);
    const noEvidence = deductions.filter((d) => !d.documentId && !(d.category === "CAR" && d.method === "CENTS_PER_KM"));
    if (noEvidence.length) checks.push(`${noEvidence.length} claim${noEvidence.length === 1 ? " has" : "s have"} no receipt or record attached.`);
    if (deductions.some((d) => d.category === "TOOLS" && d.amount > IMMEDIATE_DEDUCTION_LIMIT)) {
      checks.push(`Items over $${IMMEDIATE_DEDUCTION_LIMIT} are claimed over their effective life (depreciated), not all at once — check the tools and equipment claims.`);
    }
    if (!wfh.known && deductions.some((d) => d.category === "WORK_FROM_HOME" && d.method === "FIXED_RATE")) {
      checks.push(`The ATO hasn't confirmed the ${fy} working-from-home rate in the saved guide; ${Math.round(wfh.rate * 100)}c an hour (${wfh.year}) is used.`);
    }
    const statement = statements.find((s) => s.fyLabel === fy);
    if (statement && hasIncome && income > 0 && Math.abs(statement.grossPayments + (statement.allowances ?? 0) - income) / income > 0.1) {
      checks.push("The income statement differs from the income recorded on this page by more than 10% — update one or the other.");
    }

    // Which categories have nothing yet — the year-round checklist.
    const claimed = new Set(deductions.map((d) => d.category));
    res.json({
      fy,
      categories: DEDUCTION_CATEGORIES.map((c) => ({ ...c, claimed: claimed.has(c.key) })),
      deductions,
      total,
      estimatedTaxSaved: hasIncome ? -taxChange(income, -total, fy) : null,
      rates: { carCentsPerKm: car.rate, carRateYear: car.year, carKmCap: CAR_KM_CAP, wfhPerHour: wfh.rate, wfhRateYear: wfh.year, immediateLimit: IMMEDIATE_DEDUCTION_LIMIT },
      incomeStatements: statements,
      checks,
      reasonsFor: (
        await prisma.claimNote.findMany({ where: { targetType: "WORK_DEDUCTION", targetId: { in: deductions.map((d) => d.id) } }, select: { targetId: true } })
      ).map((n) => n.targetId),
    });
  })
);

const deductionInput = z.object({
  fyLabel,
  category: z.enum(CATEGORY_KEYS),
  description: z.string().min(1),
  amount: z.number().min(0),
  method: z.enum(["CENTS_PER_KM", "LOGBOOK", "FIXED_RATE", "ACTUAL_COST"]).nullable().optional(),
  quantity: z.number().min(0).nullable().optional(),
  documentId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

paygRouter.post(
  "/people/:id/deductions",
  asyncHandler(async (req, res) => {
    await requirePerson(req.params.id);
    const parsed = deductionInput.parse(req.body);
    const d = await prisma.workDeduction.create({ data: { personId: req.params.id, ...parsed } });
    await logAudit("WORK_DEDUCTION_ADDED", { targetType: "WorkDeduction", targetId: d.id, data: { category: d.category, amount: d.amount } });
    res.status(201).json(d);
  })
);

paygRouter.put(
  "/deductions/:id",
  asyncHandler(async (req, res) => {
    const parsed = deductionInput.partial().parse(req.body);
    const d = await prisma.workDeduction.update({ where: { id: req.params.id }, data: parsed });
    await logAudit("WORK_DEDUCTION_CHANGED", { targetType: "WorkDeduction", targetId: d.id, data: { ...parsed } });
    res.json(d);
  })
);

paygRouter.delete(
  "/deductions/:id",
  asyncHandler(async (req, res) => {
    await prisma.$transaction([
      prisma.claimNote.deleteMany({ where: { targetType: "WORK_DEDUCTION", targetId: req.params.id } }),
      prisma.workDeduction.delete({ where: { id: req.params.id } }),
    ]);
    await logAudit("WORK_DEDUCTION_DELETED", { targetType: "WorkDeduction", targetId: req.params.id });
    res.status(204).send();
  })
);

const statementInput = z.object({
  fyLabel,
  employer: z.string().nullable().optional(),
  grossPayments: z.number().min(0),
  taxWithheld: z.number().min(0).nullable().optional(),
  allowances: z.number().min(0).nullable().optional(),
  reportableFringeBenefits: z.number().min(0).nullable().optional(),
  reportableSuper: z.number().min(0).nullable().optional(),
  lumpSums: z.number().min(0).nullable().optional(),
  documentId: z.string().nullable().optional(),
});

paygRouter.post(
  "/people/:id/income-statements",
  asyncHandler(async (req, res) => {
    await requirePerson(req.params.id);
    const parsed = statementInput.parse(req.body);
    const s = await prisma.incomeStatement.create({ data: { personId: req.params.id, ...parsed } });
    await logAudit("INCOME_STATEMENT_ADDED", { targetType: "IncomeStatement", targetId: s.id, data: { fyLabel: s.fyLabel } });
    res.status(201).json(s);
  })
);

paygRouter.delete(
  "/income-statements/:id",
  asyncHandler(async (req, res) => {
    await prisma.incomeStatement.delete({ where: { id: req.params.id } });
    await logAudit("INCOME_STATEMENT_DELETED", { targetType: "IncomeStatement", targetId: req.params.id });
    res.status(204).send();
  })
);

const carInput = z.object({
  personId: z.string(),
  fy: fyLabel,
  leasePayments: z.number().min(0),
  runningCosts: z.number().min(0),
  carPrice: z.number().min(0),
  workKm: z.number().min(0),
  allowance: z.number().min(0),
  electricRunningCosts: z.number().min(0).nullable().optional(),
  electricLeasePayments: z.number().min(0).nullable().optional(),
  electricCarPrice: z.number().min(0).nullable().optional(),
});

paygRouter.post(
  "/car-compare",
  asyncHandler(async (req, res) => {
    const { personId, ...rest } = carInput.parse(req.body);
    const person = await requirePerson(personId);
    const baseIncome = (person.grossSalary ?? 0) + (person.variableIncome ?? 0);
    const options = compareCars({ ...rest, baseIncome });
    res.json({ baseIncome, incomeRecorded: person.grossSalary !== null || person.variableIncome !== null, options });
  })
);
