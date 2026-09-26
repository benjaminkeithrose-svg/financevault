import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { accountantChecklist } from "../services/accountantChecklist.js";
import { isNsw } from "../services/landTax.js";
import { shareOf } from "../services/ownership.js";
import { compareStructures } from "../services/structureCompare.js";

/**
 * Prompts for the accountant: the "worth asking" checklist (idea 8) and the
 * structure comparison (idea 9). Organising aids, not advice.
 */
export const adviceRouter = Router();

/** Tax reference documents by code, so each item can open its source. */
async function referenceDocs(): Promise<Record<string, string>> {
  const refs = await prisma.document.findMany({ where: { documentType: "Tax Reference", referenceCode: { not: null } }, select: { id: true, referenceCode: true } });
  return Object.fromEntries(refs.map((r) => [r.referenceCode!, r.id]));
}

adviceRouter.get(
  "/accountant-checklist",
  asyncHandler(async (_req, res) => {
    res.json({ items: await accountantChecklist(), referenceDocs: await referenceDocs() });
  })
);

/** The facts behind an item, laid out for the accountant to ask the ATO for a private ruling. */
adviceRouter.get(
  "/accountant-checklist/:id/facts",
  asyncHandler(async (req, res) => {
    const item = (await accountantChecklist()).find((i) => i.id === req.params.id);
    if (!item) throw new HttpError(404, "That item isn't on the checklist any more");
    const text = [
      `Facts for a private binding ruling request — ${item.title}`,
      "",
      "The situation",
      item.why,
      ...(item.facts ?? []).map((f) => `- ${f}`),
      "",
      "The rule in question",
      item.rule,
      `Source: ${item.source.label}`,
      "",
      "The question for the ATO",
      `How does the rule apply to these facts? (${item.action})`,
      "",
      `Prepared by Financial Vault on ${new Date().toISOString().slice(0, 10)} for the family's accountant, who lodges the request. Not tax advice.`,
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ruling_facts_${item.id.replace(/[^a-z0-9-]+/gi, "_").slice(0, 60)}.txt"`);
    res.send(text);
  })
);

/** Each person's income and the NSW land they already own, for the comparison. */
async function peopleForComparison() {
  const [people, properties, commercial] = await Promise.all([
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    prisma.property.findMany({ where: { asset: { disposalDate: null } }, include: { asset: { include: { ownerships: true } } } }),
    prisma.commercialProperty.findMany({ where: { asset: { disposalDate: null } }, include: { asset: { include: { ownerships: true } } } }),
  ]);
  const land = [...properties.map((p) => ({ ...p.asset, state: p.state, address: p.address })), ...commercial.map((c) => ({ ...c.asset, state: c.state, address: c.address }))].filter(
    (a) => a.landValue && a.mainResidence !== "FULL" && isNsw(a)
  );
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    income: (p.grossSalary ?? 0) + (p.variableIncome ?? 0) + (p.carAllowance ?? 0),
    incomeRecorded: p.grossSalary !== null || p.variableIncome !== null,
    existingNswLand: p.entityId ? land.reduce((s, a) => s + a.landValue! * shareOf(a, p.entityId!), 0) : 0,
  }));
}

adviceRouter.get(
  "/structure-comparison",
  asyncHandler(async (_req, res) => {
    res.json({ people: await peopleForComparison() });
  })
);

const comparisonInput = z.object({
  price: z.number().min(0),
  rent: z.number().min(0),
  runningCosts: z.number().min(0),
  loanAmount: z.number().min(0),
  ratePct: z.number().min(0).max(30),
  landValue: z.number().min(0),
  depreciation: z.number().min(0),
  growthPct: z.number().min(-20).max(30),
  yearsHeld: z.number().int().min(1).max(40),
  residential: z.boolean(),
  nsw: z.boolean(),
  personIds: z.array(z.string()),
  beneficiaryIds: z.array(z.string()),
});

adviceRouter.post(
  "/structure-comparison",
  asyncHandler(async (req, res) => {
    const { personIds, ...rest } = comparisonInput.parse(req.body);
    const all = await peopleForComparison();
    const people = personIds.map((id) => all.find((p) => p.id === id)).filter((p): p is (typeof all)[number] => !!p);
    res.json({ options: compareStructures({ ...rest, people }) });
  })
);
