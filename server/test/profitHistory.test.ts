import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { saveCurrentProfitYear } from "../src/services/profitHistory.js";

// Each property's profit year by year: this year saved (and kept up to date)
// from the Property Profit report, past years typed in, a year that's ended
// marked final, and a typed-in year never overwritten.

describe("property profit, year on year", () => {
  const agent = request.agent(app);
  const send = async (path: string, body: unknown, status = 201) => {
    const res = await agent.post(`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "profit history test" })).status).toBe(201);
  });

  it("saves this year, takes past years, and never overwrites one typed in", async () => {
    const owner = (await agent.get(`/api/people/${(await send("/people", { name: "Yearly Yan" })).id}`)).body;
    const rental = await send("/properties", { name: "Yan Rental", address: "9 Year St, Dubbo QLD", state: "QLD", entityId: owner.entityId, use: "INVESTMENT", currentValue: 500_000, weeklyRent: 500, councilRates: 2_000 });
    const loan = await send("/liabilities", { name: "Yan loan", liabilityType: "INVESTMENT_LOAN", entityId: owner.entityId, currentBalance: 300_000, interestRate: 6, securityPropertyId: rental.id });
    // Last year's interest, from the lender's statement.
    await prisma.loanInterestYear.create({ data: { liabilityId: loan.id, fyLabel: "2024-25", interestCharged: 18_750 } });

    // This year's figures, from the report.
    await saveCurrentProfitYear(new Date("2026-03-01T00:00:00Z"));
    let h = (await agent.get(`/api/reports/property-profit/${rental.assetId}/years`)).body;
    expect(h.years).toHaveLength(1);
    expect(h.years[0]).toMatchObject({ fyLabel: "2025-26", source: "AUTO", final: false, rent: 26_000, value: 500_000 });
    expect(h.interestByYear).toEqual({ "2024-25": 18_750 });

    // A past year, typed in from the tax return.
    const past = await send(`/reports/property-profit/${rental.assetId}/years`, { fyLabel: "2024-25", rent: 24_500, costs: 4_100, interest: 18_750, depreciation: 3_000 });
    expect(past).toMatchObject({ cashBeforeTax: 1_650, taxResult: -1_350, source: "ENTERED", final: true });
    expect((await agent.post(`/api/reports/property-profit/${rental.assetId}/years`).send({ fyLabel: "last year", rent: 1, costs: 1, interest: 1 })).status).toBe(400);

    // After 30 June: 2025-26 is final, 2026-27 starts — and the typed-in 2024-25 is left alone.
    await saveCurrentProfitYear(new Date("2026-08-01T00:00:00Z"));
    h = (await agent.get(`/api/reports/property-profit/${rental.assetId}/years`)).body;
    expect(h.years.map((y: { fyLabel: string; source: string; final: boolean }) => [y.fyLabel, y.source, y.final])).toEqual([
      ["2024-25", "ENTERED", true],
      ["2025-26", "AUTO", true],
      ["2026-27", "AUTO", false],
    ]);
    expect(h.years[0].rent).toBe(24_500);

    // Removing a year.
    expect((await agent.delete(`/api/reports/property-profit/years/${past.id}`)).status).toBe(204);
  });
});
