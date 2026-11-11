import { randomUUID } from "node:crypto";
import { DueDiligenceCheck } from "@prisma/client";
import { prismaAll } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Due diligence on a property you're considering. Like What's missing, the
 * checks are a fixed list here — picked by the kind of property (house,
 * unit, townhouse, commercial) and its title (Torrens, strata, community) —
 * and only their state is saved (DueDiligenceCheck). Nothing is mandatory:
 * a check that doesn't fit is marked not applicable. A check can hold what
 * was found, a cost, documents as evidence, who's handling it, a due date
 * (a calendar reminder), whether it's been checked, and a problem found —
 * open problems gather at the top and their costs count in cash needed.
 */

interface Ctx {
  commercial: boolean;
  kind: string | null; // HOUSE | UNIT | TOWNHOUSE | LAND | OTHER
  title: string | null; // TORRENS | STRATA | COMMUNITY
}

interface CheckDef {
  key: string;
  group: string;
  label: string;
  why?: string;
  when?: (c: Ctx) => boolean;
}

const strata = (c: Ctx) => c.title === "STRATA" || (c.title === null && c.kind === "UNIT");
const community = (c: Ctx) => c.title === "COMMUNITY";
const building = (c: Ctx) => c.kind !== "LAND";
const house = (c: Ctx) => c.kind === "HOUSE" || c.kind === "TOWNHOUSE" || c.kind === null;

const R_TITLE = "Title and planning";
const R_BUILDING = "Building and condition";
const R_RISK = "Hazards and insurance";
const R_STRATA = "Strata";
const R_COMMUNITY = "Community title";
const R_RENT = "Rent and running costs";
const R_CONTRACT = "Contract";

