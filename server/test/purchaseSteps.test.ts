import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma, prismaAll } from "../src/db.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";

// Buying a considered property: steps with their dates, a loan recorded at
// finance approval that doesn't count until settlement, "Settled" making it
// yours at the price paid, and a Portfolio Plan using its figures.

describe("offer to settlement", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let entityId = "";
  let house: { assetId: string; id: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "purchase steps test" })).status).toBe(201);
    entityId = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Buying Bo", grossSalary: 150_000 })).id}`)).body.entityId;
    house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "20 Offer St, Dubbo NSW 2830", askingPrice: 640_000, entityId });
  });

  it("records the loan at approval without counting it", async () => {
    const netBefore = JSON.stringify((await agent.get("/api/net-worth/preview")).body);
    const debtsBefore = JSON.stringify((await agent.get("/api/reports/debt-summary")).body);
    const loan = await send("post", "/liabilities", { name: "Bo's new loan", liabilityType: "INVESTMENT_LOAN", entityId, currentBalance: 500_000, interestRate: 6.1, securityPropertyId: house.id });
    expect((await prismaAll.liability.findUnique({ where: { id: loan.id } }))?.counted).toBe(false);
    expect(JSON.stringify((await agent.get("/api/net-worth/preview")).body)).toBe(netBefore);
    expect(JSON.stringify((await agent.get("/api/reports/debt-summary")).body)).toBe(debtsBefore);
    expect(((await agent.get("/api/liabilities")).body as Array<{ id: string }>).map((l) => l.id)).not.toContain(loan.id);
    // It's on the property's own page, and has its own page.
    expect(((await agent.get(`/api/properties/${house.id}`)).body.liabilities as Array<{ id: string }>).map((l) => l.id)).toContain(loan.id);
    expect((await agent.get(`/api/liabilities/${loan.id}`)).status).toBe(200);
  });

  it("keeps each step's date, moves the stage along, and settles", async () => {
    let s = await send("put", `/considering/${house.assetId}/steps/offer-made`, { done: true, amount: 620_000 });
    expect(s.stage).toBe("OFFER");
    expect(s.steps.find((x: { key: string }) => x.key === "offer-made")).toMatchObject({ amount: 620_000 });
    expect(s.steps.find((x: { key: string }) => x.key === "offer-made").doneAt).not.toBeNull();
    expect(s.next).toMatchObject({ key: "offer-accepted" });
    s = await send("put", `/considering/${house.assetId}/steps/exchanged`, { done: true, amount: 625_000 });
    expect(s.stage).toBe("CONTRACT");
    await send("put", `/considering/${house.assetId}/steps/settlement-booked`, { done: true, date: "2026-11-20T00:00:00.000Z" });
    expect((await agent.put(`/api/considering/${house.assetId}/steps/not-a-step`).send({ done: true })).status).toBe(404);

    const netBefore = (await agent.get("/api/net-worth/preview")).body;
    expect((await send("put", `/considering/${house.assetId}/steps/settled`, { done: true })).bought).toBe(true);
    const asset = await prisma.asset.findUnique({ where: { id: house.assetId } });
    expect(asset).toMatchObject({ status: "OWNED", acquisitionCost: 625_000 });
    expect(asset?.acquisitionDate?.toISOString().slice(0, 10)).toBe("2026-11-20");
    // The loan counts now.
    const loans = (await agent.get("/api/liabilities")).body as Array<{ name: string }>;
    expect(loans.map((l) => l.name)).toContain("Bo's new loan");
    expect(JSON.stringify((await agent.get("/api/net-worth/preview")).body)).not.toBe(JSON.stringify(netBefore));
    // No more steps once it's yours.
    expect((await agent.put(`/api/considering/${house.assetId}/steps/offer-made`).send({ done: true })).status).toBe(400);
  });

  it("gives a Portfolio Plan the considered property's own figures", async () => {
    const unit = await send("post", "/considering", { kind: "RESIDENTIAL", address: "5/1 Plan Pde, Dubbo NSW 2830", askingPrice: 450_000, entityId });
    await send("put", `/properties/${unit.id}`, { weeklyRent: 480 });
    await send("put", `/considering/${unit.assetId}/assessment`, { lvrPercent: 85, stampDuty: 16_000, otherCosts: 3_000 });
    const fy = (await ensureFinancialYear("2026-27"))!;
    const plan = await send("post", "/portfolio-plans", {
      name: "Bo plan",
      startFinancialYearId: fy,
      projectionYears: 3,
      interestRate: 0.06,
      rentalGrowthRate: 0.03,
      capRate: 0.05,
      refinanceLvrTarget: 0.8,
      annualContribution: 0,
    });
    await send("post", `/portfolio-plans/${plan.id}/properties`, {
      name: "The unit",
      acquisitionYearNumber: 1,
      purchasePrice: 400_000,
      initialLvr: 0.8,
      initialRent: 18_000,
      assetId: unit.assetId,
    });
    const p = (await agent.get(`/api/portfolio-plans/${plan.id}/projection`)).body.properties[0];
    expect(p.figuresFrom).toBe("5/1 Plan Pde, Dubbo NSW 2830");
    expect(p.purchase.deposit).toBeCloseTo(450_000 * 0.15);
    expect(p.purchase).toMatchObject({ transferDuty: 16_000, otherCosts: 3_000 });
    expect(p.rows[0].rent).toBeCloseTo(480 * 52);
  });
});
