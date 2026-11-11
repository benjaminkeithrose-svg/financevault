import { prisma, prismaAll } from "../db.js";

/**
 * The person's own reminders, done like tasks: each stays in the calendar
 * (overdue, if it comes to that) until it's marked complete. A repeating
 * one makes its next occurrence when completed.
 */

export const REPEATS = ["NONE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type Repeat = (typeof REPEATS)[number];

export const REMINDER_TARGETS = [
  "ASSET",
  "PROPERTY",
  "COMMERCIAL_PROPERTY",
  "PERSON",
  "ENTITY",
  "LIABILITY",
  "INSURANCE_POLICY",
  "ACCOUNT",
  "INVESTMENT_ACCOUNT",
] as const;

/** The next due date after a completed one. Month-ends stay month-ends (31 Jan → 28 Feb). */
export function nextDue(due: Date, repeat: string): Date | null {
  const months = repeat === "MONTHLY" ? 1 : repeat === "QUARTERLY" ? 3 : repeat === "YEARLY" ? 12 : 0;
  if (repeat === "WEEKLY") return new Date(due.getTime() + 7 * 86_400_000);
  if (!months) return null;
  const y = due.getUTCFullYear();
  const m = due.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(due.getUTCDate(), lastDay)));
}

export interface TargetInfo {
  name: string;
  route: string;
}

/** What each reminder is about, by name and page, looked up in one go. */
export async function describeTargets(refs: Array<{ targetType: string | null; targetId: string | null }>): Promise<Map<string, TargetInfo>> {
  const ids = (type: string) => [...new Set(refs.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const out = new Map<string, TargetInfo>();
  const put = (type: string, id: string, name: string, route: string) => out.set(`${type}:${id}`, { name, route });

  const [assets, properties, commercial, people, entities, loans, policies, accounts, investments] = await Promise.all([
    prismaAll.asset.findMany({ where: { id: { in: ids("ASSET") } }, select: { id: true, name: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } } }),
    prismaAll.property.findMany({ where: { id: { in: ids("PROPERTY") } }, select: { id: true, asset: { select: { name: true } } } }),
    prismaAll.commercialProperty.findMany({ where: { id: { in: ids("COMMERCIAL_PROPERTY") } }, select: { id: true, name: true } }),
    prisma.person.findMany({ where: { id: { in: ids("PERSON") } }, select: { id: true, name: true } }),
    prisma.entity.findMany({ where: { id: { in: ids("ENTITY") } }, select: { id: true, name: true } }),
    prisma.liability.findMany({ where: { id: { in: ids("LIABILITY") } }, select: { id: true, name: true } }),
    prisma.insurancePolicy.findMany({ where: { id: { in: ids("INSURANCE_POLICY") } }, select: { id: true, kind: true, insurer: true, asset: { select: { name: true } } } }),
    prisma.account.findMany({ where: { id: { in: ids("ACCOUNT") } }, select: { id: true, institution: true, accountName: true } }),
    prisma.investmentAccount.findMany({ where: { id: { in: ids("INVESTMENT_ACCOUNT") } }, select: { id: true, institution: true } }),
  ]);
  for (const a of assets) {
    const route = a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : `/assets/${a.id}`;
    put("ASSET", a.id, a.name, route);
  }
  for (const p of properties) put("PROPERTY", p.id, p.asset.name, `/properties/${p.id}`);
  for (const c of commercial) put("COMMERCIAL_PROPERTY", c.id, c.name, `/commercial-properties/${c.id}`);
  for (const p of people) put("PERSON", p.id, p.name, `/people/${p.id}`);
  for (const e of entities) put("ENTITY", e.id, e.name, `/entities/${e.id}`);
  for (const l of loans) put("LIABILITY", l.id, l.name, `/liabilities/${l.id}`);
  for (const p of policies) {
    const what = p.kind.replace(/_/g, " ").toLowerCase();
    put("INSURANCE_POLICY", p.id, `${p.insurer ?? "Policy"} ${what}${p.asset ? ` (${p.asset.name})` : ""}`, `/insurance/${p.id}`);
  }
  for (const a of accounts) put("ACCOUNT", a.id, `${a.institution} ${a.accountName}`, `/banking/${a.id}`);
  for (const a of investments) put("INVESTMENT_ACCOUNT", a.id, a.institution, `/investments/${a.id}`);
  return out;
}

export function targetOf(map: Map<string, TargetInfo>, r: { targetType: string | null; targetId: string | null }): TargetInfo | null {
  return r.targetType && r.targetId ? map.get(`${r.targetType}:${r.targetId}`) ?? null : null;
}