const RESIDENTIAL: CheckDef[] = [
  { key: "r.title", group: R_TITLE, label: "Title search: the registered owner, and any mortgages or caveats" },
  { key: "r.easements", group: R_TITLE, label: "Easements, covenants and restrictions on the title (sewer mains, rights of way)" },
  { key: "r.zoning", group: R_TITLE, label: "Zoning and planning certificate (in NSW, the section 10.7 certificate)" },
  { key: "r.approvals", group: R_TITLE, label: "Approvals for any additions, granny flat, pool or deck", when: (c) => building(c) && house(c) },
  { key: "r.survey", group: R_TITLE, label: "Boundaries — a survey or sewer diagram, and any encroachments" },
  { key: "r.building", group: R_BUILDING, label: "Building inspection", when: building },
  { key: "r.pest", group: R_BUILDING, label: "Pest (termite) inspection", when: building },
  { key: "r.electrical", group: R_BUILDING, label: "Electrical: wiring, switchboard and safety switches", when: building },
  { key: "r.plumbing", group: R_BUILDING, label: "Plumbing, hot water and drainage", when: building },
  { key: "r.roof", group: R_BUILDING, label: "Roof, gutters and stormwater", when: (c) => building(c) && house(c) },
  { key: "r.retaining", group: R_BUILDING, label: "Retaining walls, trees and slope", when: house },
  { key: "r.pool", group: R_BUILDING, label: "Pool safety certificate (if there's a pool)", when: building },
  { key: "r.smoke", group: R_BUILDING, label: "Smoke alarms and the minimum standards for renting it out", when: building },
  { key: "r.capex", group: R_BUILDING, label: "Maintenance and big spending coming up (roof, hot water, kitchen)", when: building },
  { key: "r.flood", group: R_RISK, label: "Flood risk (council flood maps)" },
  { key: "r.bushfire", group: R_RISK, label: "Bushfire risk (bushfire-prone land map)" },
  { key: "r.hazards", group: R_RISK, label: "Other hazards: contamination, mine subsidence, noise, heritage" },
  { key: "r.insurance", group: R_RISK, label: "Insurance quote — can it be insured, and for how much", why: "Some flood or bushfire areas are costly or hard to insure." },
  { key: "r.strata-plan", group: R_STRATA, label: "Strata plan and the lot's unit entitlement", when: strata },
  { key: "r.strata-levies", group: R_STRATA, label: "Strata levies: admin fund and capital works fund", when: strata },
  { key: "r.strata-fund", group: R_STRATA, label: "Capital works fund balance and its 10-year plan", when: strata },
  { key: "r.strata-minutes", group: R_STRATA, label: "Minutes of the last few general and committee meetings", when: strata },
  { key: "r.strata-special", group: R_STRATA, label: "Special levies raised or planned", when: strata },
  { key: "r.strata-defects", group: R_STRATA, label: "Building defects and any rectification work", when: strata },
  { key: "r.strata-fire", group: R_STRATA, label: "Fire safety (the annual fire safety statement)", when: strata },
  { key: "r.strata-insurance", group: R_STRATA, label: "The strata building insurance policy", when: strata },
  { key: "r.strata-disputes", group: R_STRATA, label: "Disputes, legal action or tribunal orders", when: strata },
  { key: "r.strata-bylaws", group: R_STRATA, label: "By-laws, including rules on renting, pets and short stays", when: strata },
  { key: "r.strata-report", group: R_STRATA, label: "A strata inspection report", when: strata },
  { key: "r.community-statement", group: R_COMMUNITY, label: "Community management statement and by-laws", when: community },
  { key: "r.community-levies", group: R_COMMUNITY, label: "Community association levies and funds", when: community },
  { key: "r.community-minutes", group: R_COMMUNITY, label: "Association minutes, disputes and planned works", when: community },
  { key: "r.rent-appraisal", group: R_RENT, label: "Rental appraisal from a property manager" },
  { key: "r.rent-comparables", group: R_RENT, label: "Similar properties for rent nearby, and what they ask" },
  { key: "r.vacancy", group: R_RENT, label: "Vacancy rate in the area" },
  { key: "r.management", group: R_RENT, label: "Property management fees (quote)" },
  { key: "r.rates", group: R_RENT, label: "Council and water rates (the actual amounts)" },
  { key: "r.landtax", group: R_RENT, label: "Land value and land tax" },
  { key: "r.depreciation", group: R_RENT, label: "Depreciation estimate from a quantity surveyor", when: building },
  { key: "r.contract", group: R_CONTRACT, label: "Contract reviewed by a solicitor or conveyancer" },
  { key: "r.cooling", group: R_CONTRACT, label: "Cooling-off period, deposit and special conditions understood" },
  { key: "r.inclusions", group: R_CONTRACT, label: "Inclusions and exclusions listed" },
];

const C_LEGAL = "Legal, title and planning";
const C_BUILDING = "Building";
const C_LEASES = "Leases and tenants";
const C_ENV = "Environmental and safety";
const C_MONEY = "Income, costs and contract";

