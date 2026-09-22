import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

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
    const [people, entities, assets, accounts, investmentAccounts, liabilities] = await Promise.all([
      prisma.person.findMany({ include: { entityRelationships: true } }),
      prisma.entity.findMany({ include: { relationshipsFrom: true } }),
      prisma.asset.findMany({ include: { property: true, commercialProperty: true } }),
      prisma.account.findMany(),
      prisma.investmentAccount.findMany(),
      prisma.liability.findMany(),
    ]);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const p of people) {
      nodes.push({ id: `person:${p.id}`, type: "PERSON", label: p.name, route: `/people/${p.id}` });
    }
    for (const e of entities) {
      nodes.push({ id: `entity:${e.id}`, type: "ENTITY", label: e.name, sublabel: e.entityType, route: `/entities/${e.id}` });
    }
    for (const p of people) {
      for (const r of p.entityRelationships) {
        edges.push({ from: `person:${p.id}`, to: `entity:${r.entityId}`, label: r.relationshipType });
      }
    }
    for (const e of entities) {
      for (const r of e.relationshipsFrom) {
        edges.push({ from: `entity:${e.id}`, to: `entity:${r.toEntityId}`, label: r.relationshipType });
      }
    }

    for (const a of assets) {
      let route = "/assets";
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
      edges.push({ from: `entity:${a.entityId}`, to: `asset:${a.id}`, label: "Owns" });
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
      edges.push({ from: `entity:${a.entityId}`, to: `account:${a.id}`, label: "Owns" });
    }

    for (const a of investmentAccounts) {
      nodes.push({
        id: `investment:${a.id}`,
        type: "INVESTMENT",
        label: a.institution,
        sublabel: a.accountType,
        route: `/investments/${a.id}`,
      });
      edges.push({ from: `entity:${a.entityId}`, to: `investment:${a.id}`, label: "Owns" });
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
      edges.push({ from: `entity:${l.entityId}`, to: `liability:${l.id}`, label: "Owes" });
      if (l.securityPropertyId) {
        const secured = assets.find((a) => a.property?.id === l.securityPropertyId);
        if (secured) edges.push({ from: `liability:${l.id}`, to: `asset:${secured.id}`, label: "Secured by" });
      }
      if (l.securityCommercialPropertyId) {
        const secured = assets.find((a) => a.commercialProperty?.id === l.securityCommercialPropertyId);
        if (secured) edges.push({ from: `liability:${l.id}`, to: `asset:${secured.id}`, label: "Secured by" });
      }
    }

    res.json({ nodes, edges });
  })
);
