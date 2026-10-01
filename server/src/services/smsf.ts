import { prisma } from "../db.js";
import { fyLabelFor, fyRange, fyStartYear, pensionYear, shiftFy } from "./superRules.js";

/**
 * SMSF compliance dates — annual return, auditor appointment, investment
 * strategy review, the corporate trustee's ASIC review, pension minimums
 * and transfer balance reporting. Shown on the fund's page and fed into the
 * expiry calendar.
 */

export interface SmsfDate {
  key: string;
  date: Date;
  title: string;
  detail: string | null;
}

const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

interface FundForDates {
  id: string;
  name: string;
  establishmentDate: Date | null;
  smsfDetails: {
    lodgedBy: string | null;
    lastReturnLodged: string | null;
    returnDueDate: Date | null;
    strategyReviewedOn: Date | null;
    trusteeType: string | null;
    corporateTrustee: { name: string; establishmentDate: Date | null } | null;
  } | null;
}

/** The year whose annual return is next to be done. */
export function nextReturnYear(fund: FundForDates, today: Date): string {
  const last = fund.smsfDetails?.lastReturnLodged;
  if (last) return shiftFy(last, 1);
  const lastEnded = shiftFy(fyLabelFor(today), -1);
  const first = fund.establishmentDate ? fyLabelFor(fund.establishmentDate) : lastEnded;
  return first > lastEnded ? first : lastEnded;
}

/**
 * The usual due date: 28 February for a new fund's first return, 31 October
 * when the trustees lodge it themselves, 15 May when a tax agent does. The
 * agent can confirm; a date entered on the fund overrides this.
 */
export function returnDueDate(fund: FundForDates, year: string): { date: Date; basis: string } {
  const d = fund.smsfDetails;
  const endYear = fyStartYear(year) + 1;
  // Cleared whenever a return is marked done, so it only ever applies to the next one.
  if (d?.returnDueDate) return { date: d.returnDueDate, basis: "the date you entered" };
  if (fund.establishmentDate && fyLabelFor(fund.establishmentDate) === year) {
    return { date: utc(endYear + 1, 1, 28), basis: "a new fund's first return" };
  }
  if (d?.lodgedBy === "SELF") return { date: utc(endYear, 9, 31), basis: "lodged by the trustees" };
  return { date: utc(endYear + 1, 4, 15), basis: "lodged by a tax agent — they can confirm the date" };
}

/** Next anniversary of `date` on or after `from`. */
function nextAnniversary(date: Date, from: Date): Date {
  let y = from.getUTCFullYear();
  let next = utc(y, date.getUTCMonth(), date.getUTCDate());
  if (next < from) next = utc(++y, date.getUTCMonth(), date.getUTCDate());
  return next;
}

export function fundDates(fund: FundForDates, today: Date): SmsfDate[] {
  const out: SmsfDate[] = [];
  const year = nextReturnYear(fund, today);
  const due = returnDueDate(fund, year);
  out.push({
    key: `return-${year}`,
    date: due.date,
    title: `Annual return for ${year} due — ${fund.name}`,
    detail: `Based on ${due.basis}. The fund must be audited before it's lodged.`,
  });
  out.push({
    key: `auditor-${year}`,
    date: new Date(due.date.getTime() - 45 * DAY),
    title: `Appoint the auditor for ${year} — ${fund.name}`,
    detail: "At least 45 days before the annual return is due.",
  });
  const reviewed = fund.smsfDetails?.strategyReviewedOn;
  if (reviewed) {
    out.push({
      key: "strategy",
      date: utc(reviewed.getUTCFullYear() + 1, reviewed.getUTCMonth(), reviewed.getUTCDate()),
      title: `Review the investment strategy — ${fund.name}`,
      detail: `Last reviewed ${reviewed.toISOString().slice(0, 10)}. Review it at least yearly and minute it.`,
    });
  }
  const company = fund.smsfDetails?.trusteeType === "CORPORATE" ? fund.smsfDetails.corporateTrustee : null;
  if (company?.establishmentDate) {
    out.push({
      key: "asic",
      date: nextAnniversary(company.establishmentDate, new Date(today.getTime() - 31 * DAY)),
      title: `ASIC annual review — ${company.name}`,
      detail: `Trustee company for ${fund.name}. Pay the review fee and check the company's details.`,
    });
  }
  return out;
}

/** Pensions report to the ATO within 28 days after the end of the quarter they start in. */
export function tbarDueDate(start: Date): Date {
  const quarterEndMonth = Math.floor(start.getUTCMonth() / 3) * 3 + 2;
  const quarterEnd = utc(start.getUTCFullYear(), quarterEndMonth + 1, 0);
  return new Date(quarterEnd.getTime() + 28 * DAY);
}

/** Every SMSF date that falls between `from` and `to`, for the expiry calendar. */
export async function smsfCalendarDates(from: Date, to: Date): Promise<Array<SmsfDate & { fundId: string }>> {
  const funds = await prisma.entity.findMany({
    where: { entityType: "SMSF" },
    include: {
      smsfDetails: { include: { corporateTrustee: { select: { name: true, establishmentDate: true } } } },
      smsfPensions: { include: { person: true, balances: true, payments: true } },
    },
  });
  const today = new Date();
  const out: Array<SmsfDate & { fundId: string }> = [];
  for (const fund of funds) {
    for (const d of fundDates(fund, today)) out.push({ ...d, fundId: fund.id });

    for (const p of fund.smsfPensions) {
      if (p.kind === "ACCOUNT_BASED") {
        out.push({
          key: `tbar-${p.id}`,
          fundId: fund.id,
          date: tbarDueDate(p.startDate),
          title: `Report ${p.person.name}'s pension start to the ATO — ${fund.name}`,
          detail: "Transfer balance account report (TBAR), through the ATO's online services or your tax agent.",
        });
      }
      // The minimum for each year ending in the range, if it isn't paid yet.
      for (let y = fyLabelFor(from); fyRange(y).end <= to; y = shiftFy(y, 1)) {
        const { start, end } = fyRange(y);
        if (end < from) continue;
        const opening = p.balances.find((b) => b.fyLabel === y)?.openingBalance ?? null;
        const py = pensionYear(p, y, opening, p.person.dateOfBirth);
        if (!py.active || !py.minimum) continue;
        const paid = p.payments.filter((x) => x.date >= start && x.date <= end).reduce((s, x) => s + x.amount, 0);
        if (paid >= py.minimum) continue;
        out.push({
          key: `pension-min-${p.id}-${y}`,
          fundId: fund.id,
          date: end,
          title: `Pay ${p.person.name}'s pension minimum by 30 June — ${fund.name}`,
          detail: `$${Math.round(py.minimum - paid).toLocaleString("en-AU")} still to pay for ${y}.`,
        });
      }
    }
  }
  return out.filter((d) => d.date >= from && d.date <= to);
}