const COMMERCIAL: CheckDef[] = [
  { key: "c.title", group: C_LEGAL, label: "Title search: the registered owner, mortgages and caveats" },
  { key: "c.easements", group: C_LEGAL, label: "Easements, covenants and encumbrances" },
  { key: "c.access", group: C_LEGAL, label: "Access rights (driveways, shared access, rights of way)" },
  { key: "c.zoning", group: C_LEGAL, label: "Zoning and permitted use" },
  { key: "c.approvals", group: C_LEGAL, label: "Existing approvals and occupation certificates" },
  { key: "c.intended", group: C_LEGAL, label: "Your intended use is allowed" },
  { key: "c.heritage", group: C_LEGAL, label: "Heritage listing and planning limits" },
  { key: "c.notices", group: C_LEGAL, label: "Council notices, orders and disputes" },
  { key: "c.strata", group: C_LEGAL, label: "Strata records (levies, minutes, by-laws), if it's strata", when: (c) => c.title === "STRATA" },
  { key: "c.structure", group: C_BUILDING, label: "Structure and foundations" },
  { key: "c.roof", group: C_BUILDING, label: "Roof and stormwater" },
  { key: "c.electrical", group: C_BUILDING, label: "Electrical systems" },
  { key: "c.plumbing", group: C_BUILDING, label: "Plumbing and drainage" },
  { key: "c.fire", group: C_BUILDING, label: "Fire systems (sprinklers, alarms, exits)" },
  { key: "c.hvac", group: C_BUILDING, label: "Air-conditioning (HVAC)" },
  { key: "c.lifts", group: C_BUILDING, label: "Lifts, if any" },
  { key: "c.loading", group: C_BUILDING, label: "Loading, access and car parking" },
  { key: "c.external", group: C_BUILDING, label: "External works and paving" },
  { key: "c.maintenance", group: C_BUILDING, label: "Maintenance history" },
  { key: "c.capex", group: C_BUILDING, label: "Capital spending coming up (a building condition report)" },
  { key: "c.leases", group: C_LEASES, label: "Each current lease read (read it on the property's page)" },
  { key: "c.term", group: C_LEASES, label: "Lease terms and options" },
  { key: "c.reviews", group: C_LEASES, label: "Rent reviews (fixed, CPI or market)" },
  { key: "c.outgoings", group: C_LEASES, label: "Which outgoings the tenants pay back" },
  { key: "c.security", group: C_LEASES, label: "Bank guarantees or bonds" },
  { key: "c.arrears", group: C_LEASES, label: "Rent arrears" },
  { key: "c.incentives", group: C_LEASES, label: "Incentives given (rent-free, fit-out)" },
  { key: "c.makegood", group: C_LEASES, label: "Make-good obligations at the end of each lease" },
  { key: "c.disputes", group: C_LEASES, label: "Tenant disputes" },
  { key: "c.tenant", group: C_LEASES, label: "Each tenant's business and how well it's doing" },
  { key: "c.vacancy", group: C_LEASES, label: "Vacancy, and the cost and time to re-let" },
  { key: "c.contamination", group: C_ENV, label: "Contamination (the site's past uses)" },
  { key: "c.asbestos", group: C_ENV, label: "Asbestos register" },
  { key: "c.tanks", group: C_ENV, label: "Underground fuel or chemical tanks" },
  { key: "c.flood", group: C_ENV, label: "Flood and bushfire risk" },
  { key: "c.stormwater", group: C_ENV, label: "Stormwater and drainage" },
  { key: "c.firesafety", group: C_ENV, label: "Fire safety compliance (annual fire safety statement)" },
  { key: "c.whs", group: C_ENV, label: "Work health and safety obligations as the owner" },
  { key: "c.outgoings-actual", group: C_MONEY, label: "The actual outgoings for the last two years" },
  { key: "c.gst", group: C_MONEY, label: "GST: sold as a going concern, or GST on the price" },
  { key: "c.valuation", group: C_MONEY, label: "Valuation" },
  { key: "c.insurance", group: C_MONEY, label: "Insurance quote" },
  { key: "c.contract", group: C_MONEY, label: "Contract reviewed by a solicitor" },
];

export const CHECK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NA"] as const;

async function ctxFor(assetId: string) {
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId }, include: { property: true, commercialProperty: true } });
  if (!asset || (!asset.property && !asset.commercialProperty)) throw new HttpError(404, "Property not found");
  const ctx: Ctx = {
    commercial: !asset.property,
    kind: asset.property?.kind ?? null,
    title: asset.property?.titleType ?? asset.commercialProperty?.titleType ?? null,
  };
  return { asset, ctx };
}

function checksFor(ctx: Ctx): CheckDef[] {
  return (ctx.commercial ? COMMERCIAL : RESIDENTIAL).filter((c) => !c.when || c.when(ctx));
}

type Row = DueDiligenceCheck & { evidence: number };

function view(def: { key: string; group: string | null; label: string; why?: string }, row: Row | undefined, kind = "CHECK") {
  return {
    key: def.key,
    kind,
    group: def.group,
    label: def.label,
    why: def.why ?? null,
    own: def.key.startsWith("own:"),
    id: row?.id ?? null,
    status: row?.status ?? "NOT_STARTED",
    findings: row?.findings ?? null,
    cost: row?.cost ?? null,
    who: row?.who ?? null,
    dueDate: row?.dueDate ?? null,
    checked: row?.checked ?? false,
    problem: row?.problem ?? false,
    resolvedAt: row?.resolvedAt ?? null,
    resolution: row?.resolution ?? null,
    evidence: row?.evidence ?? 0,
  };
}

