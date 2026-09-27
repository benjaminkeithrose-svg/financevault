import { prisma } from "../db.js";
import { shareOf } from "./ownership.js";
import { fyRange } from "./superRules.js";

/**
 * Debt allocation (IDEAS.md idea 2).
 *
 * Interest is deductible according to what the borrowed money was used for,
 * not what secures the loan (TR 95/25; TR 2000/2 paragraph 29). Each loan
 * records its uses; the deductible share is the part of what's owed that
 * went to producing assessable income.
 *
 * Repayments come off every use in proportion (TR 2000/2 paragraph 16), so
 * the share holds until more is borrowed. A redraw or increase is new
 * borrowing for whatever it's used for (paragraphs 22-25): recorded with the
 * balance just before it, the earlier uses are scaled down to that balance
 * in proportion and the new money added — so a loan partly repaid and then
 * redrawn for something else is split the way the ruling describes.
 * Over a year, the share is weighted by balance and days, since interest
 * accrues daily on the balance (paragraph 16).
 */

export const LOAN_USES = ["PROPERTY", "SHARES", "BUSINESS", "PRIVATE", "OTHER"] as const;

/** Used for when no lender maximum is recorded on a property. */
export const DEFAULT_LENDER_MAX_LVR = 0.8;

export interface PurposeLike {
  id: string;
  date: Date | null;
  amount: number;
  deductible: boolean;
  assetId: string | null;
  description: string;
  /** A redraw or increase: what was owed just before it. */
  balanceBefore?: number | null;
}

export interface PurposeSplit {
  /** What's owed, as the uses account for it (after proportional repayments before any redraw). */
  total: number;
  deductible: number;
  private: number;
  /** Share of the loan's interest that's deductible, 0-1; null with nothing recorded. */
  deductibleShare: number | null;
  /** The deductible money by what it paid for, each with its share of the loan. */
  byUse: Array<{ purposeId: string; assetId: string | null; description: string; amount: number; share: number }>;
}

const DAY = 86_400_000;

/** Uses in the order they happened; undated ones (the original borrowing) first. */
function inOrder<T extends PurposeLike>(purposes: T[]): T[] {
  return purposes
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.date?.getTime() ?? -Infinity) - (b.p.date?.getTime() ?? -Infinity) || a.i - b.i)
    .map((x) => x.p);
}

/** What each use accounts for of the balance, as at a date. */
function outstanding(purposes: PurposeLike[], asAt?: Date): Array<{ p: PurposeLike; value: number }> {
  const parts: Array<{ p: PurposeLike; value: number }> = [];
  for (const p of inOrder(purposes)) {
    if (asAt && p.date && p.date > asAt) break;
    const sum = parts.reduce((s, x) => s + x.value, 0);
    // Repaid before this redraw: every earlier use reduced in proportion.
    if (p.balanceBefore != null && sum > 0) {
      const f = Math.max(0, Math.min(p.balanceBefore, sum)) / sum;
      for (const x of parts) x.value *= f;
    }
    parts.push({ p, value: p.amount });
  }
  return parts;
}

/** The split of a loan's money as at a date: uses dated after it don't count yet. */
export function purposeSplit(purposes: PurposeLike[], asAt?: Date): PurposeSplit {
  const parts = outstanding(purposes, asAt);
  const total = parts.reduce((s, x) => s + x.value, 0);
  const deductible = parts.filter((x) => x.p.deductible).reduce((s, x) => s + x.value, 0);
  return {
    total,
    deductible,
    private: total - deductible,
    deductibleShare: total > 0 ? deductible / total : null,
    byUse: parts
      .filter((x) => x.p.deductible)
      .map((x) => ({ purposeId: x.p.id, assetId: x.p.assetId, description: x.p.description, amount: x.value, share: total > 0 ? x.value / total : 0 })),
  };
}

/** Deductible for part of what it's owed and private for the rest. */
export function isMixed(split: PurposeSplit): boolean {
  return split.deductibleShare !== null && split.deductibleShare > 0.0001 && split.deductibleShare < 0.9999;
}

/**
 * The split over a financial year: each stretch between redraws weighted by
 * its balance and its days — the way interest accrues. Null when nothing
 * was borrowed in the year.
 */
export function yearSplit(purposes: PurposeLike[], start: Date, end: Date): (PurposeSplit & { changedDuring: Date[] }) | null {
  const changes = inOrder(purposes)
    .map((p) => p.date)
    .filter((d): d is Date => !!d && d > start && d <= end);
  const bounds = [start, ...changes, end];
  let weight = 0;
  let deductibleWeight = 0;
  const byUse = new Map<string, { purposeId: string; assetId: string | null; description: string; amount: number; weight: number }>();
  for (let i = 0; i < bounds.length - 1; i++) {
    const days = (bounds[i + 1].getTime() - bounds[i].getTime()) / DAY;
    if (days <= 0) continue;
    const split = purposeSplit(purposes, bounds[i]);
    if (split.total <= 0) continue;
    weight += split.total * days;
    deductibleWeight += split.deductible * days;
    for (const u of split.byUse) {
      const e = byUse.get(u.purposeId) ?? { ...u, weight: 0 };
      e.weight += u.amount * days;
      e.amount = u.amount;
      byUse.set(u.purposeId, e);
    }
  }
  const atEnd = purposeSplit(purposes, end);
  if (weight <= 0) return atEnd.total > 0 ? { ...atEnd, changedDuring: changes } : null;
  return {
    ...atEnd,
    deductibleShare: deductibleWeight / weight,
    byUse: [...byUse.values()].map((u) => ({ purposeId: u.purposeId, assetId: u.assetId, description: u.description, amount: u.amount, share: u.weight / weight })),
    changedDuring: changes,
  };
}

