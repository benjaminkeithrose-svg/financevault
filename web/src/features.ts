import { useEffect, useState } from "react";
import { api } from "./api/client.js";

/**
 * Features that can be switched off in Settings → Features. Switched off, a
 * feature disappears from the menu, the dashboard and the pages it appears
 * on — but nothing is deleted, and it comes back exactly as it was when
 * switched on again. Everything not listed here is always on.
 */
export const FEATURES = [
  { id: "vehicles", name: "Vehicles & boats", blurb: "Cars, boats and caravans, and the loans for them." },
  { id: "investments", name: "Shares, ETFs & crypto", blurb: "Investment accounts, holdings, dividends and capital gains." },
  { id: "super", name: "Super", blurb: "Super balances in the menu and on the dashboard." },
  { id: "smsf", name: "Self-managed super fund", blurb: "Members, contributions, pensions and fund property, on the fund's page." },
  { id: "commercial", name: "Commercial property", blurb: "Commercial properties, leases and the acquisition model." },
  { id: "insurance", name: "Insurance", blurb: "The insurance register and cover on each asset and person." },
  { id: "advisers", name: "Professional advisers", blurb: "Accountant, solicitor, agent and adviser contacts." },
  { id: "payg", name: "Job & work deductions", blurb: "Employment, work deductions and car options on each person's page." },
  { id: "expected", name: "What's missing", blurb: "The checklist of insurance and paperwork you'd normally have." },
  { id: "bulk-import", name: "Import a folder", blurb: "Bring in a whole folder of documents at once." },
  { id: "gmail", name: "Import from Gmail", blurb: "Pull document attachments out of your email." },
  { id: "borrowing", name: "How much could I borrow?", blurb: "The borrowing and equity estimate." },
  { id: "accountant", name: "Worth asking your accountant", blurb: "Deductions and concessions your records suggest." },
  { id: "structure", name: "Who should own it?", blurb: "The same purchase under each kind of owner." },
  { id: "portfolio-plan", name: "Portfolio Plan", blurb: "Plans for future purchases, refinances and equity draws." },
  { id: "packs", name: "Document Packs", blurb: "Bundles of documents for a broker or accountant." },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

const EVENT = "fv-features-change";
let cache: Set<string> | null = null;
let loading: Promise<void> | null = null;
// Locking (or restoring a backup, which locks) may change the setting — read it again after.
window.addEventListener("fv-locked", () => {
  cache = null;
});

function load(): Promise<void> {
  loading ??= api.settings
    .get()
    .then((s) => {
      cache = new Set(s.featuresOff ?? []);
    })
    .catch(() => {
      cache = new Set();
    })
    .finally(() => {
      loading = null;
      window.dispatchEvent(new Event(EVENT));
    });
  return loading;
}

/** Tell listeners (the "What's missing" box) that a policy or document link changed. */
export const RECORDS_CHANGED = "fv-records-changed";
export function recordsChanged() {
  window.dispatchEvent(new Event(RECORDS_CHANGED));
}

/** Record a new list (after Settings saves it) and tell every page. */
export function setFeaturesOff(off: string[]) {
  cache = new Set(off);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Which features are on. Until the setting has loaded, everything counts as
 * on, so nothing flickers away on a normal start.
 */
export function useFeatures() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    window.addEventListener(EVENT, listener);
    if (!cache) load();
    return () => window.removeEventListener(EVENT, listener);
  }, []);
  const off = cache ?? new Set<string>();
  return {
    ready: cache !== null,
    on: (id: FeatureId) => !off.has(id),
    off: [...off],
  };
}
