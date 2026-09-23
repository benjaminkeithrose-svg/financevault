import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ensurePersonalEntities } from "../src/services/personalEntity.js";
import { toIcs } from "../src/routes/calendar.js";

// People as entities, family links, ID records, sub-assets and the expiry
// calendar.

const agent = request.agent(app);
const iso = (d: string) => new Date(`${d}T00:00:00.000Z`).toISOString();

async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

beforeAll(async () => {
  await prisma.vault.deleteMany();
  expect((await agent.post("/api/vault/setup").send({ passcode: "family test passcode" })).status).toBe(201);
});

describe("people are entities", () => {
  it("creates a personal entity with the person, linked as owner", async () => {
    const person = await post("/people", { name: "Alex Example" });
    const full = (await agent.get(`/api/people/${person.id}`)).body;
    expect(full.personalEntity).toMatchObject({ name: "Alex Example", entityType: "INDIVIDUAL" });
    expect(full.entityRelationships.map((r: { relationshipType: string }) => r.relationshipType)).toContain("INDIVIDUAL_OWNER");
  });

  it("renames the personal entity along with the person", async () => {
    const person = await post("/people", { name: "Jo Smyth" });
    await agent.put(`/api/people/${person.id}`).send({ name: "Jo Smith" });
    const full = (await agent.get(`/api/people/${person.id}`)).body;
    expect(full.personalEntity.name).toBe("Jo Smith");
  });

  it("gives people recorded earlier a personal entity, adopting a hand-made one", async () => {
    const handMade = await prisma.entity.create({ data: { name: "Old (Personal)", entityType: "INDIVIDUAL" } });
    const old = await prisma.person.create({ data: { name: "Old Timer" } });
    await prisma.personEntityRelationship.create({
      data: { personId: old.id, entityId: handMade.id, relationshipType: "INDIVIDUAL_OWNER" },
    });
    const bare = await prisma.person.create({ data: { name: "No Entity Yet" } });
    await ensurePersonalEntities();
    expect((await prisma.person.findUnique({ where: { id: old.id } }))?.entityId).toBe(handMade.id);
    expect((await prisma.person.findUnique({ where: { id: bare.id } }))?.entityId).toBeTruthy();
  });

  it("won't delete a personal entity on its own", async () => {
    const person = await post("/people", { name: "Keep Together" });
    const full = (await agent.get(`/api/people/${person.id}`)).body;
    const res = await agent.delete(`/api/entities/${full.personalEntity.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Delete the person instead/);
  });

  it("deleting a person removes their empty personal entity, but not one that owns things", async () => {
    const person = await post("/people", { name: "Short Stay" });
    const entityId = (await agent.get(`/api/people/${person.id}`)).body.personalEntity.id;
    expect((await agent.delete(`/api/people/${person.id}`)).status).toBe(204);
    expect(await prisma.entity.findUnique({ where: { id: entityId } })).toBeNull();

    const owner = await post("/people", { name: "Car Owner" });
    const ownerEntityId = (await agent.get(`/api/people/${owner.id}`)).body.personalEntity.id;
    await post("/assets", { name: "Ute", assetType: "VEHICLE", entityId: ownerEntityId, currentValue: 10_000 });
    const res = await agent.delete(`/api/people/${owner.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 asset/);
  });
});

describe("family and the family trust", () => {
  it("offers the partner and children when a parent becomes trustee, and adds only who's ticked", async () => {
    const mum = await post("/people", { name: "Mum" });
    const dad = await post("/people", { name: "Dad" });
    const kid1 = await post("/people", { name: "Kid One" });
    const kid2 = await post("/people", { name: "Kid Two" });
    await post("/people/family", { personId: mum.id, relatedPersonId: dad.id, relation: "PARTNER" });
    await post("/people/family", { personId: mum.id, relatedPersonId: kid1.id, relation: "CHILD" });
    await post("/people/family", { personId: kid2.id, relatedPersonId: mum.id, relation: "PARENT" });

    const duplicate = await agent.post("/api/people/family").send({ personId: dad.id, relatedPersonId: mum.id, relation: "PARTNER" });
    expect(duplicate.status).toBe(409);

    const trust = await post("/entities", { name: "Family Trust", entityType: "TRUST" });
    const rel = await post("/people/relationships", { personId: mum.id, entityId: trust.id, relationshipType: "TRUSTEE" });
    const names = rel.familySuggestions.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(["Dad", "Kid One", "Kid Two"]);

    // Untick Dad.
    await post(`/entities/${trust.id}/beneficiaries`, { personIds: [kid1.id, kid2.id] });
    const beneficiaries = await prisma.personEntityRelationship.findMany({
      where: { entityId: trust.id, relationshipType: "BENEFICIARY" },
    });
    expect(beneficiaries.map((b) => b.personId).sort()).toEqual([kid1.id, kid2.id].sort());

    // Dad joining as appointor: the kids are already beneficiaries, so only Mum is offered.
    const dadRel = await post("/people/relationships", { personId: dad.id, entityId: trust.id, relationshipType: "APPOINTOR" });
    expect(dadRel.familySuggestions.map((s: { name: string }) => s.name)).toEqual(["Mum"]);
  });

  it("offers nothing for a company", async () => {
    const p = await post("/people", { name: "Director Person" });
    const co = await post("/entities", { name: "Some Pty Ltd", entityType: "COMPANY" });
    const rel = await post("/people/relationships", { personId: p.id, entityId: co.id, relationshipType: "DIRECTOR" });
    expect(rel.familySuggestions).toEqual([]);
  });
});

describe("ID and cover records", () => {
  it("stores numbers encrypted, shows them masked, and reveals on request", async () => {
    const p = await post("/people", { name: "Card Holder" });
    const record = await post("/identity", {
      personId: p.id,
      kind: "MEDICARE",
      number: "2123 45670 1",
      referenceNumber: "1",
      expiryDate: iso("2027-05-01"),
    });
    expect(record.numberMasked).toBe("•••• 701");
    expect(JSON.stringify(record)).not.toMatch(/2123/);
    const raw = await prisma.$queryRawUnsafe<Array<{ number: string }>>(`SELECT number FROM IdentityRecord WHERE id = ?`, record.id);
    expect(raw[0].number).toMatch(/^enc:v1:/);
    const revealed = (await agent.get(`/api/identity/${record.id}/reveal`)).body;
    expect(revealed.number).toBe("2123 45670 1");
    const audit = await prisma.auditLog.findFirst({ where: { action: "IDENTITY_NUMBER_REVEALED", targetId: record.id } });
    expect(audit).not.toBeNull();
  });
});

describe("sub-assets", () => {
  it("sit under their parent, don't add to net worth, and total their running costs", async () => {
    const owner = await post("/entities", { name: "Sub-asset Owner", entityType: "TRUST" });
    const house = await post("/assets", { name: "Rental", assetType: "OTHER", entityId: owner.id, currentValue: 500_000 });
    const aircon = await post("/assets", {
      name: "Split system",
      assetType: "OTHER",
      parentAssetId: house.id,
      itemCategory: "HEATING_COOLING",
      acquisitionCost: 2_400,
      currentValue: 2_000,
      warrantyExpiry: iso("2030-01-01"),
    });
    expect(aircon.entityId).toBe(owner.id);
    await post(`/assets/${aircon.id}/maintenance`, { date: iso("2025-01-10"), kind: "SERVICE", description: "Clean", cost: 180 });
    await post(`/assets/${aircon.id}/maintenance`, {
      date: iso("2026-01-10"),
      kind: "REPAIR",
      description: "Fan motor",
      cost: 420,
      nextDueDate: iso("2030-06-01"),
    });

    const nw = (await agent.get(`/api/net-worth/preview?entityId=${owner.id}`)).body;
    expect(nw.totalAssets).toBe(500_000);

    const parent = (await agent.get(`/api/assets/${house.id}`)).body;
    expect(parent.items).toHaveLength(1);
    expect(parent.items[0]).toMatchObject({ name: "Split system", maintenanceCost: 600, lifetimeCost: 3_000 });

    const list = (await agent.get(`/api/assets?entityId=${owner.id}`)).body as Array<{ id: string }>;
    expect(list.map((a) => a.id)).toEqual([house.id]);

    const del = await agent.delete(`/api/assets/${house.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/1 item under it/);

    const events = (await agent.get("/api/calendar?from=2029-01-01&to=2031-01-01")).body as Array<{ title: string }>;
    expect(events.map((e) => e.title)).toEqual(
      expect.arrayContaining(["Warranty ends — Split system", "Service due — Split system"])
    );
  });
});

describe("expiry calendar", () => {
  it("writes a valid calendar file with all-day events and a reminder", () => {
    const ics = toIcs(
      [{ id: "x1", date: "2027-03-04", category: "ID", title: "Passport expires — Sam, Jr; test", detail: null, route: "/" }],
      new Date("2026-01-01T00:00:00Z")
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270304");
    expect(ics).toContain("DTEND;VALUE=DATE:20270305");
    expect(ics).toContain("SUMMARY:Passport expires — Sam\\, Jr\\; test");
    expect(ics).toContain("TRIGGER:-P14D");
  });

  it("serves the calendar file", async () => {
    const res = await agent.get("/api/calendar/expiries.ics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/calendar/);
  });
});

describe("diagram", () => {
  it("shows a person and their personal entity as one box, owning things directly", async () => {
    const person = await post("/people", { name: "Diagram Person" });
    const entityId = (await agent.get(`/api/people/${person.id}`)).body.personalEntity.id;
    const car = await post("/assets", { name: "Diagram Car", assetType: "VEHICLE", entityId, currentValue: 5_000 });
    const graph = (await agent.get("/api/graph")).body as {
      nodes: Array<{ id: string }>;
      edges: Array<{ from: string; to: string }>;
    };
    expect(graph.nodes.some((n) => n.id === `entity:${entityId}`)).toBe(false);
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: `person:${person.id}`, to: `asset:${car.id}` }));
  });
});
