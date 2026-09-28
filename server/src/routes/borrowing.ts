import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import {
  BorrowingAssumptions,
  DebtInput,
  DEFAULT_ASSUMPTIONS,
  IncomeInput,
  propertyLending,
  residentialEstimate,
  withDefaults,
} from "../services/borrowing.js";
import { incomeAndSpending } from "../services/cashflow.js";
import { shareOf } from "../services/ownership.js";
import { borrowingInputs, savedAssumptions } from "../services/borrowingInputs.js";

/**
 * Borrowing capacity estimate — see services/borrowing.ts. Everything is
 * gathered from the records here; only the assumptions come from the page.
 */
export const borrowingRouter = Router();

borrowingRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [people, spending] = await Promise.all([
      prisma.person.findMany({ select: { id: true, name: true, grossSalary: true, variableIncome: true }, orderBy: { name: "asc" } }),
      incomeAndSpending({ months: 12 }).catch(() => null),
    ]);
    res.json({
      assumptions: await savedAssumptions(),
      defaults: DEFAULT_ASSUMPTIONS,
      people,
      // A hint only: money going out of the accounts includes loan repayments.
      spendingHintMonthly: spending?.averageMonthlyOut ?? null,
    });
  })
);

const pair = z.tuple([z.number(), z.number()]);
const assumptionsInput = z
  .object({
    newLoanRate: z.number().min(0).max(30),
    buffer: z.number().min(0).max(10),
    floorRate: z.number().min(0).max(30),
    newLoanTermYears: z.number().min(1).max(40),
    existingTermYears: z.number().min(1).max(40),
    variableShading: pair,
    rentShading: pair,
    cardPercent: pair,
    declaredExpenses: z.number().min(0).nullable(),
    benchmarkExpenses: z.number().min(0).nullable(),
    residentialLvr: z.number().min(0).max(100),
    commercialLvr: pair,
    smsfLvr: pair,
    commercialIcr: pair,
    commercialBuffer: z.number().min(0).max(10),
  })
  .partial();

borrowingRouter.put(
  "/assumptions",
  asyncHandler(async (req, res) => {
    const parsed = assumptionsInput.parse(req.body);
    const merged = withDefaults({ ...(await savedAssumptions()), ...parsed });
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, borrowingAssumptions: JSON.stringify(merged) },
      update: { borrowingAssumptions: JSON.stringify(merged) },
    });
    await logAudit("BORROWING_ASSUMPTIONS_SAVED");
    res.json(merged);
  })
);

borrowingRouter.post(
  "/estimate",
  asyncHandler(async (req, res) => {
    const body = z.object({ personIds: z.array(z.string()), assumptions: assumptionsInput.optional() }).parse(req.body);
    const a = withDefaults({ ...(await savedAssumptions()), ...(body.assumptions ?? {}) });
    const { mine, properties, commercial, typeOf, netRentOf, incomes, debts } = await borrowingInputs(body.personIds);

    const residential = residentialEstimate(incomes, debts, a);

    // Equity release from their homes and residential investments.
    const equity = properties
      .filter((r) => [...mine].some((e) => shareOf(r.asset, e) > 0))
      .map((r) => {
        const value = r.asset.currentValue ?? 0;
        const lvr = r.asset.lenderMaxLvr !== null ? r.asset.lenderMaxLvr * 100 : a.residentialLvr;
        const owing = r.liabilities.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
        return { name: r.asset.name, value, lvr, owing, usable: Math.max(0, value * (lvr / 100) - owing) };
      });
    const usableTotal = equity.reduce((s, e) => s + e.usable, 0);

    // Commercial, lease-doc and SMSF: the property carries the loan.
    const propertyLoans = commercial.map((c) => {
      const smsf = typeOf.get(c.entityId) === "SMSF";
      const rates = c.loans.map((l) => l.interestRate).filter((r): r is number => r !== null);
      return {
        recordId: c.id,
        kind: smsf ? ("SMSF" as const) : ("COMMERCIAL" as const),
        ...propertyLending(
          {
            name: c.name,
            value: c.asset.currentValue,
            netRent: netRentOf(c),
            existingDebt: c.loans.reduce((s, l) => s + (l.currentBalance ?? 0), 0),
            ratePct: rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : a.newLoanRate,
          },
          smsf ? a.smsfLvr : a.commercialLvr,
          a
        ),
      };
    });

    res.json({
      assumptions: a,
      incomes,
      debts,
      residential,
      equity: {
        properties: equity,
        usableTotal,
        // The lower of the equity there and what income can service.
        release: [
          Math.min(usableTotal, Math.max(0, residential.scenarios[0].maxNewLoan)),
          Math.min(usableTotal, Math.max(0, residential.scenarios[1].maxNewLoan)),
        ],
      },
      propertyLoans,
    });
  })
);
