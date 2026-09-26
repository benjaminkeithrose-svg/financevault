import { prisma } from "../db.js";
import { shareOf } from "./ownership.js";
import { fyRange } from "./superRules.js";

/**
 * Debt allocation, stage 1 (IDEAS.md idea 2).
 *
 * Interest is deductible according to what the borrowed money was used for,
 * not what secures the loan (TR 95/25; TR 2000/2 paragraph 29). Each loan
 * records its uses; the deductible share is the part of the money borrowed
 * that went to producing assessable income. Repayments reduce every part in
 * proportion (TR 2000/2 paragraph 16), so the share holds until a redraw or
 * a sale changes it — those are stage 2, which applies the ATO's monthly
 * method (paragraphs 19-20) instead.
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
}

export interface PurposeSplit {
  total: number;
  deductible: number;
  private: number;
  /** Share of the loan's interest that's deductible, 0-1; null with nothing recorded. */
  deductibleShare: number | null;
  /** The deductible money by what it paid for, each with its share of the loan. */
  byUse: Array<{ purposeId: string; assetId: string | null; description: string; amount: number; share: number }>;
}

/** The split of a loan's money as at a date: uses dated after it don't count yet. */
export function purposeSplit(purposes: PurposeLike[], asAt?: Date): PurposeSplit {
  const counted = purposes.filter((p) => !asAt || !p.date || p.date <= asAt);
  const total = counted.reduce((s, p) => s + p.amount, 0);
  const deductible = counted.filter((p) => p.deductible).reduce((s, p) => s + p.amount, 0);
  return {
    total,
    deductible,
    private: total - deductible,
    deductibleShare: total > 0 ? deductible / total : null,
    byUse: counted
      .filter((p) => p.deductible)
      .map((p) => ({ purposeId: p.id, assetId: p.assetId, description: p.description, amount: p.amount, share: total > 0 ? p.amount / total : 0 })),
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
  const { end } = fyRange(fyLabel);
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
    const split = purposeSplit(loan.purposes, end);
    const d = deductibleInterest(y.interestCharged, split);
    const ownerIds = [...new Set([loan.entityId, ...loan.ownerships.map((o) => o.ownerEntityId)])];
    const owners = ownerIds
      .map((id) => ({ entityId: id, entityName: entities.get(id) ?? "Unknown", share: shareOf(loan, id, end) }))
      .filter((o) => o.share > 0)
      .map((o) => ({ ...o, deductibleInterest: d.deductible * o.share }));
    if (entityId && !owners.some((o) => o.entityId === entityId)) continue;
    const notes: string[] = [];
    if (split.deductibleShare === null) notes.push("No uses recorded for this loan, so nothing is counted as deductible.");
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
