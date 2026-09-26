import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { DEFAULT_ASSUMPTIONS, loanFromPayment, monthlyPayment, propertyLending, residentialEstimate } from "../src/services/borrowing.js";
import { individualTax, marginalRate, taxChange } from "../src/services/incomeTax.js";
import { landTaxByAsset, nswLandTax } from "../src/services/landTax.js";

// Batch 3: tax and NSW land tax, after-tax profit per property, and the
// borrowing capacity estimate — each checked against the saved sources.

describe("income tax (ATO resident rates 2026-27 + 2% Medicare)", () => {
  it("works out tax and the marginal rate", () => {
    expect(individualTax(100_000)).toBe(4_020 + 0.3 * 55_000 + 2_000);
    expect(individualTax(18_000)).toBe(0);
    // Medicare phases in above the low-income threshold: 10c per dollar over $27,222.
    expect(individualTax(30_000)).toBeCloseTo(0.15 * 11_800 + 0.1 * (30_000 - 27_222));
    expect(individualTax(40_000)).toBeCloseTo(0.15 * 21_800 + 800);
    expect(individualTax(250_000)).toBeCloseTo(51_370 + 0.45 * 60_000 + 5_000);
    expect(marginalRate(150_000)).toBeCloseTo(0.39);
    expect(individualTax(100_000, "2025-26")).toBe(4_288 + 0.3 * 55_000 + 2_000);
  });

  it("shows a rental loss reducing tax at the marginal rate", () => {
    expect(taxChange(150_000, -10_000)).toBeCloseTo(-3_900);
    expect(taxChange(150_000, 10_000)).toBeCloseTo(3_900);
  });
});

describe("NSW land tax (Revenue NSW thresholds and rates)", () => {
  it("matches Revenue NSW's rates and its special trust example", () => {
    expect(nswLandTax(1_000_000, "GENERAL")).toBe(0);
    expect(nswLandTax(1_500_000, "GENERAL")).toBeCloseTo(100 + 0.016 * 425_000);
    expect(nswLandTax(7_000_000, "GENERAL")).toBeCloseTo(88_036 + 0.02 * 429_000);
    expect(nswLandTax(600_000, "SPECIAL_TRUST")).toBe(9_600); // Revenue NSW's example
  });

  it("taxes each owner on all their NSW land, exempts the home, and gives trusts no threshold", () => {
    const base = { landTaxPerYear: null, mainResidence: null, state: "NSW", address: "", ownerships: [] };
    const result = landTaxByAsset(
      [
        { ...base, id: "a", entityId: "alex", landValue: 700_000 },
        { ...base, id: "b", entityId: "alex", landValue: 800_000 },
        { ...base, id: "home", entityId: "alex", landValue: 900_000, mainResidence: "FULL" },
        { ...base, id: "t", entityId: "trust", landValue: 600_000 },
        { ...base, id: "q", entityId: "alex", landValue: 500_000, state: "QLD" },
      ],
      new Map([
        ["alex", "INDIVIDUAL"],
        ["trust", "TRUST"],
      ])
    );
    const total = 100 + 0.016 * (1_500_000 - 1_075_000);
    expect(result.get("a")!.amount).toBeCloseTo(total * (7 / 15));
    expect(result.get("b")!.amount).toBeCloseTo(total * (8 / 15));
    expect(result.get("home")!.basis).toBe("EXEMPT_HOME");
    expect(result.get("t")!.amount).toBe(9_600);
    expect(result.get("q")!.basis).toBe("NOT_NSW");
  });
});

