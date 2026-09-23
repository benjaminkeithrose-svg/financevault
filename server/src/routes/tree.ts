import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { computeLiveBreakdown } from "../services/netWorth.js";
import { shareOf } from "../services/ownership.js";

/**
 * The asset tree: people at the top, the entities they own things through,
 * each entity's assets, the items under those assets, and what hangs off
 * each one — loans secured on it, insurance, documents, servicing.
 *
 * An entity can sit under several people (both parents are trustees of the
 * family trust), so entities are sent once in `entities` and the people's
 * branches refer to them by id. Values at each level are that person's or
 * entity's own figures, so shared things count at their share.
 */
export const treeRouter = Router();

export interface TreeNode {
  id: string;
  kind: "ASSET" | "ITEM" | "LOAN" | "ACCOUNT" | "INVESTMENT" | "POLICY" | "GROUP" | "ENTITY_REF";
  label: string;
  sublabel?: string | null;
  value?: number | null;
  /** Negative for what's owed. */
  sign?: 1 | -1;
  route?: string;
  badges?: string[];
  entityId?: string;
  children: TreeNode[];
}

const DAY = 86_400_000;
const shortDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;

treeRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const today = new Date();
    const [people, entities, assets, liabilities, accounts, investmentAccounts, links, unitRelations, policies] = await Promise.all([
      prisma.person.findMany({ orderBy: { name: "asc" }, include: { entityRelationships: true } }),
      prisma.entity.findMany({ orderBy: { name: "asc" }, include: { personalFor: { select: { id: true } } } }),
      prisma.asset.findMany({
        include: {
          ownerships: true,
          property: { select: { id: true } },
          commercialProperty: { select: { id: true } },
          maintenance: { select: { nextDueDate: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.liability.findMany({ include: { ownerships: true, entity: { select: { name: true } } }, orderBy: { name: "asc" } }),
      prisma.account.findMany({ include: { ownerships: true }, orderBy: { institution: "asc" } }),
      prisma.investmentAccount.findMany({ include: { ownerships: true }, orderBy: { institution: "asc" } }),
      prisma.documentLink.groupBy({ by: ["targetType", "targetId"], _count: { _all: true } }),
      prisma.entityRelationship.findMany({ where: { relationshipType: "UNITHOLDER" }, include: { toEntity: { select: { name: true } } } }),
      prisma.insurancePolicy.findMany({ orderBy: { renewalDate: "asc" } }),
    ]);

    const docCount = new Map(links.map((l) => [`${l.targetType}:${l.targetId}`, l._count._all]));
    const docs = (...keys: string[]) => keys.reduce((s, k) => s + (docCount.get(k) ?? 0), 0);
    const docBadge = (n: number) => (n > 0 ? [`${n} document${n === 1 ? "" : "s"}`] : []);

    const children = new Map<string, typeof assets>();
    for (const a of assets) if (a.parentAssetId) children.set(a.parentAssetId, [...(children.get(a.parentAssetId) ?? []), a]);

    const policyNode = (p: (typeof policies)[number]): TreeNode => ({
      id: `policy:${p.id}`,
      kind: "POLICY",
      label: p.insurer ? `${p.insurer} — ${policyKindLabel(p.kind)}` : policyKindLabel(p.kind),
      sublabel: p.coverAmount ? `Cover ${money(p.coverAmount)}` : null,
      route: `/insurance/${p.id}`,
      badges: [
        ...(p.renewalDate ? [renewalBadge(p.renewalDate, today)] : []),
        ...docBadge(docs(`INSURANCE_POLICY:${p.id}`)),
      ],
      children: [],
    });

    const loanNode = (l: (typeof liabilities)[number], viewer?: string): TreeNode => {
      const share = viewer ? shareOf(l, viewer) : 1;
      return {
        id: `loan:${l.id}`,
        kind: "LOAN",
        label: l.name,
        sublabel: [
          l.lender,
          share > 0 && share < 1 && l.currentBalance ? `${pct(share)} share of ${money(l.currentBalance)}` : null,
          viewer && l.entityId !== viewer && share === 0 ? `owed by ${l.entity.name}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        value: l.currentBalance === null ? null : l.currentBalance * (share > 0 ? share : 1),
        sign: -1,
        route: `/liabilities/${l.id}`,
        badges: docBadge(docs(`LIABILITY:${l.id}`)),
        children: [],
      };
    };

    const assetRoute = (a: (typeof assets)[number]) =>
      a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : `/assets/${a.id}`;

    const securedBy = (a: (typeof assets)[number]) =>
      liabilities.filter(
        (l) =>
          (a.property && l.securityPropertyId === a.property.id) ||
          (a.commercialProperty && l.securityCommercialPropertyId === a.commercialProperty.id) ||
          l.securityAssetId === a.id
      );

    const assetNode = (a: (typeof assets)[number], viewer: string | null, depth = 0): TreeNode => {
      const share = viewer && depth === 0 ? shareOf(a, viewer) : 1;
      const nextDue = a.maintenance
        .map((m) => m.nextDueDate)
        .filter((d): d is Date => !!d && d.getTime() > today.getTime() - 31 * DAY)
        .sort((x, y) => x.getTime() - y.getTime())[0];
      const docTotal = docs(
        `ASSET:${a.id}`,
        ...(a.property ? [`PROPERTY:${a.property.id}`] : []),
        ...(a.commercialProperty ? [`COMMERCIAL_PROPERTY:${a.commercialProperty.id}`] : [])
      );
      return {
        id: `asset:${a.id}`,
        kind: depth === 0 ? "ASSET" : "ITEM",
        label: a.name,
        sublabel: [
          assetKindLabel(a.assetType, depth),
          share < 1 && a.currentValue ? `${pct(share)} share of ${money(a.currentValue)}` : null,
          a.disposalDate ? `sold ${shortDate(a.disposalDate)}${a.disposalValue ? ` for ${money(a.disposalValue)}` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        // Items are part of their parent's value, so theirs is shown as cost, not added up.
        value: depth > 0 ? a.acquisitionCost : a.currentValue === null ? null : a.currentValue * share,
        route: assetRoute(a),
        badges: [
          ...(depth > 0 ? ["part of the value above"] : []),
          ...(a.warrantyExpiry && a.warrantyExpiry >= today ? [`warranty to ${shortDate(a.warrantyExpiry)}`] : []),
          ...(nextDue ? [`service due ${shortDate(nextDue)}`] : []),
          ...(a.registrationExpiry ? [renewalBadge(a.registrationExpiry, today, "rego")] : []),
          ...docBadge(docTotal),
        ],
        children: [
          ...(children.get(a.id) ?? []).map((c) => assetNode(c, viewer, depth + 1)),
          ...(depth === 0 ? securedBy(a).map((l) => loanNode(l, viewer ?? undefined)) : []),
          ...policies.filter((p) => p.assetId === a.id).map(policyNode),
        ],
      };
    };

    /** Everything an entity owns (or owes, or holds), for its branch. */
    const entityContents = (entityId: string): TreeNode[] => {
      const owns = (r: { entityId: string; ownerships: Array<{ ownerEntityId: string }> }) =>
        r.entityId === entityId || r.ownerships.some((o) => o.ownerEntityId === entityId);
      const mine = assets.filter((a) => !a.parentAssetId && owns(a));
      const current = mine.filter((a) => !a.disposalDate || a.disposalDate > today);
      const sold = mine.filter((a) => a.disposalDate && a.disposalDate <= today);
      const shownLoans = new Set(current.flatMap((a) => securedBy(a).map((l) => l.id)));
      const otherLoans = liabilities.filter((l) => owns(l) && !shownLoans.has(l.id));
      const nodes: TreeNode[] = current.map((a) => assetNode(a, entityId));
      for (const acc of accounts.filter(owns)) {
        const share = shareOf(acc, entityId);
        nodes.push({
          id: `account:${acc.id}`,
          kind: "ACCOUNT",
          label: `${acc.institution} — ${acc.accountName}`,
          sublabel: ["Bank account", share < 1 && acc.currentBalance ? `${pct(share)} share of ${money(acc.currentBalance)}` : null]
            .filter(Boolean)
            .join(" · "),
          value: acc.currentBalance === null ? null : acc.currentBalance * share,
          route: `/banking/${acc.id}`,
          badges: docBadge(docs(`ACCOUNT:${acc.id}`)),
          children: [],
        });
      }
      for (const inv of investmentAccounts.filter(owns)) {
        const share = shareOf(inv, entityId);
        nodes.push({
          id: `investment:${inv.id}`,
          kind: "INVESTMENT",
          label: inv.institution,
          sublabel: ["Investment account", share < 1 ? `${pct(share)} share` : null].filter(Boolean).join(" · "),
          route: `/investments/${inv.id}`,
          badges: docBadge(docs(`INVESTMENT_ACCOUNT:${inv.id}`)),
          children: [],
        });
      }
      for (const u of unitRelations.filter((r) => r.fromEntityId === entityId)) {
        nodes.push({
          id: `units:${u.id}`,
          kind: "ENTITY_REF",
          entityId: u.toEntityId,
          label: u.toEntity.name,
          sublabel: `Units · ${u.ownershipPercent ?? 0}% of the trust`,
          value: (Math.max(0, values.get(u.toEntityId) ?? 0) * (u.ownershipPercent ?? 0)) / 100,
          route: `/entities/${u.toEntityId}`,
          children: [],
        });
      }
      nodes.push(...policies.filter((p) => !p.assetId && p.entityId === entityId).map(policyNode));
      if (otherLoans.length) {
        nodes.push({
          id: `debts:${entityId}`,
          kind: "GROUP",
          label: "Other debts",
          children: otherLoans.map((l) => loanNode(l, entityId)),
        });
      }
      if (sold.length) {
        nodes.push({ id: `sold:${entityId}`, kind: "GROUP", label: "Sold", children: sold.map((a) => assetNode(a, entityId)) });
      }
      return nodes;
    };

    // Each entity's own figures, once.
    const values = new Map<string, number>();
    for (const e of entities) values.set(e.id, (await computeLiveBreakdown(e.id)).netPosition);

    const entityNodes: Record<string, { id: string; name: string; type: string; value: number; route: string; children: TreeNode[] }> = {};
    for (const e of entities) {
      entityNodes[e.id] = {
        id: e.id,
        name: e.name,
        type: e.entityType,
        value: values.get(e.id) ?? 0,
        route: e.personalFor ? `/people/${e.personalFor.id}` : `/entities/${e.id}`,
        children: entityContents(e.id),
      };
    }

    const linked = new Set<string>();
    const peopleOut = people.map((p) => {
      if (p.entityId) linked.add(p.entityId);
      const roles = new Map<string, string[]>();
      for (const r of p.entityRelationships) {
        if (r.entityId === p.entityId) continue;
        roles.set(r.entityId, [...(roles.get(r.entityId) ?? []), r.relationshipType]);
        linked.add(r.entityId);
      }
      return {
        id: p.id,
        name: p.name,
        route: `/people/${p.id}`,
        value: p.entityId ? values.get(p.entityId) ?? 0 : 0,
        ownEntityId: p.entityId,
        ownPolicies: policies.filter((x) => x.personId === p.id).map(policyNode),
        structures: [...roles.entries()].map(([entityId, types]) => ({ entityId, roles: types })),
      };
    });

    // Entities held as units by another entity are reachable through it.
    for (const u of unitRelations) linked.add(u.toEntityId);
    const unlinked = entities.filter((e) => !linked.has(e.id) && !e.personalFor).map((e) => e.id);

    res.json({ people: peopleOut, entities: entityNodes, unlinked, familyNet: (await computeLiveBreakdown()).netPosition });
  })
);

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function renewalBadge(date: Date, today: Date, what = "renews"): string {
  const days = Math.round((date.getTime() - today.getTime()) / DAY);
  if (days < 0) return `${what === "rego" ? "rego" : "renewal"} overdue`;
  return `${what} ${shortDate(date)}`;
}

const ASSET_KINDS: Record<string, string> = {
  PROPERTY: "Property",
  COMMERCIAL_PROPERTY: "Commercial property",
  VEHICLE: "Vehicle or boat",
  SUPERANNUATION: "Super",
  SHARES: "Shares",
  MANAGED_FUND: "Managed fund",
  EQUIPMENT: "Equipment",
  COLLECTIBLE: "Collectible",
  CASH: "Cash",
  OTHER: "Other asset",
};

function assetKindLabel(type: string, depth: number) {
  return depth > 0 ? "Item" : ASSET_KINDS[type] ?? "Asset";
}

export const POLICY_KINDS: Record<string, string> = {
  BUILDING: "Building insurance",
  CONTENTS: "Contents insurance",
  BUILDING_AND_CONTENTS: "Home and contents",
  LANDLORD: "Landlord insurance",
  STRATA: "Strata insurance",
  MOTOR: "Car or motorbike insurance",
  BOAT: "Boat insurance",
  PUBLIC_LIABILITY: "Public liability",
  LIFE: "Life cover",
  TPD: "TPD cover",
  TRAUMA: "Trauma cover",
  INCOME_PROTECTION: "Income protection",
  BUSINESS: "Business insurance",
  OTHER: "Insurance",
};

export function policyKindLabel(kind: string): string {
  return POLICY_KINDS[kind] ?? "Insurance";
}
