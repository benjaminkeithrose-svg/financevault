import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { saveCurrentProfitYear } from "../src/services/profitHistory.js";

// The assessment is frozen as it stood when the property was bought and
// never recalculated; it's compared with the price paid and each year's
// real figures; corrections keep the original. A passed-on record's reason
// can be corrected with its original kept too.

describe("estimate vs actual", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let entityId = "";

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "estimate vs actual test" })).status).toBe(201);
    entityId = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Actual Al", grossSalary: 130_000 })).id}`)).body.entityId;
  });

  it("freezes the assessment at purchase and compares it with what happened", async () => {
    const house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "11 Frozen Ct, Tamworth NSW 2340", askingPrice: 550_000, entityId });
    await send("put", `/properties/${house.id}`, { weeklyRent: 520, councilRates: 2_200, waterRates: 900 });
    await send("put", `/considering/${house.assetId}/assessment`, { lvrPercent: 80, expectedRatePercent: 6, otherCosts: 2_500, stampDuty: 20_000 });
    const before = (await agent.get(`/api/considering/${house.assetId}/assessment`)).body;
    expect((await agent.get(`/api/considering/${house.assetId}/estimate-vs-actual`)).body).toBeNull();

    await send("post", `/considering/${house.assetId}/bought`, { price: 540_000 }, 200);
    let e = (await agent.get(`/api/considering/${house.assetId}/estimate-vs-actual`)).body;
    expect(e.estimates).toMatchObject({ price: 550_000, buyingCosts: 22_500, rent: 520 * 52, runningCosts: 3_100 });
    expect(e.estimates.cashYear).toBeCloseTo(before.columns[0].figures.cashAfterTax);
    expect(e.actual.price).toBe(540_000);

    // Later changes to the property don't touch the frozen estimate.
    await send("put", `/properties/${house.id}`, { weeklyRent: 600 });
    e = (await agent.get(`/api/considering/${house.assetId}/estimate-vs-actual`)).body;
    expect(e.estimates.rent).toBe(520 * 52);

    // This year's real figures, from Profit year by year.
    await saveCurrentProfitYear(new Date());
    e = (await agent.get(`/api/considering/${house.assetId}/estimate-vs-actual`)).body;
    expect(e.years).toHaveLength(1);
    expect(e.years[0]).toMatchObject({ rent: 600 * 52, soFar: true });

    // A correction keeps the original.
    e = await send("put", `/considering/${house.assetId}/estimate`, { field: "rent", value: 27_500 });
    expect(e.estimates.rent).toBe(27_500);
    expect(e.original.rent).toBe(520 * 52);
    expect(e.corrections).toEqual([expect.objectContaining({ field: "rent", from: 520 * 52, to: 27_500 })]);
    expect((await agent.put(`/api/considering/${house.assetId}/estimate`).send({ field: "nonsense", value: 1 })).status).toBe(400);
  });

  it("corrects a passed-on reason, keeping the original", async () => {
    const unit = await send("post", "/considering", { kind: "RESIDENTIAL", address: "2/9 Nope Pl, Tamworth NSW 2340", askingPrice: 380_000, entityId });
    await send("post", `/considering/${unit.assetId}/pass`, { reason: "Too dear" }, 200);
    await send("put", `/considering/${unit.assetId}/passed-on-reason`, { reason: "Too dear for the rent it gets" });
    const row = (await agent.get(`/api/properties/${unit.id}`)).body.asset;
    expect(row.passedOnReason).toBe("Too dear for the rent it gets");
    expect(JSON.parse(row.recordCorrections)).toEqual([expect.objectContaining({ field: "passedOnReason", from: "Too dear", to: "Too dear for the rent it gets" })]);
  });
});