describe("borrowing capacity", () => {
  it("works out repayments and the loan a repayment carries", () => {
    expect(monthlyPayment(500_000, 6, 30)).toBeCloseTo(2_997.75, 1);
    expect(loanFromPayment(2_997.75, 6, 30)).toBeCloseTo(500_000, -1);
  });

  it("assesses at the rate plus the 3% buffer, counts cards on the limit, and flags 6× income", () => {
    const a = { ...DEFAULT_ASSUMPTIONS, newLoanRate: 6, declaredExpenses: 3_000 };
    const r = residentialEstimate(
      [{ name: "Alex", salary: 120_000, variable: 20_000, rent: 0 }],
      [{ name: "Card", balance: 0, ratePct: null, remainingYears: null, cardLimit: 10_000 }],
      a
    );
    const [low, high] = r.scenarios;
    expect(low.assessmentRate).toBe(9);
    expect(low.commitmentsMonthly).toBeCloseTo(380);
    expect(high.commitmentsMonthly).toBeCloseTo(300);
    expect(low.countedIncome).toBe(120_000 + 20_000 * 0.6);
    const expectedLow = loanFromPayment((low.countedIncome - individualTax(low.countedIncome)) / 12 - 3_000 - 380, 9, 30);
    expect(low.maxNewLoan).toBeCloseTo(expectedLow);
    expect(high.maxNewLoan).toBeGreaterThan(low.maxNewLoan);
    expect(r.dtiLimitLoan).toBe(6 * 140_000 - 10_000);
  });

  it("limits commercial lending by interest cover and LVR", () => {
    const est = propertyLending({ name: "Warehouse", value: 1_000_000, netRent: 100_000, existingDebt: 400_000, ratePct: 6 }, [60, 70], DEFAULT_ASSUMPTIONS);
    // Assessed at 6% + 2% = 8%: cover 2× → 625,000; 1.5× → 833,333. LVR 60% → 600,000; 70% → 700,000.
    expect(est.range[0].total).toBe(600_000);
    expect(est.range[1].total).toBe(700_000);
    expect(est.range[0].byServicing).toBeCloseTo(625_000);
    expect(est.range[0].release).toBe(200_000);
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  async function post(p: string, body: unknown) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "profit borrowing test passcode" })).status).toBe(201);
  });

  it("works out a rental's after-tax profit from its costs, land tax, interest and the owner's income", async () => {
    const pat = await agent.get(`/api/people/${(await post("/people", { name: "Pat Investor", grossSalary: 150_000 })).id}`).then((r) => r.body);
    const rental = await post("/properties", {
      name: "7 Profit St",
      address: "7 Profit St, Newcastle NSW",
      state: "NSW",
      entityId: pat.entityId,
      currentValue: 800_000,
      weeklyRent: 600,
      councilRates: 2_000,
      waterRates: 800,
      managementPercent: 7.5,
    });
    await agent.put(`/api/assets/${rental.assetId}`).send({ landValue: 1_275_000, depreciationPerYear: 3_000, capitalWorksPerYear: 5_000 }).expect(200);
    await post("/liabilities", { name: "Profit loan", liabilityType: "INVESTMENT_LOAN", entityId: pat.entityId, currentBalance: 500_000, interestRate: 6, securityPropertyId: rental.id });

    const { rows } = (await agent.get("/api/reports/property-profit")).body;
    const row = rows.find((r: { assetId: string }) => r.assetId === rental.assetId);
    const rent = 31_200;
    const costs = 2_000 + 800 + rent * 0.075;
    const landTax = 100 + 0.016 * 200_000;
    expect(row.rent).toBe(rent);
    expect(row.runningCosts).toBeCloseTo(costs);
    expect(row.landTax.amount).toBeCloseTo(landTax);
    expect(row.interest).toBeCloseTo(30_000);
    expect(row.interestBasis).toBe("ESTIMATE");
    const cashBeforeTax = rent - costs - landTax - 30_000;
    expect(row.cashBeforeTax).toBeCloseTo(cashBeforeTax);
    const taxResult = cashBeforeTax - 8_000;
    expect(row.owners[0].taxEffect).toBeCloseTo(taxChange(150_000, taxResult));
    expect(row.cashAfterTax).toBeCloseTo(cashBeforeTax - taxChange(150_000, taxResult));
    expect(row.grossYield).toBeCloseTo(rent / 800_000);
  });

  it("estimates borrowing from the records, and saves the assumptions", async () => {
    const pat = (await prisma.person.findFirstOrThrow({ where: { name: "Pat Investor" } }));
    await agent.put("/api/borrowing/assumptions").send({ declaredExpenses: 4_000, buffer: 3 }).expect(200);
    const view = (await agent.get("/api/borrowing")).body;
    expect(view.assumptions.declaredExpenses).toBe(4_000);
    const est = (await agent.post("/api/borrowing/estimate").send({ personIds: [pat.id] }).expect(200)).body;
    expect(est.incomes[0].rent).toBe(31_200);
    expect(est.debts.map((d: { name: string }) => d.name)).toContain("Profit loan");
    const [low, high] = est.residential.scenarios;
    expect(low.maxNewLoan).toBeLessThanOrEqual(high.maxNewLoan);
    // Usable equity: 800,000 × 80% − 500,000.
    expect(est.equity.properties[0].usable).toBe(140_000);
    expect(est.equity.release[1]).toBeLessThanOrEqual(140_000);
  });
});
