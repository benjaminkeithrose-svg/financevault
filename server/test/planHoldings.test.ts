import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";

// Portfolio Plans that start from what's owned: properties in the records
// (value, loans, rent) grow with the plan; equity drawn from one adds to its
// loan; the cash pool follows starting cash, contributions, rent less
// interest, draws, refinances and purchases; and a what-if copy.

describe("planning from what you own", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "plan holdings test" })).status).toBe(201);
  });

  it("brings owned properties in, draws on them, and keeps the cash pool", async () => {
    const owner = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Holding Hal" })).id}`)).body;
    const home = await send("post", "/properties", { name: "Hal Home", address: "1 Hal St, Orange NSW", state: "NSW", entityId: owner.entityId, use: "HOME", currentValue: 1_000_000 });
    const rental = await send("post", "/properties", { name: "Hal Rental", address: "2 Hal St, Orange NSW", state: "NSW", entityId: owner.entityId, use: "INVESTMENT", currentValue: 500_000, weeklyRent: 500 });
    await send("post", "/liabilities", { name: "Home loan", liabilityType: "MORTGAGE", entityId: owner.entityId, currentBalance: 400_000, interestRate: 6, securityPropertyId: home.id });
    await send("post", "/liabilities", { name: "Rental loan", liabilityType: "INVESTMENT_LOAN", entityId: owner.entityId, currentBalance: 300_000, securityPropertyId: rental.id });

    const fy = (await ensureFinancialYear("2026-27"))!;
    const plan = await send("post", "/portfolio-plans", {
      name: "Hal plan",
      startFinancialYearId: fy,
      projectionYears: 3,
      interestRate: 0.05,
      rentalGrowthRate: 0.1,
      capRate: 0.05,
      refinanceLvrTarget: 0.8,
      annualContribution: 10_000,
      startingCash: 20_000,
    });
    await send("post", `/portfolio-plans/${plan.id}/holdings`, { assetId: home.assetId });
    await send("post", `/portfolio-plans/${plan.id}/holdings`, { assetId: rental.assetId });
    // Once only.
    expect((await agent.post(`/api/portfolio-plans/${plan.id}/holdings`).send({ assetId: home.assetId })).status).toBe(400);

    // A purchase in year 2, $100k of it from the home's equity.
    const pp = await send("post", `/portfolio-plans/${plan.id}/properties`, {
      name: "Next one",
      acquisitionYearNumber: 2,
      purchasePrice: 400_000,
      initialLvr: 0.8,
      initialRent: 20_000,
      transferDuty: 10_000,
    });
    await send("post", `/portfolio-plans/properties/${pp.id}/equity-draws`, { yearNumber: 2, amount: 100_000, sourceAssetId: home.assetId });
    await send("post", `/portfolio-plans/properties/${pp.id}/refinances`, { yearNumber: 3 });

    const p = (await agent.get(`/api/portfolio-plans/${plan.id}/projection`)).body;
    const homeP = p.holdings.find((h: { name: string }) => h.name === "Hal Home");
    const rentalP = p.holdings.find((h: { name: string }) => h.name === "Hal Rental");

    // Today's figures from the records; the rental's loan has no rate, so the plan's is used (and said so).
    expect(homeP.start).toEqual({ value: 1_000_000, loan: 400_000, rent: 0, interest: 24_000 });
    expect(homeP.loanInCash).toBe(false);
    expect(rentalP.start).toEqual({ value: 500_000, loan: 300_000, rent: 26_000, interest: 15_000 });
    expect(rentalP.missing.join(" ")).toMatch(/interest rate/);

    // Growth from today, and the draw added to the home's loan from year 2.
    expect(homeP.rows.map((r: { propertyValue: number }) => Math.round(r.propertyValue))).toEqual([1_000_000, 1_100_000, 1_210_000]);
    expect(homeP.rows.map((r: { loan: number }) => r.loan)).toEqual([400_000, 500_000, 500_000]);
    expect(homeP.rows[0].cashflow).toBe(0); // the home's loan is a living cost
    expect(rentalP.rows[0].cashflow).toBe(26_000 - 15_000);
    expect(homeP.events).toEqual([{ yearNumber: 2, type: "DRAW_FROM", label: "$100,000 of equity drawn for Next one" }]);

    const [y1, y2, y3] = p.portfolioByYear;
    // Year 1: 20k start + 10k + 11k rental cash.
    expect(y1.cashPool).toBeCloseTo(20_000 + 10_000 + 11_000, 6);
    expect(y1.totalValue).toBeCloseTo(1_500_000, 6);
    // Year 2: buy (80k deposit + 10k duty), 100k drawn, the purchase's cash less its funding cost.
    const rental2 = 28_600 - 15_000;
    const next2 = 20_000 - 320_000 * 0.05 - 100_000 * 0.05;
    expect(y2.cashToBuy).toBeCloseTo(90_000, 6);
    expect(y2.equityDrawn).toBe(100_000);
    expect(y2.cashPool).toBeCloseTo(y1.cashPool + 10_000 + rental2 + next2 + 100_000 - 90_000, 6);
    // Year 3: refinancing to 80% of 440k releases 352k − 320k.
    expect(y3.refinanceCash).toBeCloseTo(440_000 * 0.8 - 320_000, 6);
    expect(p.shortYears).toEqual([]);
    expect(p.properties[0].events.map((e: { type: string }) => e.type)).toEqual(["BUY", "DRAW_FOR", "REFINANCE"]);

    // Short of cash: flagged.
    await send("put", `/portfolio-plans/${plan.id}`, { startingCash: 0, annualContribution: 0 });
    await send("put", `/portfolio-plans/properties/${pp.id}`, { transferDuty: 200_000 });
    const tight = (await agent.get(`/api/portfolio-plans/${plan.id}/projection`)).body;
    expect(tight.shortYears.map((s: { yearNumber: number }) => s.yearNumber)).toContain(2);

    // Bought: linked to the rental (any property now, not only commercial).
    const linked = await send("put", `/portfolio-plans/properties/${pp.id}`, { assetId: rental.assetId });
    expect(linked).toMatchObject({ assetId: rental.assetId, commercialPropertyId: null });

    // A what-if copy: everything but the links to real purchases and loans.
    const copy = await send("post", `/portfolio-plans/${plan.id}/copy`, {});
    expect(copy).toMatchObject({ name: "Hal plan — what if", basePlanId: plan.id, startingCash: 0 });
    const got = (await agent.get(`/api/portfolio-plans/${copy.id}`)).body;
    expect(got.holdings).toHaveLength(2);
    expect(got.properties[0]).toMatchObject({ name: "Next one", assetId: null, commercialPropertyId: null });
    expect(got.properties[0].refinances).toHaveLength(1);
    expect(got.properties[0].equityDraws[0]).toMatchObject({ amount: 100_000, sourceAssetId: home.assetId, liabilityId: null });
    expect(got.basePlan).toEqual({ id: plan.id, name: "Hal plan" });
    expect((await agent.get(`/api/portfolio-plans/${plan.id}`)).body.whatIfs).toEqual([{ id: copy.id, name: "Hal plan — what if" }]);

    // Taking a property out of the plan leaves it in the records.
    const holdingId = homeP.holdingId;
    expect((await agent.delete(`/api/portfolio-plans/holdings/${holdingId}`)).status).toBe(204);
    expect(await prisma.asset.findUnique({ where: { id: home.assetId } })).not.toBeNull();
  });
});
