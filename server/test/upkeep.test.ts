import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { saleGains } from "../src/services/assetSaleCgt.js";
import { ensureMonthlySnapshot } from "../src/services/monthlySnapshot.js";
import { staleValues } from "../src/services/upkeep.js";

// Selling (kept on record, out of the totals, capital gain per owner),
// values that haven't been looked at, the monthly snapshot, the checklist.

const agent = request.agent(app);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe("capital gain on a sale", () => {
  const people = new Map([
    ["a", { name: "Alex", entityType: "INDIVIDUAL" }],
    ["t", { name: "Family Trust", entityType: "TRUST" }],
  ]);
  const house = {
    id: "h",
    name: "House",
    assetType: "PROPERTY",
    entityId: "a",
    acquisitionDate: d("2015-07-01"),
    acquisitionCost: 500_000,
    disposalDate: d("2026-09-01"),
    disposalValue: 900_000,
    buyingCosts: 25_000,
    improvementsCost: 40_000,
    sellingCosts: 15_000,
    mainResidence: "NONE",
    mainResidencePercent: null,
    ownerships: [],
  };

  it("takes the cost base from purchase, buying costs, improvements and selling costs", () => {
    const [row] = saleGains(house, people);
    expect(row.costBase).toBe(580_000);
    expect(row.grossGain).toBe(320_000);
    expect(row.discountEligible).toBe(true);
  });

  it("exempts a main residence for a person, but not for a trust", () => {
    expect(saleGains({ ...house, mainResidence: "FULL" }, people)[0].grossGain).toBe(0);
    expect(saleGains({ ...house, mainResidence: "PARTIAL", mainResidencePercent: 25 }, people)[0].grossGain).toBe(240_000);
    const trustOwned = saleGains({ ...house, entityId: "t", mainResidence: "FULL" }, people)[0];
    expect(trustOwned.grossGain).toBe(320_000);
    expect(trustOwned.notes.join(" ")).toMatch(/doesn't apply/);
  });

  it("splits the gain between owners by their shares", () => {
    const rows = saleGains({ ...house, ownerships: [{ ownerEntityId: "t", ownershipPercent: 40 }] }, people);
    expect(rows.map((r) => [r.entityId, Math.round(r.grossGain)])).toEqual([
      ["a", 192_000],
      ["t", 128_000],
    ]);
  });

  it("works out nothing for a car", () => {
    expect(saleGains({ ...house, assetType: "VEHICLE" }, people)).toEqual([]);
  });
});

describe("selling, stale values and the monthly snapshot", () => {
  let owner: { entityId: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "upkeep test passcode" })).status).toBe(201);
    const p = await post("/people", { name: "Upkeep Owner" });
    owner = (await agent.get(`/api/people/${p.id}`)).body;
  });

  it("keeps a sold property on record but takes it out of the totals, and shows the gain in the report", async () => {
    const before = (await agent.get(`/api/net-worth/preview?entityId=${owner.entityId}`)).body.netPosition;
    const property = await post("/properties", {
      name: "9 Sold St",
      address: "9 Sold St",
      entityId: owner.entityId,
      currentValue: 700_000,
      purchasePrice: 400_000,
      purchaseDate: d("2018-02-01").toISOString(),
    });
    expect((await agent.get(`/api/net-worth/preview?entityId=${owner.entityId}`)).body.netPosition - before).toBe(700_000);
    await agent.put(`/api/assets/${property.assetId}`).send({ disposalDate: d("2026-08-15").toISOString(), disposalValue: 750_000, sellingCosts: 20_000 });
    expect((await agent.get(`/api/net-worth/preview?entityId=${owner.entityId}`)).body.netPosition).toBe(before);
    const sale = (await agent.get(`/api/assets/${property.assetId}/sale`)).body;
    expect(sale.rows[0].grossGain).toBe(330_000);
    const fy = await prisma.financialYear.findFirst({ where: { label: "2026-27" } });
    if (fy) {
      const report = (await agent.get(`/api/reports/capital-gains?financialYearId=${fy.id}`)).body;
      expect(report.rows.some((r: { code: string; kind: string }) => r.code === "9 Sold St" && r.kind === "ASSET")).toBe(true);
    }
    const tree = (await agent.get("/api/tree")).body;
    const branch = tree.entities[owner.entityId].children as Array<{ label: string; children: Array<{ label: string }> }>;
    expect(branch.find((n) => n.label === "Sold")?.children.map((c) => c.label)).toContain("9 Sold St");
  });

  it("dates a value when it changes, and lists values not looked at for a year", async () => {
    const car = await post("/assets", { name: "Old ute", assetType: "VEHICLE", entityId: owner.entityId, currentValue: 12_000 });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: car.id } })).valuationDate).toBeTruthy();
    await prisma.asset.update({ where: { id: car.id }, data: { valuationDate: d("2024-01-01") } });
    expect((await staleValues()).some((v) => v.id === car.id)).toBe(true);
    // Saving the same value again isn't a new valuation…
    await agent.put(`/api/assets/${car.id}`).send({ currentValue: 12_000 });
    expect((await staleValues()).some((v) => v.id === car.id)).toBe(true);
    // …but "Still right" is.
    await agent.post(`/api/assets/${car.id}/value-checked`);
    expect((await staleValues()).some((v) => v.id === car.id)).toBe(false);
  });

  it("saves the family's net worth once a month", async () => {
    await prisma.netWorthSnapshot.deleteMany({ where: { entityId: null } });
    expect(await ensureMonthlySnapshot()).toBe(true);
    expect(await ensureMonthlySnapshot()).toBe(false);
    expect(await prisma.netWorthSnapshot.count({ where: { entityId: null } })).toBe(1);
  });

  it("offers the getting-started steps until they're done or put away", async () => {
    const dash = (await agent.get("/api/dashboard")).body;
    expect(dash.gettingStarted.steps.find((s: { key: string }) => s.key === "people").done).toBe(true);
    await agent.put("/api/settings").send({ checklistDismissed: true });
    expect((await agent.get("/api/dashboard")).body.gettingStarted.dismissed).toBe(true);
  });
});
