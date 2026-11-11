import { prisma } from "../db.js";

/**
 * Money in and money out, month by month, from the bank transactions on
 * record — the income and living-expense figures a lender asks for.
 *
 * Moving money between your own accounts isn't income or spending, so a
 * payment out of one account matched by the same amount into another of
 * your accounts within three days is left out as a transfer.
 */

export interface CashTxn {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
}

const TRANSFER_WINDOW_DAYS = 3;

/** The ids of transactions that pair up as transfers between two of your own accounts. */
export function findTransfers(txns: CashTxn[]): Set<string> {
  const paired = new Set<string>();
  const cents = (v: number) => Math.round(Math.abs(v) * 100);
  // Money in, grouped by amount, earliest first.
  const ins = new Map<number, CashTxn[]>();
  for (const t of [...txns].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (t.amount <= 0) continue;
    const list = ins.get(cents(t.amount)) ?? [];
    list.push(t);
    ins.set(cents(t.amount), list);
  }
  const outs = txns.filter((t) => t.amount < 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const out of outs) {
    const match = (ins.get(cents(out.amount)) ?? []).find(
      (i) =>
        !paired.has(i.id) &&
        i.accountId !== out.accountId &&
        Math.abs(i.date.getTime() - out.date.getTime()) <= TRANSFER_WINDOW_DAYS * 86_400_000
    );
    if (match) {
      paired.add(match.id);
      paired.add(out.id);
    }
  }
  return paired;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function incomeAndSpending({ months = 12, entityId, today = new Date() }: { months?: number; entityId?: string; today?: Date }) {
  // Whole months only: the current month isn't over yet.
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));

  const accountWhere = entityId ? { OR: [{ entityId }, { ownerships: { some: { ownerEntityId: entityId } } }] } : {};
  const accounts = await prisma.account.findMany({ where: accountWhere, select: { id: true, accountName: true, institution: true } });
  // Transfers are looked for across every account, so money moved to an
  // account outside this person's list still counts as a transfer out.
  const allTxns = await prisma.transaction.findMany({
    where: { date: { gte: new Date(start.getTime() - TRANSFER_WINDOW_DAYS * 86_400_000), lt: new Date(end.getTime() + TRANSFER_WINDOW_DAYS * 86_400_000) } },
    select: { id: true, accountId: true, date: true, amount: true, taxCategory: { select: { name: true, group: true } } },
  });
  const transfers = findTransfers(allTxns);
  const included = new Set(accounts.map((a) => a.id));
  const inWindow = allTxns.filter((t) => included.has(t.accountId) && t.date >= start && t.date < end);

  const monthRows = new Map<string, { month: string; moneyIn: number; moneyOut: number }>();
  for (let i = 0; i < months; i++) {
    const key = monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)));
    monthRows.set(key, { month: key, moneyIn: 0, moneyOut: 0 });
  }
  const categories = new Map<string, { name: string; group: string; moneyIn: number; moneyOut: number }>();
  let transferCount = 0;
  let firstDate: Date | null = null;

  for (const t of inWindow) {
    if (transfers.has(t.id)) {
      transferCount++;
      continue;
    }
    if (!firstDate || t.date < firstDate) firstDate = t.date;
    const row = monthRows.get(monthKey(t.date))!;
    const name = t.taxCategory?.name ?? "Not categorised";
    const cat = categories.get(name) ?? { name, group: t.taxCategory?.group ?? "NONE", moneyIn: 0, moneyOut: 0 };
    if (t.amount > 0) {
      row.moneyIn += t.amount;
      cat.moneyIn += t.amount;
    } else {
      row.moneyOut += -t.amount;
      cat.moneyOut += -t.amount;
    }
    categories.set(name, cat);
  }

  // Average over the months that have records, from the first one on — a
  // year's average from three months of statements would understate both.
  const rows = [...monthRows.values()].map((r) => ({ ...r, net: r.moneyIn - r.moneyOut }));
  const firstKey = firstDate ? monthKey(firstDate) : null;
  const covered = firstKey ? rows.filter((r) => r.month >= firstKey) : [];
  const n = covered.length || 1;
  const totalIn = covered.reduce((s, r) => s + r.moneyIn, 0);
  const totalOut = covered.reduce((s, r) => s + r.moneyOut, 0);
  const round = (v: number) => Math.round(v * 100) / 100;

  return {
    from: start.toISOString(),
    to: new Date(end.getTime() - 86_400_000).toISOString(),
    accounts: accounts.map((a) => ({ id: a.id, name: `${a.institution} ${a.accountName}` })),
    months: rows.map((r) => ({ month: r.month, moneyIn: round(r.moneyIn), moneyOut: round(r.moneyOut), net: round(r.net) })),
    monthsCovered: covered.length,
    averageMonthlyIn: round(totalIn / n),
    averageMonthlyOut: round(totalOut / n),
    averageMonthlyNet: round((totalIn - totalOut) / n),
    byCategory: [...categories.values()]
      .map((c) => ({ ...c, moneyIn: round(c.moneyIn), moneyOut: round(c.moneyOut) }))
      .sort((a, b) => b.moneyIn + b.moneyOut - (a.moneyIn + a.moneyOut)),
    transfersLeftOut: transferCount,
    note:
      "From the bank transactions on record. A payment matched by the same amount into another of your accounts within three days is treated as a transfer and left out. Averages cover the months from the first transaction on record.",
  };
}
