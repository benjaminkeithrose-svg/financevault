import { prismaAll } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Buying a property you're considering, step by step. Each step keeps the
 * date it was ticked; some carry an amount (the offer, the price) or a date
 * (when cooling-off ends, the settlement date). Ticking a step in a later
 * stage moves the property along; ticking "Settled" makes it yours.
 */

export interface StepDef {
  key: string;
  stage: "OFFER" | "CONTRACT" | "SETTLEMENT";
  label: string;
  amount?: string; // what the amount is, when there is one
  date?: string; // what the date is, when there is one
  hint?: string;
}

export const STEPS: StepDef[] = [
  { key: "offer-made", stage: "OFFER", label: "Offer made", amount: "Offer ($)" },
  { key: "offer-accepted", stage: "OFFER", label: "Offer accepted" },
  { key: "exchanged", stage: "CONTRACT", label: "Contracts exchanged", amount: "Price in the contract ($)" },
  { key: "deposit-paid", stage: "CONTRACT", label: "Deposit paid", amount: "Deposit ($)" },
  { key: "cooling-off", stage: "CONTRACT", label: "Cooling-off period ends", date: "Ends on" },
  { key: "finance-approved", stage: "CONTRACT", label: "Finance approved", hint: "Add the loan under Financing below — it's recorded now and counted from settlement." },
  { key: "inspections-cleared", stage: "CONTRACT", label: "Building and pest cleared" },
  { key: "settlement-booked", stage: "SETTLEMENT", label: "Settlement date booked", date: "Settles on" },
  { key: "final-inspection", stage: "SETTLEMENT", label: "Final inspection" },
  { key: "funds-ready", stage: "SETTLEMENT", label: "Funds ready" },
  { key: "settled", stage: "SETTLEMENT", label: "Settled", amount: "Price paid ($)", hint: "Makes it yours: it counts in your totals from that day, with its loan." },
];

const ORDER = ["LOOKING", "INVESTIGATING", "OFFER", "CONTRACT", "SETTLEMENT"];

export async function purchaseSteps(assetId: string) {
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId }, include: { purchaseSteps: true } });
  if (!asset) throw new HttpError(404, "Property not found");
  const saved = new Map(asset.purchaseSteps.map((s) => [s.key, s]));
  const steps = STEPS.map((d) => {
    const s = saved.get(d.key);
    return { ...d, doneAt: s?.doneAt ?? null, amount: s?.amount ?? null, date: s?.date ?? null, note: s?.note ?? null, amountLabel: d.amount ?? null, dateLabel: d.date ?? null };
  });
  const stage = asset.pipelineStage ?? "LOOKING";
  const next = steps.find((s) => s.stage === stage && !s.doneAt) ?? null;
  return { stage, steps, next: next ? { key: next.key, label: next.label } : null };
}

/** The price paid, by default: the price in the contract, or the offer that was made. */
export function pricePaid(steps: Array<{ key: string; amount: number | null }>): number | null {
  const at = (k: string) => steps.find((s) => s.key === k)?.amount ?? null;
  return at("settled") ?? at("exchanged") ?? at("offer-made");
}

export async function saveStep(assetId: string, key: string, u: { done?: boolean; amount?: number | null; date?: string | null; note?: string | null }) {
  const def = STEPS.find((s) => s.key === key);
  if (!def) throw new HttpError(404, "No such step.");
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "CONSIDERING") throw new HttpError(400, "Only a property you're considering has buying steps.");
  const data = {
    doneAt: u.done === undefined ? undefined : u.done ? new Date() : null,
    amount: u.amount,
    date: u.date === undefined ? undefined : u.date ? new Date(u.date) : null,
    note: u.note,
  };
  const existing = await prismaAll.purchaseStep.findUnique({ where: { assetId_key: { assetId, key } } });
  // A step already ticked keeps the day it was ticked.
  if (existing?.doneAt && u.done) data.doneAt = undefined;
  if (existing) await prismaAll.purchaseStep.update({ where: { id: existing.id }, data });
  else await prismaAll.purchaseStep.create({ data: { ...data, doneAt: data.doneAt ?? null, assetId, key } });

  // Ticking a step further along moves the property along.
  if (u.done && ORDER.indexOf(def.stage) > ORDER.indexOf(asset.pipelineStage ?? "LOOKING")) {
    await prismaAll.asset.update({ where: { id: assetId }, data: { pipelineStage: def.stage } });
  }
}
