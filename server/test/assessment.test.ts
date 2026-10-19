import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { taxChange, LATEST_RATES_YEAR } from "../src/services/incomeTax.js";
import { nswTransferDuty } from "../src/services/nswDuty.js";

// The quick assessment of a property being considered: only what's entered
// is used; three columns; the Acquisition Model's sums; the owner's tax; and
// "Can we borrow it?". Nothing of it counts anywhere else.

describe("assessing a property you're considering", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let house: { assetId: string; id: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "assessment test" })).status).toBe(201);
    const person = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Assessing Ari", grossSalary: 120_000 })).id}`)).body;
    house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "8 Numbers Rd, Goulburn NSW 2580", askingPrice: 600_000, entityId: person.entityId });
  });

  it("shows only what can be worked out from what's entered", async () => {
    let a = (await agent.get(`/api/considering/${house.assetId}/assessment`)).body;
    expect(a.price).toBe(600_000);
    expect(a.priceIsAsking).toBe(true);
    expect(a.columns[0].figures.grossYield).toBeNull();
    expect(a.columns[0].missing).toEqual(expect.arrayContaining(["how much you'd borrow (% of the price)", "the expected rent (on the property)"]));
    expect(a.columns[1].shown).toBe(false);
    // Rent only: the gross yield, nothing that needs costs or the loan.
    await send("put", `/properties/${house.id}`, { weeklyRent: 500 });
    a = (await agent.get(`/api/considering/${house.assetId}/assessment`)).body;
    expect(a.columns[0].figures.grossYield).toBeCloseTo(26_000 / 600_000);
    expect(a.columns[0].figures.netYield).toBeNull();
    expect(a.purchase.cashNeeded).toBeNull();
  });

  it("works out the three columns, cash needed, tax and borrowing", async () => {
    await send("put", `/properties/${house.id}`, { councilRates: 2_000, waterRates: 1_000, managementPercent: 7 });
    const a = await send("put", `/considering/${house.assetId}/assessment`, {
      lvrPercent: 80,
      otherCosts: 2_000,
      expectedRatePercent: 6,
      conservativeRent: 24_000,
      conservativeVacancyWeeks: 2,
      conservativeCosts: 6_000,
      conservativeRatePercent: 7,
    });
    const duty = nswTransferDuty(600_000);
    expect(a.purchase).toMatchObject({ loan: 480_000, deposit: 120_000, stampDuty: duty, dutyEstimated: true, cashNeeded: 120_000 + duty + 2_000 });

    const e = a.columns[0].figures;
    const costs = 2_000 + 1_000 + 26_000 * 0.07;
    expect(a.columns[0].inputs).toMatchObject({ rent: 26_000, costs, ratePercent: 6 });
    expect(e.netIncome).toBeCloseTo(26_000 - costs);
    expect(e.netYield).toBeCloseTo((26_000 - costs) / 600_000);
    expect(e.interest).toBeCloseTo(28_800);
    expect(e.cashBeforeTax).toBeCloseTo(26_000 - costs - 28_800);
    const taxEffect = taxChange(120_000, 26_000 - costs - 28_800, LATEST_RATES_YEAR);
    expect(e.taxEffect).toBeCloseTo(taxEffect);
    expect(e.cashAfterTax).toBeCloseTo(26_000 - costs - 28_800 - taxEffect);
    expect(e.weeklyCash).toBeCloseTo(e.cashAfterTax / 52);
    expect(e.returnOnCash).toBeCloseTo(e.cashAfterTax / a.purchase.cashNeeded);

    const c = a.columns[1];
    expect(c.shown).toBe(true);
    expect(c.figures.netIncome).toBeCloseTo(24_000 * (50 / 52) - 6_000);
    expect(c.figures.interest).toBeCloseTo(480_000 * 0.07);
    expect(a.columns[2].shown).toBe(false);

    expect(a.borrowing.people).toEqual(["Assessing Ari"]);
    expect(["FINE", "SOME_LENDERS", "TOO_MUCH"]).toContain(a.borrowing.status);

    // The card on the board shows the expected column.
    const card = ((await agent.get("/api/considering")).body as Array<{ assetId: string; expected: { netYield: number; afterTax: boolean } }>).find((x) => x.assetId === house.assetId)!;
    expect(card.expected.netYield).toBeCloseTo(e.netYield);
    expect(card.expected.afterTax).toBe(true);
  });

  it("asks for the stamp duty outside NSW, and takes a typed-in price", async () => {
    const person = (await agent.get("/api/people")).body[0];
    const qld = await send("post", "/considering", { kind: "RESIDENTIAL", address: "2 Sun St, Toowoomba QLD 4350", askingPrice: 500_000, entityId: person.entityId });
    let a = await send("put", `/considering/${qld.assetId}/assessment`, { lvrPercent: 70, price: 480_000 });
    expect(a.price).toBe(480_000);
    expect(a.purchase.cashNeeded).toBeNull();
    expect(a.columns[0].missing).toContain("the stamp duty (the estimate is for NSW only)");
    a = await send("put", `/considering/${qld.assetId}/assessment`, { stampDuty: 15_000 });
    expect(a.purchase.cashNeeded).toBe(480_000 * 0.3 + 15_000);
    expect((await agent.put(`/api/considering/${qld.assetId}/assessment`).send({ lvrPercent: 120 })).status).toBe(400);
  });

  it("gives the Acquisition Model the same sums", async () => {
    const out = await send("post", "/acquisition-model", {
      purchasePrice: 1_000_000,
      acquisitionCosts: 60_000,
      lvr: 60,
      rent: 80_000,
      occupancy: 0.9,
      fixedIncome: 5_000,
      expenses: 15_000,
      interestRate: 7,
      repaymentType: "IO",
      loanTermYears: 25,
    }, 200);
    for (const [k, v] of Object.entries({ loan: 600_000, requiredEquity: 460_000, grossIncome: 77_000, noi: 62_000, interestExpense: 42_000, cashFlowAfterFinancing: 20_000 })) {
      expect(out[k], k).toBeCloseTo(v);
    }
    expect(out.dscr).toBeCloseTo(62_000 / 42_000);
    expect(out.breakEvenOccupancy).toBeCloseTo((15_000 + 42_000 - 5_000) / 80_000);
  });
});