export type CheckView = ReturnType<typeof view>;

export async function dueDiligence(assetId: string) {
  const { ctx } = await ctxFor(assetId);
  const rows = await prismaAll.dueDiligenceCheck.findMany({ where: { assetId }, orderBy: { createdAt: "asc" } });
  const links = await prismaAll.documentLink.groupBy({
    by: ["targetId"],
    where: { targetType: "DD_CHECK", targetId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const counts = new Map(links.map((l) => [l.targetId, l._count._all]));
  const byKey = new Map<string, Row>(rows.map((r) => [r.key, { ...r, evidence: counts.get(r.id) ?? 0 }]));

  const defs = checksFor(ctx);
  const own = rows.filter((r) => r.kind === "CHECK" && r.key.startsWith("own:"));
  const groupNames = [...new Set([...defs.map((d) => d.group), ...own.map((r) => r.group ?? "Your own checks")])];
  const groups = groupNames.map((name) => {
    const checks = [
      ...defs.filter((d) => d.group === name).map((d) => view(d, byKey.get(d.key))),
      ...own.filter((r) => (r.group ?? "Your own checks") === name).map((r) => view({ key: r.key, group: name, label: r.label ?? "" }, byKey.get(r.key))),
    ];
    return { name, checks, done: checks.filter((c) => c.status === "DONE" || c.status === "NA").length, total: checks.length };
  });

  // Problems: from any check, plus issues added on their own.
  const allViews = [
    ...groups.flatMap((g) => g.checks),
    ...rows.filter((r) => r.kind === "ISSUE").map((r) => view({ key: r.key, group: null, label: r.label ?? "" }, byKey.get(r.key), "ISSUE")),
  ];
  const problems = allViews.filter((c) => c.problem);
  const open = problems.filter((c) => !c.resolvedAt);
  const development = rows
    .filter((r) => r.kind === "DEVELOPMENT")
    .map((r) => {
      const v = view({ key: r.key, group: null, label: r.label ?? "" }, byKey.get(r.key), "DEVELOPMENT");
      // Never treated as approved until an approval document is linked and ticked as the approval.
      return { ...v, approved: v.checked && v.evidence > 0 };
    });

  return {
    kind: ctx.commercial ? "COMMERCIAL" : "RESIDENTIAL",
    propertyKind: ctx.kind,
    titleType: ctx.title,
    groups,
    openIssues: open,
    resolvedIssues: problems.filter((c) => !!c.resolvedAt),
    openIssueCosts: open.reduce((s, c) => s + (c.cost ?? 0), 0),
    development,
    totals: { done: groups.reduce((s, g) => s + g.done, 0), total: groups.reduce((s, g) => s + g.total, 0) },
  };
}

/** The costs of open problems (added to cash needed in the assessment). */
export async function openIssueCostsFor(assetId: string): Promise<number> {
  const rows = await prismaAll.dueDiligenceCheck.findMany({ where: { assetId, problem: true, resolvedAt: null }, select: { cost: true } });
  return rows.reduce((s, r) => s + (r.cost ?? 0), 0);
}

export interface CheckUpdate {
  status?: (typeof CHECK_STATUSES)[number];
  findings?: string | null;
  cost?: number | null;
  who?: string | null;
  dueDate?: string | null;
  checked?: boolean;
  problem?: boolean;
  resolved?: boolean;
  resolution?: string | null;
  label?: string;
}

/** Saves a check's state (creating its row the first time), keeping its reminder in step with its due date. */
export async function saveCheck(assetId: string, key: string, u: CheckUpdate) {
  const { asset, ctx } = await ctxFor(assetId);
  const def = checksFor(ctx).find((d) => d.key === key);
  const existing = await prismaAll.dueDiligenceCheck.findUnique({ where: { assetId_key: { assetId, key } } });
  if (!def && !existing) throw new HttpError(404, "No such check on this property.");
  const label = def?.label ?? existing?.label ?? key;

  const data = {
    status: u.status,
    findings: u.findings,
    cost: u.cost,
    who: u.who,
    checked: u.checked,
    problem: u.problem,
    label: !def && u.label ? u.label : undefined,
    dueDate: u.dueDate === undefined ? undefined : u.dueDate ? new Date(u.dueDate) : null,
    resolvedAt: u.resolved === undefined ? undefined : u.resolved ? (existing?.resolvedAt ?? new Date()) : null,
    resolution: u.resolution,
  };
  let row = existing
    ? await prismaAll.dueDiligenceCheck.update({ where: { id: existing.id }, data })
    : await prismaAll.dueDiligenceCheck.create({ data: { ...data, assetId, key, kind: "CHECK" } });

  // The due date is a reminder in the calendar, about the property.
  if (u.dueDate !== undefined) {
    const target = asset.property
      ? { targetType: "PROPERTY", targetId: asset.property.id }
      : { targetType: "COMMERCIAL_PROPERTY", targetId: asset.commercialProperty!.id };
    const title = `Due diligence: ${label}`.slice(0, 200);
    if (row.dueDate) {
      const reminder = row.reminderId ? await prismaAll.reminder.findUnique({ where: { id: row.reminderId } }) : null;
      if (reminder) await prismaAll.reminder.update({ where: { id: reminder.id }, data: { dueDate: row.dueDate, title } });
      else {
        const made = await prismaAll.reminder.create({ data: { title, dueDate: row.dueDate, notes: `For ${asset.name}.`, ...target } });
        row = await prismaAll.dueDiligenceCheck.update({ where: { id: row.id }, data: { reminderId: made.id } });
      }
    } else if (row.reminderId) {
      await prismaAll.reminder.deleteMany({ where: { id: row.reminderId, completedAt: null } });
      row = await prismaAll.dueDiligenceCheck.update({ where: { id: row.id }, data: { reminderId: null } });
    }
  }
  // Done with a check: its reminder is done too.
  if (u.status === "DONE" || u.status === "NA") {
    if (row.reminderId) await prismaAll.reminder.updateMany({ where: { id: row.reminderId, completedAt: null }, data: { completedAt: new Date() } });
  }
  return row;
}

/** Your own check, an issue on its own, or a development idea. */
export async function addItem(assetId: string, kind: "CHECK" | "ISSUE" | "DEVELOPMENT", label: string, group?: string | null, cost?: number | null) {
  await ctxFor(assetId);
  const prefix = kind === "CHECK" ? "own" : kind === "ISSUE" ? "issue" : "dev";
  return prismaAll.dueDiligenceCheck.create({
    data: {
      assetId,
      key: `${prefix}:${randomUUID().slice(0, 8)}`,
      kind,
      label,
      group: kind === "CHECK" ? group || "Your own checks" : null,
      problem: kind === "ISSUE",
      cost: cost ?? null,
    },
  });
}

/** Only what you added can be removed; a built-in check is marked not applicable instead. */
export async function removeItem(assetId: string, key: string) {
  if (!/^(own|issue|dev):/.test(key)) throw new HttpError(400, "A built-in check can't be removed — mark it not applicable instead.");
  const row = await prismaAll.dueDiligenceCheck.findUnique({ where: { assetId_key: { assetId, key } } });
  if (!row) throw new HttpError(404, "Not found");
  if (row.reminderId) await prismaAll.reminder.deleteMany({ where: { id: row.reminderId, completedAt: null } });
  await prismaAll.documentLink.deleteMany({ where: { targetType: "DD_CHECK", targetId: row.id } });
  await prismaAll.dueDiligenceCheck.delete({ where: { id: row.id } });
}

/** Makes sure a built-in check has a saved row (so documents can be linked to it), and returns its id. */
export async function ensureCheck(assetId: string, key: string) {
  const existing = await prismaAll.dueDiligenceCheck.findUnique({ where: { assetId_key: { assetId, key } } });
  if (existing) return existing;
  return saveCheck(assetId, key, {});
}
