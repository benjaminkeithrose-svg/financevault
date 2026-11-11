import { shareOf } from "./ownership.js";

/**
 * NSW land tax, from Revenue NSW's "Land tax thresholds and rates" and "How
 * trusts are assessed for land tax" (reference/sources). Thresholds are
 * frozen from the 2025 land tax year: general $1,075,000, premium $6,571,000.
 * Worked out per owner on the combined land value of all their NSW land
 * (except the home), then shared back across their properties by land value.
 *
 * Simplified: joint owners are treated as each owning their share (Revenue
 * NSW assesses jointly owned land together, with one threshold, and each
 * owner separately); related companies aren't grouped; surcharge land tax
 * for foreign owners isn't included. Revenue NSW generally uses the average
 * of the last three years' land values — the figure on the assessment. The
 * land tax actually assessed, entered on a property, always wins.
 */
export const NSW_GENERAL_THRESHOLD = 1_075_000;
export const NSW_PREMIUM_THRESHOLD = 6_571_000;
const GENERAL_BASE = 100;
const GENERAL_RATE = 0.016;
const PREMIUM_BASE = 88_036;
const PREMIUM_RATE = 0.02;

/** Special trusts (family, discretionary, most unit trusts) get no threshold. */
export type LandTaxOwnerKind = "GENERAL" | "SPECIAL_TRUST";

export function landTaxOwnerKind(entityType: string): LandTaxOwnerKind {
  return entityType === "TRUST" || entityType === "UNIT_TRUST" ? "SPECIAL_TRUST" : "GENERAL";
}

export function nswLandTax(totalLandValue: number, kind: LandTaxOwnerKind): number {
  const v = Math.max(0, totalLandValue);
  if (kind === "SPECIAL_TRUST") {
    return Math.min(v, NSW_PREMIUM_THRESHOLD) * GENERAL_RATE + Math.max(0, v - NSW_PREMIUM_THRESHOLD) * PREMIUM_RATE;
  }
  if (v <= NSW_GENERAL_THRESHOLD) return 0;
  if (v <= NSW_PREMIUM_THRESHOLD) return GENERAL_BASE + (v - NSW_GENERAL_THRESHOLD) * GENERAL_RATE;
  return PREMIUM_BASE + (v - NSW_PREMIUM_THRESHOLD) * PREMIUM_RATE;
}

export interface LandTaxAsset {
  id: string;
  entityId: string;
  landValue: number | null;
  landTaxPerYear: number | null;
  mainResidence: string | null;
  state: string | null;
  address: string;
  ownerships: Array<{ ownerEntityId: string; ownershipPercent: number; startDate?: Date | null; endDate?: Date | null }>;
}

export interface LandTaxResult {
  amount: number | null;
  basis: "ASSESSED" | "ESTIMATED" | "EXEMPT_HOME" | "NOT_NSW" | "NO_LAND_VALUE";
  notes: string[];
}

export function isNsw(a: { state: string | null; address: string }): boolean {
  if (a.state) return a.state.trim().toUpperCase() === "NSW";
  return /\bNSW\b/i.test(a.address);
}

/** Land tax for each property, from every owner's whole NSW landholding. */
export function landTaxByAsset(assets: LandTaxAsset[], entityTypes: Map<string, string>): Map<string, LandTaxResult> {
  const out = new Map<string, LandTaxResult>();
  const taxable: LandTaxAsset[] = [];
  for (const a of assets) {
    if (a.landTaxPerYear !== null && a.landTaxPerYear !== undefined) {
      out.set(a.id, { amount: a.landTaxPerYear, basis: "ASSESSED", notes: ["Land tax as assessed (entered on the property)."] });
    } else if (a.mainResidence === "FULL") {
      out.set(a.id, { amount: 0, basis: "EXEMPT_HOME", notes: ["Your home — exempt from land tax."] });
    } else if (!isNsw(a)) {
      out.set(a.id, { amount: null, basis: "NOT_NSW", notes: ["Only NSW land tax is estimated — enter the assessed amount for other states."] });
    } else if (!a.landValue) {
      out.set(a.id, { amount: null, basis: "NO_LAND_VALUE", notes: ["Enter the land value (on the Valuer General notice or land tax assessment) to estimate land tax."] });
    } else taxable.push(a);
  }
  // Each owner's combined taxable land value, and their share of each property's.
  const shares = new Map<string, Array<{ assetId: string; value: number }>>();
  for (const a of taxable) {
    const owners = [...new Set([a.entityId, ...a.ownerships.map((o) => o.ownerEntityId)])];
    for (const owner of owners) {
      const share = shareOf(a, owner);
      if (share <= 0) continue;
      shares.set(owner, [...(shares.get(owner) ?? []), { assetId: a.id, value: a.landValue! * share }]);
    }
  }
  const totals = new Map<string, number>();
  const notes = new Map<string, Set<string>>();
  for (const [owner, parts] of shares) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    const kind = landTaxOwnerKind(entityTypes.get(owner) ?? "INDIVIDUAL");
    const tax = nswLandTax(total, kind);
    for (const p of parts) {
      totals.set(p.assetId, (totals.get(p.assetId) ?? 0) + (total > 0 ? tax * (p.value / total) : 0));
      const n = notes.get(p.assetId) ?? new Set<string>();
      if (kind === "SPECIAL_TRUST") n.add("Owned by a family, discretionary or unit trust: no tax-free threshold (1.6% from the first dollar).");
      else if (total <= NSW_GENERAL_THRESHOLD) n.add("Under the $1,075,000 threshold for its owner — no land tax.");
      if (parts.length > 1) n.add("The owner's land tax is on all their NSW land together, shared across their properties by land value.");
      notes.set(p.assetId, n);
    }
  }
  for (const a of taxable) {
    out.set(a.id, {
      amount: totals.get(a.id) ?? 0,
      basis: "ESTIMATED",
      notes: [...(notes.get(a.id) ?? []), "Estimate at NSW rates; the assessment decides."],
    });
  }
  return out;
}
