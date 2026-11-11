import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { capitalWorksReduction, saleGains } from "../src/services/assetSaleCgt.js";
import { nswTransferDuty } from "../src/services/nswDuty.js";
import { purchaseCosts } from "../src/routes/portfolioPlans.js";
import { largeBalanceFlag, lrbaPropertyWarning } from "../src/services/superRules.js";

// The six fixes from the September 2026 gap analysis (GAP-ANALYSIS.md), each
// checked against the saved ATO / Revenue NSW document it came from.

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (s: string) => d(s).toISOString();

describe("A1: building write-off comes off the cost base on sale", () => {
  const people = new Map([["a", { name: "Alex", entityType: "INDIVIDUAL" }]]);
  const rental = {
    id: "r",
    name: "Rental",
    assetType: "PROPERTY",
    entityId: "a",
    acquisitionDate: d("2015-07-01"),
    acquisitionCost: 500_000,
    disposalDate: d("2026-09-01"),
    disposalValue: 900_000,
    buyingCosts: 25_000,
    improvementsCost: 40_000,
    sellingCosts: 15_000,
    capitalWorksClaimed: 30_000,
    mainResidence: "NONE",
    mainResidencePercent: null,
    ownerships: [],
  };

  it("reduces the cost base by the capital works claimed, making the gain bigger", () => {
    const [row] = saleGains(rental, people);
    expect(row.costBase).toBe(550_000); // 580,000 - 30,000
    expect(row.grossGain).toBe(350_000);
    expect(row.notes.join(" ")).toMatch(/\$30,000 of building write-off/);
  });

  it("doesn't reduce it for property bought before 14 May 1997", () => {
    const [row] = saleGains({ ...rental, acquisitionDate: d("1996-01-10") }, people);
    expect(row.costBase).toBe(580_000);
    expect(row.notes.join(" ")).toMatch(/before 14 May 1997/);
  });

  it("never takes off more than the cost itself, and nothing when none was claimed", () => {
    expect(capitalWorksReduction(900_000, d("2015-07-01"), 580_000)).toBe(580_000);
    expect(capitalWorksReduction(null, d("2015-07-01"), 580_000)).toBe(0);
    expect(saleGains({ ...rental, capitalWorksClaimed: null }, people)[0].costBase).toBe(580_000);
  });
});

describe("A2: SMSF borrowing for residential property from 10 August 2026", () => {
  it("warns for a residential property with an LRBA started on or after 10 August 2026", () => {
    expect(lrbaPropertyWarning(d("2026-08-10"), true)?.level).toBe("WARNING");
    expect(lrbaPropertyWarning(d("2026-08-09"), true)).toBeNull();
    expect(lrbaPropertyWarning(null, true)?.level).toBe("CHECK");
    expect(lrbaPropertyWarning(d("2026-09-01"), false)).toBeNull(); // commercial
  });
});

describe("A3: Division 296 flag for balances near or over $3 million", () => {
  it("flags near, over and very large balances from 2026-27 only", () => {
    expect(largeBalanceFlag(2_600_000, "2026-27")).toBeNull();
    expect(largeBalanceFlag(2_700_000, "2026-27")?.level).toBe("NEAR");
    expect(largeBalanceFlag(3_200_000, "2026-27")?.level).toBe("OVER");
    expect(largeBalanceFlag(12_000_000, "2026-27")?.level).toBe("VERY_LARGE");
    expect(largeBalanceFlag(3_200_000, "2025-26")).toBeNull();
    expect(largeBalanceFlag(null, "2026-27")).toBeNull();
  });
});

describe("A4: stamp duty and buying costs", () => {
  it("matches Revenue NSW's worked examples", () => {
    expect(nswTransferDuty(1_350_000)).toBe(55_537);
    expect(nswTransferDuty(450_000)).toBe(14_437);
    expect(nswTransferDuty(4_000_000, { residential: true })).toBe(203_237);
    // Premium duty is residential only.
    expect(nswTransferDuty(4_000_000)).toBe(52_237 + 27_100 * 5.5); // $201,287
    expect(nswTransferDuty(1_000)).toBe(20); // the $20 minimum
  });

  it("adds deposit, duty, GST and other costs into the cash needed", () => {
    const base = { purchasePrice: 1_350_000, initialLvr: 0.7, transferDuty: null, otherBuyingCosts: 5_000, gstPayable: false };
    const c = purchaseCosts(base);
    expect(c.deposit).toBeCloseTo(405_000);
    expect(c.transferDuty).toBe(55_537);
    expect(c.dutyEstimated).toBe(true);
    expect(c.cashNeeded).toBeCloseTo(405_000 + 55_537 + 5_000);
    const withGst = purchaseCosts({ ...base, gstPayable: true, transferDuty: 60_000 });
    expect(withGst.gst).toBe(135_000);
    expect(withGst.dutyEstimated).toBe(false);
    expect(withGst.cashNeeded).toBeCloseTo(405_000 + 60_000 + 135_000 + 5_000);
  });
});