/** The interest statement's figure split by use: what's deductible, and against what. */
export function deductibleInterest(interestCharged: number, split: PurposeSplit) {
  const share = split.deductibleShare ?? 0;
  return {
    deductible: interestCharged * share,
    private: interestCharged * (1 - share),
    byUse: split.byUse.map((u) => ({ ...u, interest: interestCharged * u.share })),
  };
}

/** What a lender might let you borrow against a property now, less what's owed on it. */
export function usableEquity(value: number | null, maxLvr: number | null, owing: number) {
  if (!value) return null;
  const lvr = maxLvr ?? DEFAULT_LENDER_MAX_LVR;
  const limit = value * lvr;
  return { value, maxLvr: lvr, maxLvrAssumed: maxLvr === null, limit, owing, usable: Math.max(0, limit - owing) };
}

export interface ScheduleRow {
  liabilityId: string;
  loanName: string;
  facility: string | null;
  lender: string | null;
  interestCharged: number;
  statementDocumentId: string | null;
  deductibleShare: number | null;
  deductibleInterest: number;
  privateInterest: number;
  byUse: Array<{ description: string; assetId: string | null; assetName: string | null; interest: number }>;
  owners: Array<{ entityId: string; entityName: string; share: number; deductibleInterest: number }>;
  notes: string[];
}

/**
 * The deductible-interest schedule for a financial year: every loan with an
 * interest figure recorded for it, split by use and by borrower.
 */
export async function interestSchedule(fyLabel: string, entityId?: string): Promise<ScheduleRow[]> {
  const { start, end } = fyRange(fyLabel);
  const years = await prisma.loanInterestYear.findMany({
    where: { fyLabel },
    include: {
      liability: {
        include: { purposes: { include: { asset: { select: { name: true } } } }, ownerships: true, entity: { select: { name: true } } },
      },
    },
  });
  const entities = new Map((await prisma.entity.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const rows: ScheduleRow[] = [];
  for (const y of years) {
    const loan = y.liability;
    const year = yearSplit(loan.purposes, start, end);
    const split = year ?? purposeSplit(loan.purposes, end);
    const d = deductibleInterest(y.interestCharged, split);
    const ownerIds = [...new Set([loan.entityId, ...loan.ownerships.map((o) => o.ownerEntityId)])];
    const owners = ownerIds
      .map((id) => ({ entityId: id, entityName: entities.get(id) ?? "Unknown", share: shareOf(loan, id, end) }))
      .filter((o) => o.share > 0)
      .map((o) => ({ ...o, deductibleInterest: d.deductible * o.share }));
    if (entityId && !owners.some((o) => o.entityId === entityId)) continue;
    const notes: string[] = [];
    if (split.deductibleShare === null) notes.push("No uses recorded for this loan, so nothing is counted as deductible.");
    if (year?.changedDuring.length) {
      notes.push(
        `Borrowed more during the year (${year.changedDuring.map((d) => d.toISOString().slice(0, 10)).join(", ")}): the share is weighted by balance and days.`
      );
    }
    const names = new Map(loan.purposes.map((p) => [p.id, p.asset?.name ?? null]));
    rows.push({
      liabilityId: loan.id,
      loanName: loan.name,
      facility: loan.facility,
      lender: loan.lender,
      interestCharged: y.interestCharged,
      statementDocumentId: y.documentId,
      deductibleShare: split.deductibleShare,
      deductibleInterest: d.deductible,
      privateInterest: d.private,
      byUse: d.byUse.map((u) => ({ description: u.description, assetId: u.assetId, assetName: names.get(u.purposeId) ?? null, interest: u.interest })),
      owners,
      notes,
    });
  }
  return rows.sort((a, b) => (a.facility ?? a.loanName).localeCompare(b.facility ?? b.loanName) || a.loanName.localeCompare(b.loanName));
}

/** The schedule as CSV rows for an Accountant Pack, from one borrower's side. */
export function scheduleCsvRows(rows: ScheduleRow[], entityId: string): string[][] {
  const out: string[][] = [["Loan", "Facility", "Lender", "Interest charged (whole loan)", "Deductible share", "Your share of the loan", "Your deductible interest", "Used for"]];
  for (const r of rows) {
    const me = r.owners.find((o) => o.entityId === entityId);
    if (!me) continue;
    out.push([
      r.loanName,
      r.facility ?? "",
      r.lender ?? "",
      r.interestCharged.toFixed(2),
      r.deductibleShare === null ? "not recorded" : `${(r.deductibleShare * 100).toFixed(2)}%`,
      `${(me.share * 100).toFixed(2)}%`,
      me.deductibleInterest.toFixed(2),
      r.byUse.map((u) => `${u.assetName ?? u.description}: ${(u.interest * me.share).toFixed(2)}`).join("; "),
    ]);
  }
  return out;
}
