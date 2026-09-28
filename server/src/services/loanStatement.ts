import { convertRows, inspectCsv, parseAmount, parseDate, readRows } from "./bankCsv.js";
import { financialYearLabelForDate } from "./financialYear.js";

// Reading a loan statement: the balance and the date it's for, the interest
// rate (and any rate changes it lists), the repayment, and the interest
// charged — from the text the app already reads out of a PDF or photo, or
// from a CSV of the loan account's transactions.
//
// Heuristic, like the lease reader: it proposes figures for the person to
// tick and apply, and never writes to the loan by itself. Built around the
// wording Australian lenders commonly use (ANZ, CommBank, NAB, Westpac, ING,
// Macquarie, Bankwest); anything it can't find is reported as not found.

export interface StatementReading {
  periodStart: Date | null;
  periodEnd: Date | null;
  /** The date the balance is for. */
  asAt: Date | null;
  balance: number | null;
  /** Percent a year, e.g. 6.14. */
  interestRate: number | null;
  repayment: number | null;
  repaymentFrequency: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | null;
  /** Interest charged over the statement's period. */
  interestCharged: number | null;
  /** The whole financial year's interest, when the statement gives it. */
  financialYear: { fyLabel: string; interest: number } | null;
  /** Rate changes the statement lists, oldest first. */
  rateChanges: Array<{ date: Date; rate: number }>;
  found: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const DATE_SOURCE =
  String.raw`(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})` + // 01/07/2025
  String.raw`|(\d{1,2})[\s-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?,?[\s-]+(\d{4})` + // 1 Jul 2025, 01-July-2025
  String.raw`|(\d{4})-(\d{2})-(\d{2})`; // 2025-07-01

function dateFrom(m: RegExpMatchArray): Date | null {
  let y: number, mo: number, d: number;
  if (m[1]) {
    d = Number(m[1]);
    mo = Number(m[2]) - 1;
    y = Number(m[3]);
    if (y < 100) y += 2000;
  } else if (m[4]) {
    d = Number(m[4]);
    mo = MONTHS[m[5].toLowerCase().slice(0, 3)];
    y = Number(m[6]);
  } else {
    y = Number(m[7]);
    mo = Number(m[8]) - 1;
    d = Number(m[9]);
  }
  if (!(mo >= 0 && mo <= 11) || d < 1 || d > 31 || y < 1980 || y > 2100) return null;
  return new Date(Date.UTC(y, mo, d));
}

function datesIn(text: string): Array<{ date: Date; index: number }> {
  const out: Array<{ date: Date; index: number }> = [];
  for (const m of text.matchAll(new RegExp(DATE_SOURCE, "gi"))) {
    const date = dateFrom(m);
    if (date) out.push({ date, index: m.index ?? 0 });
  }
  return out;
}

// Money: "$350,000.00", "350,000.00 DR", "-$1,234.56", "$2,300" — a bare
// number counts only with cents or thousands commas, so years and account
// numbers aren't taken for amounts.
const MONEY = /(-)?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(-)?\b(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\b/g;

function moneyIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY)) {
    const raw = (m[2] ?? m[4]).replace(/,/g, "");
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

const PERCENT = /(\d{1,2}(?:\.\d{1,3})?)\s*%/g;
function percentsIn(text: string): number[] {
  return [...text.matchAll(PERCENT)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 30);
}

function lines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

/** The first value of a kind after a label: on the label's own line, else on the next line. */
function after<T>(ls: string[], labels: RegExp[], pick: (s: string) => T[], skip?: RegExp): T | null {
  for (const label of labels) {
    for (let i = 0; i < ls.length; i++) {
      const m = ls[i].match(label);
      if (!m || (skip && skip.test(ls[i]))) continue;
      const rest = ls[i].slice((m.index ?? 0) + m[0].length);
      const same = pick(rest);
      if (same.length) return same[0];
      if (i + 1 < ls.length) {
        const next = pick(ls[i + 1]);
        if (next.length) return next[0];
      }
    }
  }
  return null;
}

const BALANCE_LABELS = [
  /closing balance/i,
  /balance (?:as )?at(?! the start)/i,
  /loan balance/i,
  /balance owing/i,
  /amount owing/i,
  /outstanding balance/i,
  /current balance/i,
];
const RATE_LABELS = [/current (?:variable |fixed )?interest rate/i, /your (?:current )?(?:interest )?rate/i, /interest rate/i, /(?:variable|fixed) rate/i, /annual percentage rate/i];
const REPAYMENT_LABELS = [/(?:minimum |required |scheduled |next )?(?:monthly |fortnightly |weekly )?repayment(?: amount)?/i];
const INTEREST_LABELS = [/total interest (?:charged|debited)/i, /interest charged/i, /interest debited/i, /interest (?:paid|charged) this (?:period|statement)/i, /total interest/i];
const FY_INTEREST = /interest (?:charged|paid|debited)[^\n]*?(?:financial year|this year|20\d{2}\s*[\/-]\s*\d{2,4}|1 ?jul)/i;

export function readLoanStatement(text: string): StatementReading {
  const ls = lines(text);
  const found: string[] = [];

  // The statement's period.
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  for (const l of ls) {
    if (!/period|from|statement (?:date|covers)|^\s*\d/i.test(l)) continue;
    const ds = datesIn(l);
    if (ds.length >= 2 && /(to|–|-|until|through)/i.test(l.slice(ds[0].index, ds[1].index + 1))) {
      periodStart = ds[0].date;
      periodEnd = ds[1].date;
      if (periodEnd < periodStart) [periodStart, periodEnd] = [periodEnd, periodStart];
      break;
    }
  }
  if (periodStart) found.push("period");

  // The balance, and the date it's for.
  const balance = after(ls, BALANCE_LABELS, moneyIn, /opening balance/i);
  if (balance !== null) found.push("balance");
  const asAtLine = ls.find((l) => /(balance (?:as )?at|as at|statement date|closing date)/i.test(l) && datesIn(l).length);
  const asAt = asAtLine ? datesIn(asAtLine).slice(-1)[0].date : periodEnd;

  // Rate changes the statement lists: "changed from 6.39% to 6.14% on 12 Feb 2026",
  // or a line with a date and "rate change" and a rate.
  const rateChanges: Array<{ date: Date; rate: number }> = [];
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    const change = l.match(/(?:from\s*)?(\d{1,2}(?:\.\d{1,3})?)\s*%[^%]*?\bto\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i);
    const isChange = change || /rate change|rate (?:increase|decrease|adjustment)|new (?:interest )?rate/i.test(l);
    if (!isChange) continue;
    const ds = datesIn(l).length ? datesIn(l) : datesIn(ls[i + 1] ?? "");
    const rate = change ? Number(change[2]) : percentsIn(l).slice(-1)[0];
    if (ds.length && rate) rateChanges.push({ date: ds[ds.length - 1].date, rate });
  }
  rateChanges.sort((a, b) => a.date.getTime() - b.date.getTime());

  let interestRate = after(ls, RATE_LABELS, percentsIn, /change|from .*% to/i);
  if (rateChanges.length && (interestRate === null || (periodEnd && rateChanges[rateChanges.length - 1].date <= periodEnd))) {
    interestRate = interestRate ?? rateChanges[rateChanges.length - 1].rate;
  }
  if (interestRate !== null) found.push("interest rate");
  if (rateChanges.length) found.push("rate changes");

  // The repayment, and how often.
  const repayment = after(ls, REPAYMENT_LABELS, moneyIn, /total repayments|repayments (?:made|received)|redraw/i);
  let repaymentFrequency: StatementReading["repaymentFrequency"] = null;
  const repLine = ls.find((l) => REPAYMENT_LABELS[0].test(l) && !/total repayments|repayments (?:made|received)/i.test(l)) ?? "";
  if (/fortnight/i.test(repLine)) repaymentFrequency = "FORTNIGHTLY";
  else if (/week/i.test(repLine)) repaymentFrequency = "WEEKLY";
  else if (/month/i.test(repLine)) repaymentFrequency = "MONTHLY";
  if (repayment !== null) found.push("repayment");

  // Interest charged over the period, and the financial year's when it's given.
  const interestCharged = after(ls, INTEREST_LABELS, moneyIn, /rate/i);
  if (interestCharged !== null) found.push("interest charged");
  let financialYear: StatementReading["financialYear"] = null;
  const fyLine = ls.findIndex((l) => FY_INTEREST.test(l));
  if (fyLine >= 0) {
    const amounts = moneyIn(ls[fyLine].replace(/20\d{2}\s*[\/-]\s*\d{2,4}/g, ""));
    const amount = amounts.length ? amounts[amounts.length - 1] : moneyIn(ls[fyLine + 1] ?? "")[0];
    const labelMatch = ls[fyLine].match(/(20\d{2})\s*[\/-]\s*(\d{2,4})/);
    const fyLabel = labelMatch
      ? `${labelMatch[1]}-${labelMatch[2].slice(-2)}`
      : periodEnd
        ? financialYearLabelForDate(periodEnd)
        : null;
    if (amount && fyLabel) financialYear = { fyLabel, interest: amount };
  }
  // A statement covering exactly 1 July to 30 June: its interest is the year's.
  if (!financialYear && interestCharged !== null && periodStart && periodEnd) {
    const startsJuly1 = periodStart.getUTCMonth() === 6 && periodStart.getUTCDate() === 1;
    const endsJune30 = periodEnd.getUTCMonth() === 5 && periodEnd.getUTCDate() === 30 && periodEnd.getUTCFullYear() === periodStart.getUTCFullYear() + 1;
    if (startsJuly1 && endsJune30) financialYear = { fyLabel: financialYearLabelForDate(periodStart), interest: interestCharged };
  }
  if (financialYear) found.push("financial year's interest");

  return { periodStart, periodEnd, asAt, balance, interestRate, repayment, repaymentFrequency, interestCharged, financialYear, rateChanges, found };
}

