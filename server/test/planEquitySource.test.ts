import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";

// A Portfolio Plan's equity draw can come from any property owned — the home
// or a rental, not only a commercial property — whether or not its value and
// loans are entered yet.

describe("where a plan's equity comes from", () => {
  const agent = request.agent(app);
  const send = async (path: string, body: unknown, status = 201) => {
    const res = await agent.post(`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "plan equity source test" })).status).toBe(201);
  });

  it("takes a home with no value or loan entered yet, and a commercial property the old way", async () => {
    const owner = (await agent.get(`/api/people/${(await send("/people", { name: "Plan Pat" })).id}`)).body;
    const home = await send("/properties", { name: "Plan Home", address: "5 Plan St, Orange NSW", state: "NSW", entityId: owner.entityId, use: "HOME" });
    const shop = await send("/commercial-properties", { name: "Plan Shop", address: "6 Plan St, Orange NSW", propertyTypes: ["RETAIL"], entityId: owner.entityId });

    const fy = (await ensureFinancialYear("2026-27"))!;
    const plan = await send("/portfolio-plans", { name: "Equity source plan", startFinancialYearId: fy, interestRate: 0.06, rentalGrowthRate: 0.03, capRate: 0.05, refinanceLvrTarget: 0.8 });
    const pp = await send(`/portfolio-plans/${plan.id}/properties`, { name: "Next rental", acquisitionYearNumber: 2, purchasePrice: 650_000, initialLvr: 0.8 });

    // From the home: no value recorded, no loan — still fine to plan.
    const fromHome = await send(`/portfolio-plans/properties/${pp.id}/equity-draws`, { yearNumber: 2, amount: 150_000, sourceAssetId: home.assetId });
    expect(fromHome).toMatchObject({ sourceAssetId: home.assetId, sourceCommercialPropertyId: null, sourceAsset: { name: "Plan Home", property: { id: home.id } } });
    const usable = (await agent.get(`/api/debt-allocation/usable-equity/${home.assetId}`)).body;
    expect(usable).toEqual({ loans: [], equity: null });

    // The older commercial-only link fills in both.
    const fromShop = await send(`/portfolio-plans/properties/${pp.id}/equity-draws`, { yearNumber: 3, amount: 50_000, sourceCommercialPropertyId: shop.id });
    expect(fromShop).toMatchObject({ sourceAssetId: shop.assetId, sourceCommercialPropertyId: shop.id });
    // Picking the commercial property by its asset does too.
    const byAsset = await send(`/portfolio-plans/properties/${pp.id}/equity-draws`, { yearNumber: 3, amount: 10_000, sourceAssetId: shop.assetId });
    expect(byAsset.sourceCommercialPropertyId).toBe(shop.id);

    // The plan shows where each draw comes from, and the projection costs them.
    const got = (await agent.get(`/api/portfolio-plans/${plan.id}`)).body;
    expect(got.properties[0].equityDraws.map((d: { sourceAsset: { name: string } }) => d.sourceAsset.name)).toEqual(["Plan Home", "Plan Shop", "Plan Shop"]);
    const projection = (await agent.get(`/api/portfolio-plans/${plan.id}/projection`)).body;
    expect(projection.properties[0].hasFunding).toBe(true);

    // A property that isn't in the records is refused.
    expect((await agent.post(`/api/portfolio-plans/properties/${pp.id}/equity-draws`).send({ yearNumber: 2, amount: 1, sourceAssetId: "nope" })).status).toBe(400);
  });
});
