/**
 * Australian super rules the SMSF pages check against: contribution caps
 * (with carry-forward and bring-forward), the transfer balance cap and
 * pension minimum drawdowns. Pure functions over plain numbers so they can
 * be tested directly; routes/smsf.ts gathers the figures.
 *
 * These are organising aids, not advice — every figure on screen says what
 * it's based on, and the caps table needs a new row each July.
 */

export interface YearRules {
  concessional: number;
  nonConcessional: number;
  transferBalanceCap: number;
}

// ATO key super rates and thresholds. A year after the last row uses the
// last row's figures and is reported as `known: false`.
const RULES: Array<[string, YearRules]> = [
  ["2017-18", { concessional: 25_000, nonConcessional: 100_000, transferBalanceCap: 1_600_000 }],
  ["2018-19", { concessional: 25_000, nonConcessional: 100_000, transferBalanceCap: 1_600_000 }],
  ["2019-20", { concessional: 25_000, nonConcessional: 100_000, transferBalanceCap: 1_600_000 }],
  ["2020-21", { concessional: 25_000, nonConcessional: 100_000, transferBalanceCap: 1_600_000 }],
  ["2021-22", { concessional: 27_500, nonConcessional: 110_000, transferBalanceCap: 1_700_000 }],
  ["2022-23", { concessional: 27_500, nonConcessional: 110_000, transferBalanceCap: 1_700_000 }],
  ["2023-24", { concessional: 27_500, nonConcessional: 110_000, transferBalanceCap: 1_900_000 }],
  ["2024-25", { concessional: 30_000, nonConcessional: 120_000, transferBalanceCap: 1_900_000 }],
  ["2025-26", { concessional: 30_000, nonConcessional: 120_000, transferBalanceCap: 2_000_000 }],
  ["2026-27", { concessional: 32_500, nonConcessional: 130_000, transferBalanceCap: 2_100_000 }],
];

/** Unused concessional cap can be carried forward only while the total super balance is under this. */
export const CARRY_FORWARD_TSB_LIMIT = 500_000;
const FIRST_CARRY_FORWARD_YEAR = "2018-19"; // the first year whose unused cap can be carried

// --- Financial years ---------------------------------------------------------

