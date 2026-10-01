import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ShareRow, shareOf } from "../services/ownership.js";

export const graphRouter = Router();

export interface GraphNode {
  id: string;
  type: "PERSON" | "ENTITY" | "ASSET" | "ACCOUNT" | "INVESTMENT" | "LIABILITY";
  label: string;
  sublabel?: string;
  value?: number | null;
  route?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

// Assembles the whole ownership structure as a node/edge graph — the data
// behind the Visualization page's flowchart. Every node links back to its
// own detail page so the diagram is a navigation surface, not just a
// picture.
graphRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [people, entities, assets, accounts, investmentAccounts, liabilities, family] = await Promise.all([
      prisma.person.findMany({ include: { entityRelationships: true } }),
      prisma.entity.findMany({ include: { relationshipsFrom: true } }),
      // Sold assets stay on record but aren't part of the structure any more.
      prisma.asset.findMany({
        where: { parentAssetId: null, OR: [{ disposalDate: null }, { disposalDate: { gt: new Date() } }] },
        include: { property: true, commercialProperty: true, ownerships: true },
      }),
      prisma.account.findMany(),
      prisma.investmentAccount.findMany(),
      prisma.liability.findMany({ include: { ownerships: true } }),
      prisma.personRelationship.findMany(),
    ]);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // A person and their personal entity are one box: what they hold in their
    // own name hangs straight off the person, rather than a second
    // "individual" box beside every person.
    const personOfEntity = new Map(people.filter((p) => p.entityId).map((p) => [p.entityId!, p.id]));
    const ent = (entityId: string) => {
      const personId = personOfEntity.get(entityId);
      return personId ? `person:${personId}` : `entity:${entityId}`;
    };

    for (const p of people) {
      nodes.push({ id: `person:${p.id}`, type: "PERSON", label: p.name, route: `/people/${p.id}` });
    }
    for (const e of entities) {
      if (personOfEntity.has(e.id)) continue;
      nodes.push({ id: `entity:${e.id}`, type: "ENTITY", label: e.name, sublabel: e.entityType, route: `/entities/${e.id}` });
    }
    for (const p of people) {
      for (const r of p.entityRelationships) {
        if (r.entityId === p.entityId) continue;
        edges.push({ from: `person:${p.id}`, to: ent(r.entityId), label: r.relationshipType });
      }
    }
    for (const f of family) {
      edges.push({
        from: `person:${f.fromPersonId}`,
        to: `person:${f.toPersonId}`,
        label: f.relationshipType === "PARTNER" ? "Partner" : "Parent of",
      });
    }
    for (const e of entities) {
      for (const r of e.relationshipsFrom) {
        const pct = r.ownershipPercent ? ` ${r.ownershipPercent}%` : "";
        edges.push({ from: ent(e.id), to: ent(r.toEntityId), label: `${r.relationshipType}${pct}` });
      }
    }

    // Something shared gets a line from each owner, labelled with their share.
    const ownerEdges = (record: { entityId: string; ownerships: ShareRow[] }, to: string, verb: string) => {
      const owners = [...new Set([record.entityId, ...record.ownerships.map((o) => o.ownerEntityId)])];
      const shares = owners.map((id) => ({ id, share: shareOf(record, id) })).filter((o) => o.share > 0);
      for (const o of shares) {
        edges.push({ from: ent(o.id), to, label: shares.length > 1 ? `${verb} ${Math.round(o.share * 1000) / 10}%` : verb });
      }
    };

    for (const a of assets) {
      let route = `/assets/${a.id}`;
      if (a.property) route = `/properties/${a.property.id}`;
      else if (a.commercialProperty) route = `/commercial-properties/${a.commercialProperty.id}`;
      nodes.push({
        id: `asset:${a.id}`,
        type: "ASSET",
        label: a.name,
        sublabel: a.assetType,
        value: a.currentValue,
        route,
      });
      ownerEdges(a, `asset:${a.id}`, "Owns");
    }

    for (const a of accounts) {
      nodes.push({
        id: `account:${a.id}`,
        type: "ACCOUNT",
        label: `${a.institution} — ${a.accountName}`,
        sublabel: a.accountType,
        value: a.currentBalance,
        route: `/banking/${a.id}`,
      });
      edges.push({ from: ent(a.entityId), to: `account:${a.id}`, label: "Owns" });
    }

    for (const a of investmentAccounts) {
      nodes.push({
        id: `investment:${a.id}`,
        type: "INVESTMENT",
        label: a.institution,
        sublabel: a.accountType,
        route: `/investments/${a.id}`,
      });
      edges.push({ from: ent(a.entityId), to: `investment:${a.id}`, label: "Owns" });
    }

    for (const l of liabilities) {
      nodes.push({
        id: `liability:${l.id}`,
        type: "LIABILITY",
        label: l.name,
        sublabel: l.liabilityType,
        value: l.currentBalance,
        route: `/liabilities/${l.id}`,
      });
      ownerEdges(l, `liability:${l.id}`, "Owes");
      if (l.securityPropertyId) {
        const secured = assets.find((a) => a.property?.id === l.securityPropertyId);
        if (secured) edges.push({ from: `liability:${l.id}`, to: `asset:${secured.id}`, label: "Secured by" });
      }
      if (l.securityCommercialPropertyId) {
        const secured = assets.find((a) => a.commercialProperty?.id === l.securityCommercialPropertyId);
        if (secured) edges.push({ from: `liability:${l.id}`, to: `asset:${secured.id}`, label: "Secured by" });
      }
      if (l.securityAssetId && assets.some((a) => a.id === l.securityAssetId)) {
        edges.push({ from: `liability:${l.id}`, to: `asset:${l.securityAssetId}`, label: "Paid for" });
      }
    }

    res.json({ nodes, edges });
  })
);
