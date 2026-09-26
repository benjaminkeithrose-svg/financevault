import { prisma } from "../db.js";
import { DEFAULT_ASSUMPTIONS } from "./borrowing.js";
import { MLS_SINGLE_THRESHOLD } from "./expected.js";
import { LATEST_RATES_YEAR, MEDICARE_LEVY, MEDICARE_LOW_INCOME_THRESHOLD, ratesFor } from "./incomeTax.js";
import { NSW_GENERAL_THRESHOLD, NSW_PREMIUM_THRESHOLD } from "./landTax.js";
import { STATUTORY_RATE } from "./carCompare.js";
import { LARGE_SUPER_BALANCE_THRESHOLD, rulesFor } from "./superRules.js";
import { CAR_KM_CAP, carRateFor, IMMEDIATE_DEDUCTION_LIMIT, wfhRateFor } from "./workDeductions.js";

/**
 * The official figures the app calculates with, each with the source it
 * came from (a link-pack entry) and when that was last confirmed. When a
 * newer copy of the source is saved by "Check for new versions", the figure
 * is flagged to be reviewed — the app doesn't change its own figures; a new
 * version of the program does, after they're checked.
 */

/** When the figures below were last checked against their sources. */
export const FIGURES_CHECKED_ON = "2026-09-26";

const money = (n: number) => `$${n.toLocaleString("en-AU")}`;
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function figureList() {
  const fy = LATEST_RATES_YEAR;
  const tax = ratesFor(fy).brackets;
  const caps = rulesFor(fy);
  return [
    {
      id: "tax-rates",
      label: `Resident income tax rates, ${fy}`,
      value: tax.slice(1).map(([from, , rate]) => `${pct(rate)} over ${money(from)}`).join(" · "),
      source: "tax-rates-residents",
    },
    { id: "medicare-levy", label: "Medicare levy", value: `${pct(MEDICARE_LEVY)}, phased in above ${money(MEDICARE_LOW_INCOME_THRESHOLD)}`, source: "medicare-levy" },
    { id: "mls", label: "Medicare levy surcharge threshold (single)", value: money(MLS_SINGLE_THRESHOLD), source: "medicare-levy-surcharge" },
    {
      id: "super-caps",
      label: `Super contribution caps, ${fy}`,
      value: `${money(caps.concessional)} concessional · ${money(caps.nonConcessional)} non-concessional`,
      source: "super-contribution-caps",
    },
    { id: "transfer-balance-cap", label: `Transfer balance cap, ${fy}`, value: money(caps.transferBalanceCap), source: "super-rates-thresholds" },
    { id: "div296", label: "Large super balance threshold (Division 296)", value: money(LARGE_SUPER_BALANCE_THRESHOLD), source: "super-new-legislation" },
    { id: "car-rate", label: `Cents per kilometre, ${fy}`, value: `${Math.round(carRateFor(fy).rate * 100)}c, up to ${CAR_KM_CAP.toLocaleString("en-AU")} km`, source: "car-cents-per-km" },
    {
      id: "wfh-rate",
      label: "Working from home fixed rate",
      value: `${Math.round(wfhRateFor("2025-26").rate * 100)}c an hour (2025-26)${wfhRateFor(fy).known ? "" : ` — ${fy} rate not yet published`}`,
      source: "wfh-fixed-rate",
    },
    { id: "immediate-deduction", label: "Immediate deduction for work items", value: `${money(IMMEDIATE_DEDUCTION_LIMIT)} or less`, source: "work-related-deductions" },
    { id: "fbt-statutory", label: "Car fringe benefits, statutory formula", value: pct(STATUTORY_RATE), source: "fbt-cars" },
    { id: "nsw-land-tax", label: "NSW land tax thresholds, 2026", value: `${money(NSW_GENERAL_THRESHOLD)} general · ${money(NSW_PREMIUM_THRESHOLD)} premium`, source: "nsw-land-tax-rates" },
    { id: "nsw-duty", label: "NSW transfer duty bands, 2026-27", value: "Revenue NSW table (duty on purchases in Portfolio Plan)", source: "nsw-transfer-duty" },
    { id: "apra-buffer", label: "Loan serviceability buffer", value: `${DEFAULT_ASSUMPTIONS.buffer} percentage points`, source: "apra-apg-223" },
  ];
}

/** Each figure with its source's last check, flagged when a newer copy arrived since the figure was checked. */
export async function figures() {
  const checks = new Map((await prisma.referenceCheck.findMany()).map((c) => [c.linkId, c]));
  const checkedOn = new Date(`${FIGURES_CHECKED_ON}T23:59:59Z`);
  return {
    checkedOn: FIGURES_CHECKED_ON,
    items: figureList().map((f) => {
      const c = checks.get(f.source);
      const review = !!c && ["UPDATED", "NEW_YEAR", "WITHDRAWN"].includes(c.status) && c.checkedAt > checkedOn;
      return { ...f, sourceCheckedAt: c?.checkedAt ?? null, sourceStatus: c?.status ?? null, sourceDocumentId: c?.documentId ?? null, review };
    }),
  };
}
