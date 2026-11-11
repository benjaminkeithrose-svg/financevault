import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { shareOf } from "../src/services/ownership.js";

// Shared ownership (several owners with percentages), each owner's share in
// their own figures, and unit trusts whose units count for their holders.

const agent = request.agent(app);
async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const live = async (entityId?: string) => (await agent.get(`/api/net-worth/preview${entityId ? `?entityId=${entityId}` : ""}`)).body;

describe("shareOf", () => {
  const row = (ownerEntityId: string, ownershipPercent: number) => ({ ownerEntityId, ownershipPercent });
  it("gives the owner on record everything when nothing is split", () => {
    expect(shareOf({ entityId: "a", ownerships: [] }, "a")).toBe(1);
    expect(shareOf({ entityId: "a", ownerships: [] }, "b")).toBe(0);
  });
  it("gives the owner on record what the listed shares leave", () => {
    const r = { entityId: "a", ownerships: [row("b", 30)] };
    expect(shareOf(r, "a")).toBeCloseTo(0.7);
    expect(shareOf(r, "b")).toBeCloseTo(0.3);
  });
  it("uses the listed share when the owner on record is listed too", () => {
    const r = { entityId: "a", ownerships: [row("a", 25), row("b", 25), row("c", 50)] };
    expect(shareOf(r, "a")).toBeCloseTo(0.25);
    expect(shareOf(r, "c")).toBeCloseTo(0.5);
  });
  it("ignores a share that has ended", () => {
    const r = { entityId: "a", ownerships: [{ ...row("b", 50), endDate: new Date("2020-01-01") }] };
    expect(shareOf(r, "a")).toBe(1);
  });
});