export function fyLabelFor(date: Date): string {
  const y = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyStartYear(label: string): number {
  return Number(label.slice(0, 4));
}

export function shiftFy(label: string, years: number): string {
  const start = fyStartYear(label) + years;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyRange(label: string): { start: Date; end: Date } {
  const y = fyStartYear(label);
  return { start: new Date(Date.UTC(y, 6, 1)), end: new Date(Date.UTC(y + 1, 5, 30)) };
}

export function rulesFor(label: string): YearRules & { known: boolean } {
  const found = RULES.find(([l]) => l === label);
  if (found) return { ...found[1], known: true };
  const [first, last] = [RULES[0], RULES[RULES.length - 1]];
  return { ...(label < first[0] ? first[1] : last[1]), known: false };
}

/** Age in whole years on a date. */
export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

// --- Contributions -------------------------------------------------------------

export type ContributionKind = "CONCESSIONAL" | "NON_CONCESSIONAL" | "EXCLUDED";

/** Where the money came from decides which cap it counts against. */
export const CONTRIBUTION_SOURCES: Record<string, ContributionKind> = {
  EMPLOYER: "CONCESSIONAL", // super guarantee and other employer amounts
  SALARY_SACRIFICE: "CONCESSIONAL",
  PERSONAL_DEDUCTED: "CONCESSIONAL", // personal, with a notice of intent to claim a deduction
  PERSONAL: "NON_CONCESSIONAL", // after-tax, no deduction claimed
  SPOUSE: "NON_CONCESSIONAL",
  DOWNSIZER: "EXCLUDED", // doesn't count towards either cap
  OTHER_EXCLUDED: "EXCLUDED", // e.g. CGT small business amounts
};

export function contributionKind(source: string): ContributionKind {
  return CONTRIBUTION_SOURCES[source] ?? "NON_CONCESSIONAL";
}

export interface CapHistory {
  /** Totals by year label, from every contribution recorded for the person. */
  concessional: Record<string, number>;
  nonConcessional: Record<string, number>;
  /** Total super balance at 30 June of the year with this label, where recorded. */
  totalSuperBalance: Record<string, number>;
  dateOfBirth: Date | null;
  /** The earliest year with anything recorded; history before it isn't guessed at. */
  firstYear: string;
}

export interface ConcessionalStatus {
  cap: number;
  carryForward: number;
  available: number;
  used: number;
  remaining: number;
  notes: string[];
}

function yearsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let y = fyStartYear(from); y <= fyStartYear(to); y++) out.push(shiftFy(from, y - fyStartYear(from)));
  return out;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

export function concessionalStatus(year: string, h: CapHistory): ConcessionalStatus {
  // Unused cap by year, used up oldest first by later years that went over.
  const unused = new Map<string, number>();
  const from = h.firstYear < year ? h.firstYear : year;
  let result: ConcessionalStatus | null = null;

  for (const y of yearsBetween(from, year)) {
    const cap = rulesFor(y).concessional;
    const used = h.concessional[y] ?? 0;
    const tsbPrior = h.totalSuperBalance[shiftFy(y, -1)];
    const window = [...unused.keys()].filter((u) => u >= shiftFy(y, -5) && u < y);
    const carry = window.reduce((s, u) => s + (unused.get(u) ?? 0), 0);
    const canCarry = y > FIRST_CARRY_FORWARD_YEAR && tsbPrior !== undefined && tsbPrior < CARRY_FORWARD_TSB_LIMIT;

    if (y === year) {
      const notes: string[] = [];
      if (y > FIRST_CARRY_FORWARD_YEAR) {
        if (tsbPrior === undefined) {
          if (carry > 0) {
            notes.push(
              `Up to ${money(carry)} of unused cap from earlier years may be available — record the total super balance at 30 June ${fyStartYear(y)} to check.`
            );
          }
        } else if (tsbPrior >= CARRY_FORWARD_TSB_LIMIT) {
          // Only worth saying when it matters: they've gone over this year's cap.
          if (used > cap) {
            notes.push(`No carry-forward this year: total super balance at 30 June ${fyStartYear(y)} was ${money(tsbPrior)} (it must be under $500,000).`);
          }
        } else if (carry > 0) {
          notes.push(`Includes ${money(carry)} of unused cap carried forward from earlier years, based on contributions recorded here.`);
        }
      }
      const carryForward = canCarry ? carry : 0;
      result = { cap, carryForward, available: cap + carryForward, used, remaining: cap + carryForward - used, notes };
      break;
    }

    if (used <= cap) {
      if (y >= FIRST_CARRY_FORWARD_YEAR) unused.set(y, cap - used);
    } else if (canCarry) {
      let excess = used - cap;
      for (const u of window.sort()) {
        const take = Math.min(excess, unused.get(u) ?? 0);
        unused.set(u, (unused.get(u) ?? 0) - take);
        excess -= take;
        if (excess <= 0) break;
      }
    }
  }
  return result!;
}

export interface NonConcessionalStatus {
  annualCap: number;
  /** The most that can go in this year, bringing forward future years' caps where allowed. */
  maxThisYear: number;
  bringForward: { startYear: string; years: number; total: number; usedBefore: number } | null;
  used: number;
  remaining: number;
  notes: string[];
}

/** How many years' caps can be brought forward, from the total super balance at the previous 30 June. */
export function bringForwardYears(tsbPrior: number, annualCap: number, transferBalanceCap: number): number {
  if (tsbPrior >= transferBalanceCap) return 0;
  if (tsbPrior >= transferBalanceCap - annualCap) return 1;
  if (tsbPrior >= transferBalanceCap - 2 * annualCap) return 2;
  return 3;
}

export function nonConcessionalStatus(year: string, h: CapHistory): NonConcessionalStatus {
  let period: { startYear: string; years: number; total: number; used: number } | null = null;
  const from = h.firstYear < year ? h.firstYear : year;

  for (const y of yearsBetween(from, year)) {
    const r = rulesFor(y);
    const used = h.nonConcessional[y] ?? 0;
    const tsbPrior = h.totalSuperBalance[shiftFy(y, -1)];
    const age = h.dateOfBirth ? ageOn(h.dateOfBirth, fyRange(y).start) : null;
    const inPeriod = period !== null && fyStartYear(y) < fyStartYear(period.startYear) + period.years;
    if (!inPeriod) period = null;

    if (y === year) {
      const notes: string[] = [];
      if (period) {
        const left = period.total - period.used;
        notes.push(
          `In a bring-forward period that started in ${period.startYear}: ${money(period.total)} over ${period.years} years, ${money(period.used)} used before this year.`
        );
        return {
          annualCap: r.nonConcessional,
          maxThisYear: left,
          bringForward: { startYear: period.startYear, years: period.years, total: period.total, usedBefore: period.used },
          used,
          remaining: left - used,
          notes,
        };
      }
      if (age !== null && age >= 75) {
        notes.push("Non-concessional contributions generally can't be made from age 75.");
        return { annualCap: 0, maxThisYear: 0, bringForward: null, used, remaining: -used, notes };
      }
      let years = 3;
      if (tsbPrior === undefined) {
        notes.push(`Record the total super balance at 30 June ${fyStartYear(y)} to confirm how much can be brought forward.`);
      } else {
        years = bringForwardYears(tsbPrior, r.nonConcessional, r.transferBalanceCap);
        if (years === 0) notes.push(`No non-concessional cap this year: total super balance at 30 June ${fyStartYear(y)} was at or over ${money(r.transferBalanceCap)}.`);
      }
      const annualCap = years === 0 ? 0 : r.nonConcessional;
      const maxThisYear = years * r.nonConcessional;
      if (used > annualCap && years > 1) {
        notes.push(`This year's contributions start a bring-forward period: up to ${money(maxThisYear)} over ${years} years.`);
      } else if (years > 1) {
        notes.push(`Up to ${money(maxThisYear)} can go in this year by bringing forward the next ${years - 1} years' caps.`);
      }
      return { annualCap, maxThisYear, bringForward: null, used, remaining: maxThisYear - used, notes };
    }

    if (period) {
      period.used += used;
    } else if (used > r.nonConcessional && (age === null || age < 75)) {
      const years = tsbPrior === undefined ? 3 : bringForwardYears(tsbPrior, r.nonConcessional, r.transferBalanceCap);
      if (years > 1) period = { startYear: y, years, total: years * r.nonConcessional, used };
    }
  }
  throw new Error("unreachable");
}

// --- Pensions -------------------------------------------------------------------

/** Minimum yearly drawdown as a share of the balance, by age. Halved for 2019-20 to 2022-23. */
export function minimumRate(age: number, year: string): number {
  const base = age < 65 ? 0.04 : age < 75 ? 0.05 : age < 80 ? 0.06 : age < 85 ? 0.07 : age < 90 ? 0.09 : age < 95 ? 0.11 : 0.14;
  const halved = year >= "2019-20" && year <= "2022-23";
  return halved ? base / 2 : base;
}

const roundTo10 = (n: number) => Math.round(n / 10) * 10;
const DAY = 86_400_000;

export interface PensionInput {
  kind: string; // ACCOUNT_BASED | TRANSITION_TO_RETIREMENT
  startDate: Date;
  startBalance: number;
  endDate: Date | null;
}

export interface PensionYear {
  active: boolean;
  basis: number | null; // the balance the minimum is worked out from
  rate: number | null;
  minimum: number | null;
  maximum: number | null; // transition to retirement pensions only
  retirementPhase: boolean;
  notes: string[];
}

export function pensionYear(p: PensionInput, year: string, openingBalance: number | null, dateOfBirth: Date | null): PensionYear {
  const { start, end } = fyRange(year);
  const notes: string[] = [];
  if (p.startDate > end || (p.endDate && p.endDate < start)) {
    return { active: false, basis: null, rate: null, minimum: null, maximum: null, retirementPhase: false, notes };
  }
  const startedThisYear = p.startDate >= start;
  const basis = startedThisYear ? p.startBalance : openingBalance;
  const ageAt = dateOfBirth ? ageOn(dateOfBirth, startedThisYear ? p.startDate : start) : null;
  const retirementPhase = p.kind !== "TRANSITION_TO_RETIREMENT" || (ageAt !== null && ageAt >= 65);
  if (ageAt === null) notes.push("Add the member's date of birth to work out the minimum.");
  if (basis === null) notes.push(`Enter the pension balance on 1 July ${fyStartYear(year)}.`);

  const rate = ageAt === null ? null : minimumRate(ageAt, year);
  let minimum: number | null = null;
  if (rate !== null && basis !== null) {
    const daysInYear = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    let fraction = 1;
    if (startedThisYear) {
      if (p.startDate >= new Date(Date.UTC(end.getUTCFullYear(), 5, 1))) {
        fraction = 0;
        notes.push("Started in June, so there's no minimum to pay this year.");
      } else {
        fraction = (Math.round((end.getTime() - p.startDate.getTime()) / DAY) + 1) / daysInYear;
        if (fraction < 1) notes.push("Started this year, so the minimum is reduced for the part of the year it ran.");
      }
    }
    if (p.endDate && p.endDate <= end) {
      const from = startedThisYear ? p.startDate : start;
      fraction = Math.min(fraction, (Math.round((p.endDate.getTime() - from.getTime()) / DAY) + 1) / daysInYear);
      notes.push("Ended during the year: the minimum is reduced to the time it ran — confirm the figure with your accountant.");
    }
    minimum = roundTo10(rate * basis * fraction);
  }
  const maximum = p.kind === "TRANSITION_TO_RETIREMENT" && !retirementPhase && basis !== null ? roundTo10(basis * 0.1) : null;
  return { active: true, basis, rate, minimum, maximum, retirementPhase, notes };
}

// --- Rules that started in 2026 -------------------------------------------------

/**
 * Division 296 (better targeted super concessions), law from 1 July 2026: an
 * extra 15% tax on the share of earnings from a total super balance above
 * the large super balance threshold, and another 10% above the very large
 * one. Both are indexed; these are the 2026-27 figures. The fund's
 * administrator and the ATO work out the tax — this only flags who's near.
 * Source: ATO new legislation, "Better targeted superannuation concessions".
 */
export const DIV296_FIRST_YEAR = "2026-27";
export const LARGE_SUPER_BALANCE_THRESHOLD = 3_000_000;
export const VERY_LARGE_SUPER_BALANCE_THRESHOLD = 10_000_000;
/** Flag balances within this share of the threshold, so it's seen coming. */
const NEAR_SHARE = 0.9;

export interface LargeBalanceFlag {
  balance: number;
  threshold: number;
  level: "NEAR" | "OVER" | "VERY_LARGE";
  note: string;
}

export function largeBalanceFlag(totalSuperBalance: number | null | undefined, year: string): LargeBalanceFlag | null {
  if (totalSuperBalance === null || totalSuperBalance === undefined || year < DIV296_FIRST_YEAR) return null;
  const b = totalSuperBalance;
  if (b > VERY_LARGE_SUPER_BALANCE_THRESHOLD) {
    return {
      balance: b,
      threshold: VERY_LARGE_SUPER_BALANCE_THRESHOLD,
      level: "VERY_LARGE",
      note: `Total super balance ${money(b)} is over ${money(VERY_LARGE_SUPER_BALANCE_THRESHOLD)}: Division 296 adds 15% tax on the share of earnings above ${money(LARGE_SUPER_BALANCE_THRESHOLD)}, and another 10% above ${money(VERY_LARGE_SUPER_BALANCE_THRESHOLD)}. The ATO works it out and sends the assessment.`,
    };
  }
  if (b > LARGE_SUPER_BALANCE_THRESHOLD) {
    return {
      balance: b,
      threshold: LARGE_SUPER_BALANCE_THRESHOLD,
      level: "OVER",
      note: `Total super balance ${money(b)} is over ${money(LARGE_SUPER_BALANCE_THRESHOLD)}: from 1 July 2026, Division 296 adds 15% tax on the share of earnings above that. The ATO works it out and sends the assessment.`,
    };
  }
  if (b >= LARGE_SUPER_BALANCE_THRESHOLD * NEAR_SHARE) {
    return {
      balance: b,
      threshold: LARGE_SUPER_BALANCE_THRESHOLD,
      level: "NEAR",
      note: `Total super balance ${money(b)} is close to ${money(LARGE_SUPER_BALANCE_THRESHOLD)}. Above that, Division 296 (from 1 July 2026) adds 15% tax on the share of earnings over it — worth planning contributions and withdrawals with your adviser.`,
    };
  }
  return null;
}

/**
 * LRBA change, law from 25 June 2026: an SMSF limited recourse borrowing
 * arrangement entered into on or after 10 August 2026 can only buy business
 * real property — not residential. Earlier arrangements aren't affected.
 * Source: ATO new legislation, "Limited Recourse Borrowing Arrangement
 * (LRBA) Provisions".
 */
export const LRBA_BUSINESS_PROPERTY_ONLY_FROM = new Date(Date.UTC(2026, 7, 10));

export function lrbaPropertyWarning(startDate: Date | null, residential: boolean): { level: "WARNING" | "CHECK"; note: string } | null {
  if (!residential) return null;
  if (!startDate) {
    return {
      level: "CHECK",
      note: "Record when this loan was set up. SMSF borrowing arrangements entered into from 10 August 2026 can only buy business real property, not residential.",
    };
  }
  if (startDate >= LRBA_BUSINESS_PROPERTY_ONLY_FROM) {
    return {
      level: "WARNING",
      note: "This loan started on or after 10 August 2026, when SMSF borrowing to buy residential property stopped being allowed. Check this with your SMSF adviser now.",
    };
  }
  return null;
}
