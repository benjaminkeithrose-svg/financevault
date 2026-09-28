import { prisma } from "../db.js";
import { DebtInput, IncomeInput, residentialEstimate } from "./borrowing.js";
import { borrowingInputs, savedAssumptions } from "./borrowingInputs.js";
import { projectPlan } from "./planProjection.js";

/**
 * "Can you borrow it?" for a Portfolio Plan: each year's new borrowing (the
 * loans for purchases, equity drawn, and what refinancing adds) against
 * roughly what a lender might lend then — the same method as the "How much
 * could I borrow?" page (services/borrowing.ts), using the incomes and loans
 * in the records, plus the rent and loans of the plan's properties bought by
 * then. Incomes are held flat. An estimate: the lender decides.
 */

export type BorrowingStatus = "FINE" | "SOME_LENDERS" | "TOO_MUCH";

export interface PlanBorrowingYear {
  yearNumber: number;
  newBorrowing: number;
  /** What it's made of, in words. */
  parts: string[];
  capacity: [number, number];
  dtiLimit: number;
  status: BorrowingStatus | null;
  reason: string | null;
}

/** Everyone with a salary recorded, unless the plan names who. */
export async function planBorrowers(borrowerIds: string | null): Promise<string[]> {
  if (borrowerIds) {
    try {
      const ids = JSON.parse(borrowerIds);
      if (Array.isArray(ids) && ids.length) return ids.map(String);
    } catch {
      /* fall through */
    }
  }
  return (await prisma.person.findMany({ where: { grossSalary: { gt: 0 } }, select: { id: true } })).map((p) => p.id);
}

const k = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

export async function planBorrowingCheck(planId: string) {
  const plan = await prisma.portfolioPlan.findUnique({
    where: { id: planId },
    include: { properties: { include: { refinances: true, equityDraws: true } } },
  });
  if (!plan) return null;
  const projection = (await projectPlan(planId))!;
  const personIds = await planBorrowers(plan.borrowerIds);
  const { people, incomes: baseIncomes, debts: baseDebts } = await borrowingInputs(personIds);
  const saved = await savedAssumptions();
  const a = { ...saved, newLoanRate: plan.interestRate * 100 };
  const ratePct = plan.interestRate * 100;

  const years: PlanBorrowingYear[] = projection.portfolioByYear.map(({ yearNumber }) => {
    // This year's new borrowing.
    const parts: string[] = [];
    let newBorrowing = 0;
    for (const p of plan.properties) {
      if (p.acquisitionYearNumber === yearNumber) {
        const loan = p.purchasePrice * p.initialLvr;
        newBorrowing += loan;
        parts.push(`${k(loan)} to buy ${p.name}`);
      }
      for (const d of p.equityDraws.filter((d) => d.yearNumber === yearNumber)) {
        newBorrowing += d.amount;
        parts.push(`${k(d.amount)} of equity for ${p.name}`);
      }
    }
    for (const pp of projection.properties) {
      const row = pp.rows.find((r) => r.yearNumber === yearNumber);
      if (row?.refinanceCash && row.refinanceCash > 0) {
        newBorrowing += row.refinanceCash;
        parts.push(`${k(row.refinanceCash)} more by refinancing ${pp.name}`);
      }
    }

    // What's owed on the plan's purchases before this year's borrowing, and their rent (lenders count a new purchase's rent too).
    const plannedDebts: DebtInput[] = [];
    let plannedRent = 0;
    for (const pp of projection.properties) {
      const before = pp.rows.find((r) => r.yearNumber === yearNumber - 1);
      if (before) plannedDebts.push({ name: `Planned: ${pp.name}`, balance: before.loan, ratePct, remainingYears: null, cardLimit: null });
      const now = pp.rows.find((r) => r.yearNumber === yearNumber);
      if (now) plannedRent += now.rent;
    }
    const drawnBefore = plan.properties.flatMap((p) => p.equityDraws).filter((d) => d.yearNumber < yearNumber).reduce((s, d) => s + d.amount, 0);
    if (drawnBefore) plannedDebts.push({ name: "Planned: equity drawn", balance: drawnBefore, ratePct, remainingYears: null, cardLimit: null });

    // The planned rent is shared between the borrowers.
    const share = baseIncomes.length ? plannedRent / baseIncomes.length : 0;
    const incomes: IncomeInput[] = baseIncomes.map((i) => ({ ...i, rent: i.rent + share }));
    const est = residentialEstimate(incomes, [...baseDebts, ...plannedDebts], a);
    const capacity: [number, number] = [Math.max(0, est.scenarios[0].maxNewLoan), Math.max(0, est.scenarios[1].maxNewLoan)];

    let status: BorrowingStatus | null = null;
    let reason: string | null = null;
    if (newBorrowing > 0) {
      if (newBorrowing > capacity[1]) {
        status = "TOO_MUCH";
        reason = `More than even the generous estimate (${k(capacity[1])}).`;
      } else if (newBorrowing > capacity[0]) {
        status = "SOME_LENDERS";
        reason = `Between the careful (${k(capacity[0])}) and generous (${k(capacity[1])}) estimates — some lenders only.`;
      } else {
        status = "FINE";
        reason = `Within the careful estimate (${k(capacity[0])}).`;
      }
      if (newBorrowing > est.dtiLimitLoan && status !== "TOO_MUCH") {
        status = "SOME_LENDERS";
        reason = `It takes your debts to 6× your income or more (past ${k(est.dtiLimitLoan)} more), which banks limit — some lenders only.`;
      }
    }
    return { yearNumber, newBorrowing, parts, capacity, dtiLimit: est.dtiLimitLoan, status, reason };
  });

  const notes: string[] = [];
  if (!people.length) notes.push("No one's income is counted — record a salary on a person's page, or choose who backs the plan.");
  const first = residentialEstimate(baseIncomes, baseDebts, a);
  for (const n of first.notes) if (/No living expenses|No income/.test(n)) notes.push(n);
  notes.push("Incomes are held at today's level (no pay rises), new loans assessed at the plan's interest rate plus the buffer on the Borrowing page.");
  notes.push("A commercial property is also judged on its own rent cover — the Borrowing page shows that.");

  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    chosen: !!plan.borrowerIds,
    years,
    overYears: years.filter((y) => y.status === "TOO_MUCH" || y.status === "SOME_LENDERS").map((y) => ({ yearNumber: y.yearNumber, status: y.status })),
    notes,
  };
}