describe("shared ownership and unit trusts", () => {
  let alex: { id: string; entityId: string };
  let sam: { id: string; entityId: string };
  let jo: { id: string; entityId: string };
  let kim: { id: string; entityId: string };
  let baseline: { netPosition: number };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "ownership test passcode" })).status).toBe(201);
    baseline = await live();
    const person = async (name: string) => (await agent.get(`/api/people/${(await post("/people", { name })).id}`)).body;
    alex = await person("Alex Owner");
    sam = await person("Sam Owner");
    jo = await person("Jo Holder");
    kim = await person("Kim Holder");
  });

  it("splits a house and its loan between two owners, and keeps the family total whole", async () => {
    const house = await post("/properties", {
      name: "1 Shared St",
      address: "1 Shared St",
      entityId: alex.entityId,
      currentValue: 800_000,
      owners: [
        { entityId: alex.entityId, percent: 50 },
        { entityId: sam.entityId, percent: 50 },
      ],
    });
    await post("/liabilities", {
      name: "Shared home loan",
      liabilityType: "HOME_LOAN",
      entityId: alex.entityId,
      currentBalance: 300_000,
      securityPropertyId: house.id,
      owners: [
        { entityId: alex.entityId, percent: 50 },
        { entityId: sam.entityId, percent: 50 },
      ],
    });
    const a = await live(alex.entityId);
    const s = await live(sam.entityId);
    expect(a.propertyValue).toBe(400_000);
    expect(s.propertyValue).toBe(400_000);
    expect(s.mortgages).toBe(150_000);
    expect(s.sharedItems).toBe(2);
    expect((await live()).netPosition - baseline.netPosition).toBe(500_000);
  });

  it("refuses owners that don't add up to 100%", async () => {
    const res = await agent.post("/api/assets").send({
      name: "Tinny",
      assetType: "VEHICLE",
      owners: [
        { entityId: alex.entityId, percent: 50 },
        { entityId: sam.entityId, percent: 40 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/add up to 90%/);
  });

  it("refuses an extra share that takes the split past 100%", async () => {
    const car = await post("/assets", { name: "Car", assetType: "VEHICLE", entityId: jo.entityId, currentValue: 20_000 });
    await post(`/assets/${car.id}/ownerships`, { ownerEntityId: kim.entityId, ownershipPercent: 60 });
    const res = await agent.post(`/api/assets/${car.id}/ownerships`).send({ ownerEntityId: sam.entityId, ownershipPercent: 50 });
    expect(res.status).toBe(400);
    // Jo is the owner on record and keeps the 40% left over.
    expect((await live(jo.entityId)).vehicleValue).toBe(8_000);
    await prisma.assetOwnership.deleteMany({ where: { assetId: car.id } });
    await prisma.asset.delete({ where: { id: car.id } });
  });

  it("counts each unitholder's share of a unit trust as theirs, without double counting", async () => {
    const before = (await live()).netPosition;
    const trust = await post("/entities", { name: "Four Ways Unit Trust", entityType: "UNIT_TRUST" });
    await post("/assets", { name: "Trust equipment", assetType: "EQUIPMENT", entityId: trust.id, currentValue: 400_000 });
    await post("/liabilities", { name: "Trust loan", liabilityType: "OTHER", entityId: trust.id, currentBalance: 100_000 });
    for (const p of [alex, sam, jo, kim]) {
      await post("/entities/relationships", { fromEntityId: p.entityId, toEntityId: trust.id, relationshipType: "UNITHOLDER", ownershipPercent: 25 });
    }
    const k = await live(kim.entityId);
    expect(k.unitHoldings).toEqual([expect.objectContaining({ trustName: "Four Ways Unit Trust", percent: 25, value: 75_000 })]);
    expect(k.netPosition).toBe(75_000);
    // The family total counts the trust's assets once.
    expect((await live()).netPosition - before).toBe(300_000);
    // And the side-by-side list still adds up to the family total.
    const dash = (await agent.get("/api/dashboard")).body;
    const sum = dash.consolidated?.byEntity ?? dash.byEntity;
    if (sum) {
      const total = sum.reduce((s: number, e: { netAssets: number }) => s + e.netAssets, 0);
      expect(Math.round(total)).toBe(Math.round((await live()).netPosition));
    }
  });

  it("keeps a unit trust's holdings to 100%, once each, and only in unit trusts", async () => {
    const trust = await post("/entities", { name: "Small Unit Trust", entityType: "UNIT_TRUST" });
    await post("/entities/relationships", { fromEntityId: alex.entityId, toEntityId: trust.id, relationshipType: "UNITHOLDER", ownershipPercent: 70 });
    const over = await agent.post("/api/entities/relationships").send({ fromEntityId: sam.entityId, toEntityId: trust.id, relationshipType: "UNITHOLDER", ownershipPercent: 40 });
    expect(over.status).toBe(400);
    const again = await agent.post("/api/entities/relationships").send({ fromEntityId: alex.entityId, toEntityId: trust.id, relationshipType: "UNITHOLDER", ownershipPercent: 10 });
    expect(again.status).toBe(409);
    const family = await post("/entities", { name: "Owner Family Trust", entityType: "TRUST" });
    const notUnit = await agent.post("/api/entities/relationships").send({ fromEntityId: alex.entityId, toEntityId: family.id, relationshipType: "UNITHOLDER", ownershipPercent: 10 });
    expect(notUnit.status).toBe(400);
  });

  it("shows each owner's share on the entity page and in the diagram", async () => {
    const samEntity = (await agent.get(`/api/entities/${sam.entityId}`)).body;
    expect(samEntity.sharedAssets.map((a: { name: string; sharePercent: number }) => [a.name, a.sharePercent])).toEqual([["1 Shared St", 50]]);
    const graph = (await agent.get("/api/graph")).body as { edges: Array<{ from: string; to: string; label: string }> };
    const houseEdges = graph.edges.filter((e) => e.label === "Owns 50%");
    expect(houseEdges.map((e) => e.from).sort()).toEqual([`person:${alex.id}`, `person:${sam.id}`].sort());
    expect(graph.edges.some((e) => e.from === `person:${kim.id}` && e.label === "UNITHOLDER 25%")).toBe(true);
  });
});