export interface CsvLoanReading {
  asAt: Date | null;
  balance: number | null;
  /** Interest debited, by financial year. */
  interestByYear: Array<{ fyLabel: string; interest: number; complete: boolean }>;
  rows: number;
  found: string[];
}

/** A CSV of the loan account's transactions: interest by financial year, and the latest balance. */
export function readLoanCsv(text: string): CsvLoanReading {
  const inspection = inspectCsv(text);
  const { rows } = convertRows(text, inspection.proposed);
  const found: string[] = [];
  const byYear = new Map<string, { interest: number; first: Date; last: Date }>();
  for (const r of rows) {
    if (!/interest/i.test(r.description) || /offset|refund|reversal/i.test(r.description)) continue;
    const fy = financialYearLabelForDate(r.date);
    const e = byYear.get(fy) ?? { interest: 0, first: r.date, last: r.date };
    e.interest += Math.abs(r.amount);
    if (r.date < e.first) e.first = r.date;
    if (r.date > e.last) e.last = r.date;
    byYear.set(fy, e);
  }
  const interestByYear = [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fyLabel, e]) => ({
      fyLabel,
      interest: Math.round(e.interest * 100) / 100,
      // Interest is charged monthly: a year with its July and June charges is whole.
      complete: e.first.getUTCMonth() === 6 && e.last.getUTCMonth() === 5,
    }));
  if (interestByYear.length) found.push("interest by year");

  // The balance column, from the latest row.
  let balance: number | null = null;
  let asAt: Date | null = null;
  const headers = inspection.headers;
  const balanceCol = headers ? headers.findIndex((h) => /balance/i.test(h)) : -1;
  if (balanceCol >= 0) {
    const raw = readRows(text).slice(inspection.proposed.hasHeaderRow ? 1 : 0);
    let best: { date: Date; value: number } | null = null;
    raw.forEach((cells) => {
      const value = parseAmount(cells[balanceCol]);
      const date = parseDate(cells[inspection.proposed.dateColumn], inspection.proposed.dateFormat);
      if (value === null || !date) return;
      if (!best || date >= best.date) best = { date, value: Math.abs(value) };
    });
    if (best) {
      balance = (best as { value: number }).value;
      asAt = (best as { date: Date }).date;
      found.push("balance");
    }
  }
  if (!asAt && rows.length) asAt = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0].date);
  return { asAt, balance, interestByYear, rows: rows.length, found };
}
