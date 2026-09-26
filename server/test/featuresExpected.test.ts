import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { lastCompletedFy } from "../src/services/expected.js";

// Batch 5: feature switches, and "What's missing" — the insurance and
// paperwork expected for what's recorded.

describe("what's missing — the year it checks", () => {
  it("defaults to the financial year that has most recently ended", () => {
    expect(lastCompletedFy(new Date("2026-09-26"))).toBe("2025-26");
    expect(lastCompletedFy(new Date("2026-06-30"))).toBe("2024-25");
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  async function post(p: string, body: unknown) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  /** A person, with their personal entity (made alongside them). */
  async function person(body: unknown) {
    const created = await post("/people", body);
    return (await agent.get(`/api/people/${created.id}`)).body;
  }
  type Item = { key: string; label: string; level: string; met: boolean; dismissed: unknown; addAs: string };
  type Group = { target: string; items: Item[] };
  async function group(target: string, fy = "2025-26"): Promise<Group> {
    const res = await agent.get(`/api/expected?fy=${fy}&target=${encodeURIComponent(target)}`).expect(200);
    return res.body.groups[0];
  }
  const find = (g: Group, addAs: string) => g.items.find((i) => i.addAs === addAs)!;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "features expected test passcode" })).status).toBe(201);
  });

  it("switches features off and on without losing anything", async () => {
    let s = (await agent.put("/api/settings").send({ featuresOff: ["gmail", "smsf", "gmail"] }).expect(200)).body;
    expect(s.featuresOff).toEqual(["gmail", "smsf"]);
    expect((await agent.get("/api/settings")).body.featuresOff).toEqual(["gmail", "smsf"]);
    await agent.put("/api/settings").send({ featuresOff: ["Not A Feature!"] }).expect(400);
    s = (await agent.put("/api/settings").send({ featuresOff: [] }).expect(200)).body;
    expect(s.featuresOff).toEqual([]);
  });

  it("expects landlord and building cover on a rental, and ticks it off when a policy is added", async () => {
    const owner = await person({ name: "Robin Landlord", grossSalary: 120_000 });
    const rental = await post("/properties", { name: "9 Rent St", address: "9 Rent St, Parramatta NSW", state: "NSW", entityId: owner.entityId, currentValue: 900_000 });
    await post("/liabilities", { name: "Rental loan", liabilityType: "INVESTMENT_LOAN", entityId: owner.entityId, currentBalance: 600_000, securityPropertyId: rental.id });

    let g = await group(`asset:${rental.assetId}`);
    expect(find(g, "LANDLORD")).toMatchObject({ level: "RED", met: false });
    expect(find(g, "BUILDING")).toMatchObject({ level: "RED", met: false });
    expect(find(g, "Rental Statement").met).toBe(false);
    expect(find(g, "Loan Statement").level).toBe("RED"); // mortgaged, so the interest statement is expected

    await post("/insurance", { kind: "LANDLORD", insurer: "Terri Scheer", assetId: rental.assetId, entityId: owner.entityId });
    g = await group(`asset:${rental.assetId}`);
    expect(find(g, "LANDLORD").met).toBe(true);

    // Building cover inside the landlord policy: set it aside with the reason, and bring it back.
    const building = find(g, "BUILDING");
    await agent.put("/api/expected/set-aside").send({ key: building.key, reason: "Landlord policy includes building" }).expect(200);
    g = await group(`asset:${rental.assetId}`);
    expect(find(g, "BUILDING").dismissed).toMatchObject({ reason: "Landlord policy includes building" });
    await agent.put("/api/expected/set-aside").send({ key: building.key, reason: "" }).expect(400);
    await agent.delete(`/api/expected/set-aside?key=${encodeURIComponent(building.key)}`).expect(204);
    expect(find(await group(`asset:${rental.assetId}`), "BUILDING").dismissed).toBeNull();
  });

  it("counts a yearly document only when it's linked and in that year", async () => {
    const owner = await person({ name: "Casey Docs", grossSalary: 90_000 });
    const rental = await post("/properties", { name: "3 Paper Rd", address: "3 Paper Rd, Newcastle NSW", state: "NSW", entityId: owner.entityId, currentValue: 600_000 });
    const upload = (await agent.post("/api/documents/upload").attach("file", Buffer.from("End of financial year rental statement 3 Paper Rd"), { filename: "eofy-3-paper.txt", contentType: "text/plain" })).body.document;
    await agent.put(`/api/documents/${upload.id}`).send({ documentType: "Rental Statement", financialYearLabel: "2025-26" }).expect(200);

    // Not linked yet: doesn't count.
    expect(find(await group(`asset:${rental.assetId}`), "Rental Statement").met).toBe(false);
    await post(`/documents/${upload.id}/links`, { targetType: "PROPERTY", targetId: rental.id });
    expect(find(await group(`asset:${rental.assetId}`), "Rental Statement").met).toBe(true);
    // A different year still needs its own.
    expect(find(await group(`asset:${rental.assetId}`, "2024-25"), "Rental Statement").met).toBe(false);
  });

  it("expects a green slip on a car, contents only on a strata home, and trust distribution minutes", async () => {
    const owner = await person({ name: "Drew Driver", grossSalary: 60_000 });
    const car = await post("/assets", { name: "Family car", assetType: "VEHICLE", vehicleType: "CAR", entityId: owner.entityId, currentValue: 30_000 });
    const g = await group(`asset:${car.id}`);
    expect(find(g, "CTP")).toMatchObject({ level: "RED", label: "CTP green slip" });
    expect(find(g, "MOTOR").level).toBe("AMBER");
    await post("/insurance", { kind: "CTP", insurer: "NRMA", assetId: car.id, entityId: owner.entityId });
    expect(find(await group(`asset:${car.id}`), "CTP").met).toBe(true);

    const flat = await post("/properties", { name: "Unit 4", address: "4/10 High St, Sydney NSW", state: "NSW", entityId: owner.entityId, currentValue: 700_000, strataFees: 4_000 });
    await agent.put(`/api/assets/${flat.assetId}`).send({ mainResidence: "FULL" }).expect(200);
    const home = await group(`asset:${flat.assetId}`);
    expect(home.items.map((i) => i.addAs)).toContain("CONTENTS");
    expect(home.items.map((i) => i.addAs)).not.toContain("BUILDING"); // the strata policy covers the building
    expect(home.items.map((i) => i.addAs)).not.toContain("Rental Statement");

    const trust = await post("/entities", { name: "Driver Family Trust", entityType: "TRUST" });
    const t = await group(`entity:${trust.id}`);
    expect(find(t, "Trust Deed").level).toBe("RED");
    expect(find(t, "Distribution Minutes").level).toBe("RED");
  });

  it("suggests private hospital cover above the surcharge threshold, and shows the count on the dashboard", async () => {
    const high = await person({ name: "Morgan High", grossSalary: 150_000 });
    const low = await person({ name: "Lee Low", grossSalary: 50_000 });
    expect(find(await group(`person:${high.id}`), "PRIVATE_HEALTH").met).toBe(false);
    expect((await group(`person:${low.id}`)).items.map((i) => i.addAs)).not.toContain("PRIVATE_HEALTH");

    const dash = (await agent.get("/api/dashboard")).body;
    expect(dash.missing.red).toBeGreaterThan(0);
    await agent.put("/api/settings").send({ featuresOff: ["expected"] }).expect(200);
    expect((await agent.get("/api/dashboard")).body.missing).toBeNull();
    await agent.put("/api/settings").send({ featuresOff: [] }).expect(200);
  });
});