describe("gap fixes through the app", () => {
  const agent = request.agent(app);
  async function post(path: string, body: unknown) {
    const res = await agent.post(`/api${path}`).send(body as object);
    if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "gap fixes test passcode" })).status).toBe(201);
  });

  afterAll(async () => {
    await prisma.superContribution.deleteMany();
    await prisma.smsfMemberYear.deleteMany();
    await prisma.smsfPension.deleteMany();
  });

  it("saves the building write-off on a sale and shows it in the gain", async () => {
    const owner = await post("/entities", { name: "Gap Rental Owner", entityType: "INDIVIDUAL" });
    const asset = await post("/assets", { name: "Gap Rental", assetType: "OTHER", entityId: owner.id, currentValue: 900_000 });
    await agent
      .put(`/api/assets/${asset.id}`)
      .send({
        assetType: "COMMERCIAL_PROPERTY",
        acquisitionDate: iso("2015-07-01"),
        acquisitionCost: 500_000,
        disposalDate: iso("2026-09-01"),
        disposalValue: 900_000,
        capitalWorksClaimed: 20_000,
      })
      .expect(200);
    const sale = (await agent.get(`/api/assets/${asset.id}/sale`)).body;
    expect(sale.rows[0].costBase).toBe(480_000);
    expect(sale.rows[0].grossGain).toBe(420_000);
  });

  it("shows the LRBA warning and the $3m flag on the SMSF page", async () => {
    const fund = await post("/entities", { name: "Gap Super Fund", entityType: "SMSF", establishmentDate: iso("2015-03-01") });
    const member = await post("/people", { name: "Gap Member", dateOfBirth: iso("1960-05-01") });
    await post(`/smsf/${fund.id}/members`, { personId: member.id, trustee: true });
    await agent.put(`/api/smsf/${fund.id}/member-years`).send({ personId: member.id, fyLabel: "2025-26", closingBalance: 2_800_000 }).expect(200);
    const home = await post("/properties", { name: "9 Fund Rd", address: "9 Fund Rd, Sydney NSW", entityId: fund.id, currentValue: 800_000 });
    await post("/liabilities", {
      name: "New fund loan",
      liabilityType: "LRBA_LOAN",
      entityId: fund.id,
      currentBalance: 400_000,
      startDate: iso("2026-09-01"),
      securityPropertyId: home.id,
    });
    const view = (await agent.get(`/api/smsf/${fund.id}?fy=2026-27`)).body;
    expect(view.lrba[0].propertyWarning.level).toBe("WARNING");
    expect(view.checks.join(" ")).toMatch(/10 August 2026/);
    expect(view.members[0].largeBalance.level).toBe("NEAR");
  });

  it("includes cash to buy in the portfolio plan projection", async () => {
    const fy = (await agent.get("/api/financial-years")).body.find((f: { label: string }) => f.label === "2026-27")
      ?? (await post("/financial-years", { label: "2026-27" }));
    const plan = await post("/portfolio-plans", {
      name: "Gap plan",
      startFinancialYearId: fy.id,
      projectionYears: 3,
      interestRate: 0.06,
      rentalGrowthRate: 0.03,
      capRate: 0.06,
      refinanceLvrTarget: 0.7,
    });
    await post(`/portfolio-plans/${plan.id}/properties`, {
      name: "Warehouse",
      acquisitionYearNumber: 2,
      purchasePrice: 1_350_000,
      initialLvr: 0.7,
      otherBuyingCosts: 5_000,
    });
    const projection = (await agent.get(`/api/portfolio-plans/${plan.id}/projection`)).body;
    expect(projection.properties[0].purchase.transferDuty).toBe(55_537);
    expect(projection.portfolioByYear.map((y: { cashToBuy: number }) => Math.round(y.cashToBuy))).toEqual([0, 465_537, 0]);
  });

  it("ticks super paid on a logged pay", async () => {
    const person = await post("/people", { name: "Gap Payee", payFrequency: "MONTHLY" });
    const entry = (
      await agent
        .put(`/api/people/${person.id}/pay-periods`)
        .send({ periodStart: iso("2026-07-01"), periodEnd: iso("2026-07-31"), status: "LOGGED", amount: 6_000 })
        .expect(200)
    ).body;
    const ticked = (await agent.patch(`/api/people/pay-periods/${entry.id}/super`).send({ superPaid: true }).expect(200)).body;
    expect(ticked.superPaid).toBe(true);
    expect(ticked.amount).toBe(6_000); // ticking doesn't touch the rest
  });
});
