import { prisma } from "../db.js";
import { BorrowingAssumptions, DebtInput, DEFAULT_ASSUMPTIONS, IncomeInput, withDefaults } from "./borrowing.js";
import { computeIncomeAndNoi } from "./commercialMetrics.js";
import { shareOf } from "./ownership.js";

/**
 * What a borrowing estimate is built from, gathered from the records: the
 * saved assumptions, and for the chosen people their incomes (with their
 * share of rent from what they own) and every loan or card they owe on.
 * Used by the "How much could I borrow?" page and the Portfolio Plan's
 * borrowing check, so both count the same things.
 */

export async function savedAssumptions(): Promise<BorrowingAssumptions> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  try {
    return withDefaults(settings?.borrowingAssumptions ? JSON.parse(settings.borrowingAssumptions) : null);
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
}

export async function borrowingInputs(personIds: string[]) {
  const people = await prisma.person.findMany({ where: { id: { in: personIds } } });
  const mine = new Set(people.map((p) => p.entityId).filter((e): e is string => !!e));

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [properties, commercial, liabilities, entities, outgoings] = await Promise.all([
    prisma.property.findMany({ where: { asset: { disposalDate: null } }, include: { asset: { include: { ownerships: true } }, liabilities: true } }),
    prisma.commercialProperty.findMany({ where: { asset: { disposalDate: null } }, include: { asset: { include: { ownerships: true } }, tenancies: true, loans: true } }),
    prisma.liability.findMany({ include: { ownerships: true } }),
    prisma.entity.findMany({ select: { id: true, entityType: true } }),
    prisma.outgoingRecord.findMany({ where: { date: { gte: yearAgo } } }),
  ]);
  const typeOf = new Map(entities.map((e) => [e.id, e.entityType]));
  const netRentOf = (c: (typeof commercial)[number]) =>
    computeIncomeAndNoi(c.tenancies, outgoings.filter((o) => o.commercialPropertyId === c.id)).noi;

  // Each person's income, with their share of rent from what they own.
  const incomes: IncomeInput[] = people.map((p) => {
    const e = p.entityId;
    let rent = 0;
    if (e) {
      for (const r of properties) if (r.asset.mainResidence !== "FULL") rent += (r.weeklyRent ?? 0) * 52 * shareOf(r.asset, e);
      for (const c of commercial) rent += Math.max(0, netRentOf(c)) * shareOf(c.asset, e);
    }
    return { name: p.name, salary: p.grossSalary ?? 0, variable: p.variableIncome ?? 0, rent };
  });

  // Their debts: every loan or card any of them is a borrower on, in full.
  const now = Date.now();
  const debts: DebtInput[] = liabilities
    .filter((l) => l.liabilityType !== "LRBA_LOAN")
    .filter((l) => mine.has(l.entityId) || l.ownerships.some((o) => mine.has(o.ownerEntityId)))
    .map((l) => ({
      name: l.name,
      balance: l.currentBalance ?? 0,
      ratePct: l.interestRate,
      remainingYears: l.maturityDate ? Math.max(1, (l.maturityDate.getTime() - now) / (365.25 * 86_400_000)) : null,
      cardLimit: l.liabilityType === "CREDIT_CARD" ? (l.creditLimit ?? l.currentBalance ?? 0) : null,
    }));

  return { people, mine, properties, commercial, typeOf, netRentOf, incomes, debts };
}
