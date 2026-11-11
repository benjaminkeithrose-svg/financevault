import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import {
  bringForwardYears,
  CapHistory,
  concessionalStatus,
  nonConcessionalStatus,
  pensionYear,
  rulesFor,
} from "../src/services/superRules.js";
import { returnDueDate, tbarDueDate } from "../src/services/smsf.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (s: string) => d(s).toISOString();

function history(partial: Partial<CapHistory>): CapHistory {
  return { concessional: {}, nonConcessional: {}, totalSuperBalance: {}, dateOfBirth: null, firstYear: "2026-27", ...partial };
}

describe("contribution caps", () => {
  it("uses the 2026-27 caps", () => {
    expect(rulesFor("2026-27")).toMatchObject({ concessional: 32_500, nonConcessional: 130_000, transferBalanceCap: 2_100_000, known: true });
    expect(rulesFor("2030-31").known).toBe(false);
  });

  it("counts concessional contributions against the year's cap", () => {
    const s = concessionalStatus("2026-27", history({ concessional: { "2026-27": 20_000 } }));
    expect(s).toMatchObject({ cap: 32_500, carryForward: 0, used: 20_000, remaining: 12_500 });
  });

  it("carries forward unused cap while the balance is under $500,000", () => {
    const h = history({
      firstYear: "2024-25",
      concessional: { "2024-25": 10_000, "2025-26": 30_000, "2026-27": 0 },
      totalSuperBalance: { "2025-26": 400_000 },
    });
    expect(concessionalStatus("2026-27", h)).toMatchObject({ carryForward: 20_000, available: 52_500 });
  });

  it("uses up the oldest unused cap first when a later year goes over", () => {
    const h = history({
      firstYear: "2024-25",
      concessional: { "2024-25": 10_000, "2025-26": 40_000 },
      totalSuperBalance: { "2024-25": 300_000, "2025-26": 350_000 },
    });
    // 2024-25 left $20,000 unused; 2025-26 used $10,000 of it.
    expect(concessionalStatus("2026-27", h).carryForward).toBe(10_000);
  });

  it("allows no carry-forward at $500,000 or more, and says why", () => {
    const h = history({ firstYear: "2024-25", concessional: { "2024-25": 0, "2026-27": 40_000 }, totalSuperBalance: { "2025-26": 600_000 } });
    const s = concessionalStatus("2026-27", h);
    expect(s.carryForward).toBe(0);
    expect(s.notes.join(" ")).toMatch(/under \$500,000/);
    // Under the cap there's nothing to say — and no claim of carry-forward.
    const under = concessionalStatus("2026-27", { ...h, concessional: { "2024-25": 0, "2026-27": 1_000 } });
    expect(under.carryForward).toBe(0);
    expect(under.notes).toEqual([]);
  });

  it("works out the bring-forward years from the balance", () => {
    expect(bringForwardYears(1_000_000, 130_000, 2_100_000)).toBe(3);
    expect(bringForwardYears(1_900_000, 130_000, 2_100_000)).toBe(2);
    expect(bringForwardYears(2_050_000, 130_000, 2_100_000)).toBe(1);
    expect(bringForwardYears(2_200_000, 130_000, 2_100_000)).toBe(0);
    const s = nonConcessionalStatus("2026-27", history({ totalSuperBalance: { "2025-26": 1_000_000 } }));
    expect(s).toMatchObject({ annualCap: 130_000, maxThisYear: 390_000, bringForward: null });
  });

  it("tracks a bring-forward period started in an earlier year", () => {
    const h = history({
      firstYear: "2025-26",
      nonConcessional: { "2025-26": 200_000 },
      totalSuperBalance: { "2024-25": 500_000, "2025-26": 700_000 },
    });
    const s = nonConcessionalStatus("2026-27", h);
    expect(s.bringForward).toMatchObject({ startYear: "2025-26", years: 3, total: 360_000, usedBefore: 200_000 });
    expect(s.maxThisYear).toBe(160_000);
  });

  it("allows no non-concessional contributions from 75", () => {
    const s = nonConcessionalStatus("2026-27", history({ dateOfBirth: d("1950-03-01"), nonConcessional: { "2026-27": 10_000 } }));
    expect(s.maxThisYear).toBe(0);
    expect(s.remaining).toBe(-10_000);
  });
});

describe("pension minimums", () => {
  const born1960 = d("1960-05-01");

  it("applies the rate for the member's age on 1 July", () => {
    const p = { kind: "ACCOUNT_BASED", startDate: d("2024-01-01"), startBalance: 450_000, endDate: null };
    const y = pensionYear(p, "2026-27", 500_000, born1960); // 66 on 1 July 2026
    expect(y).toMatchObject({ active: true, rate: 0.05, minimum: 25_000, retirementPhase: true, maximum: null });
  });

  it("pro-rates the first year and rounds to the nearest $10", () => {
    const p = { kind: "ACCOUNT_BASED", startDate: d("2027-01-01"), startBalance: 300_000, endDate: null };
    // 181 days of 365 at 4%: 300,000 x 0.04 x 181/365 = 5,950.68
    expect(pensionYear(p, "2026-27", null, d("1967-01-01")).minimum).toBe(5_950);
  });

  it("needs no minimum for a pension started in June", () => {
    const p = { kind: "ACCOUNT_BASED", startDate: d("2027-06-05"), startBalance: 300_000, endDate: null };
    expect(pensionYear(p, "2026-27", null, born1960).minimum).toBe(0);
  });

  it("caps a transition to retirement pension at 10% before 65", () => {
    const p = { kind: "TRANSITION_TO_RETIREMENT", startDate: d("2025-08-01"), startBalance: 180_000, endDate: null };
    const y = pensionYear(p, "2026-27", 200_000, d("1966-09-01")); // 59
    expect(y).toMatchObject({ minimum: 8_000, maximum: 20_000, retirementPhase: false });
  });

  it("halves the rate for 2019-20 to 2022-23", () => {
    const p = { kind: "ACCOUNT_BASED", startDate: d("2018-01-01"), startBalance: 400_000, endDate: null };
    expect(pensionYear(p, "2020-21", 400_000, d("1950-01-01")).minimum).toBe(10_000); // 70: 5% halved
  });

  it("asks for the 1 July balance when it's missing", () => {
    const p = { kind: "ACCOUNT_BASED", startDate: d("2024-01-01"), startBalance: 450_000, endDate: null };
    const y = pensionYear(p, "2026-27", null, born1960);
    expect(y.minimum).toBeNull();
    expect(y.notes.join(" ")).toMatch(/1 July 2026/);
  });
});

describe("compliance dates", () => {
  const fund = (details: Record<string, unknown> | null, established = "2015-03-01") => ({
    id: "f",
    name: "Example Super Fund",
    establishmentDate: d(established),
    smsfDetails: details
      ? { lodgedBy: null, lastReturnLodged: null, returnDueDate: null, strategyReviewedOn: null, trusteeType: null, corporateTrustee: null, ...details }
      : null,
  });

  it("uses 15 May for a tax agent, 31 October for trustees and 28 February for a first return", () => {
    expect(returnDueDate(fund({ lodgedBy: "TAX_AGENT" }), "2025-26").date).toEqual(d("2027-05-15"));
    expect(returnDueDate(fund({ lodgedBy: "SELF" }), "2025-26").date).toEqual(d("2026-10-31"));
    expect(returnDueDate(fund(null, "2025-09-01"), "2025-26").date).toEqual(d("2027-02-28"));
  });

  it("reports a pension start within 28 days after the quarter ends", () => {
    expect(tbarDueDate(d("2026-08-15"))).toEqual(d("2026-10-28"));
    expect(tbarDueDate(d("2026-12-31"))).toEqual(d("2027-01-28"));
  });
});

describe("SMSF routes", () => {
  const agent = request.agent(app);
  async function post(path: string, body: unknown) {
    const res = await agent.post(`/api${path}`).send(body as object);
    if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  let fundId: string;
  let alex: { id: string };
  let sam: { id: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "smsf test passcode" })).status).toBe(201);
    fundId = (await post("/entities", { name: "Example Super Fund", entityType: "SMSF", establishmentDate: iso("2015-03-01") })).id;
    alex = await post("/people", { name: "Alex Member", dateOfBirth: iso("1960-05-01") });
    sam = await post("/people", { name: "Sam Member", dateOfBirth: iso("1962-02-01") });
  });

  // Super history deliberately blocks deleting a person, so clear it for the
  // test files that reset people.
  afterAll(async () => {
    await prisma.superContribution.deleteMany();
    await prisma.smsfMemberYear.deleteMany();
    await prisma.smsfPension.deleteMany();
  });

  it("refuses the SMSF page for an entity that isn't a fund", async () => {
    const trust = await post("/entities", { name: "Not A Fund", entityType: "TRUST" });
    expect((await agent.get(`/api/smsf/${trust.id}`)).status).toBe(400);
  });

  it("adds members and flags a member who isn't a trustee", async () => {
    await post(`/smsf/${fundId}/members`, { personId: alex.id, trustee: true });
    await post(`/smsf/${fundId}/members`, { personId: sam.id, trustee: false });
    await agent.put(`/api/smsf/${fundId}/details`).send({ trusteeType: "INDIVIDUAL", auditorName: "A. Auditor", lodgedBy: "TAX_AGENT" });
    const view = (await agent.get(`/api/smsf/${fundId}?fy=2026-27`)).body;
    expect(view.members.map((m: { name: string }) => m.name)).toEqual(["Alex Member", "Sam Member"]);
    expect(view.checks.join(" ")).toMatch(/Sam Member is a member but not recorded as a trustee/);
  });

  it("totals contributions per person, across their funds, against the caps", async () => {
    await post(`/smsf/${fundId}/contributions`, { personId: alex.id, date: iso("2026-08-01"), amount: 25_000, source: "SALARY_SACRIFICE" });
    await post(`/smsf/${fundId}/contributions`, {
      personId: alex.id,
      date: iso("2026-09-01"),
      amount: 10_000,
      source: "EMPLOYER",
      paidIntoOtherFund: "Industry Fund",
    });
    await post(`/smsf/${fundId}/contributions`, { personId: alex.id, date: iso("2026-10-01"), amount: 300_000, source: "DOWNSIZER" });
    const view = (await agent.get(`/api/smsf/${fundId}?fy=2026-27`)).body;
    const a = view.members.find((m: { personId: string }) => m.personId === alex.id);
    expect(a.concessional).toMatchObject({ cap: 32_500, used: 35_000, remaining: -2_500 });
    expect(a.nonConcessional.used).toBe(0); // downsizer counts towards neither cap
    expect(a.contributions.find((c: { amount: number }) => c.amount === 10_000).otherFund).toBe("Industry Fund");
    expect(view.checks.join(" ")).toMatch(/Alex Member is over the concessional cap/);
  });

  it("keeps a person's super history when someone tries to delete them", async () => {
    const res = await agent.delete(`/api/people/${alex.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/super contribution/);
  });

  it("works out a pension's minimum and what's left to pay", async () => {
    await agent.put(`/api/smsf/${fundId}/member-years`).send({ personId: alex.id, fyLabel: "2025-26", closingBalance: 600_000 });
    await agent.put(`/api/smsf/${fundId}/member-years`).send({ personId: sam.id, fyLabel: "2025-26", closingBalance: 400_000 });
    const pension = await post(`/smsf/${fundId}/pensions`, {
      personId: alex.id,
      kind: "ACCOUNT_BASED",
      startDate: iso("2025-07-01"),
      startBalance: 480_000,
    });
    await agent.put(`/api/smsf/pensions/${pension.id}/balances`).send({ fyLabel: "2026-27", openingBalance: 500_000 });
    await post(`/smsf/pensions/${pension.id}/payments`, { date: iso("2026-09-30"), amount: 6_000 });
    const view = (await agent.get(`/api/smsf/${fundId}?fy=2026-27`)).body;
    const p = view.pensions[0];
    expect(p.year.minimum).toBe(25_000);
    expect(p.paidThisYear).toBe(6_000);
    expect(p.stillToPay).toBe(19_000);
    // 500,000 of the 1,000,000 fund supports a retirement pension.
    expect(view.pensionShare.share).toBeCloseTo(0.5);
    expect((await agent.delete(`/api/smsf/pensions/${pension.id}`)).status).toBe(409);
  });

  it("shows an LRBA property's LVR and rent cover, and counts the loan as a property loan", async () => {
    const holding = await post("/entities", { name: "Example Holding Trust", entityType: "HOLDING_TRUST" });
    const property = await post("/properties", {
      name: "7 Fund St",
      address: "7 Fund St, Perth WA",
      entityId: fundId,
      currentValue: 500_000,
      weeklyRent: 500,
    });
    await post("/liabilities", {
      name: "Fund property loan",
      liabilityType: "LRBA_LOAN",
      entityId: fundId,
      currentBalance: 250_000,
      repaymentAmount: 1_500,
      repaymentFrequency: "MONTHLY",
      securityPropertyId: property.id,
      holdingTrustEntityId: holding.id,
    });
    const view = (await agent.get(`/api/smsf/${fundId}?fy=2026-27`)).body;
    expect(view.lrba[0]).toMatchObject({ lvr: 0.5, annualRent: 26_000, annualRepayments: 18_000, holdingTrust: { name: "Example Holding Trust" } });
    expect(view.lrba[0].rentCover).toBeCloseTo(26_000 / 18_000);
    const breakdown = (await agent.get(`/api/net-worth/preview?entityId=${fundId}`)).body;
    expect(breakdown.mortgages).toBe(250_000);
    // The holding trust can't be deleted while it holds the property.
    expect((await agent.delete(`/api/entities/${holding.id}`)).status).toBe(409);
  });

  it("puts the fund's dates in the expiry calendar", async () => {
    await agent.put(`/api/smsf/${fundId}/details`).send({ strategyReviewedOn: iso("2026-02-01"), lastReturnLodged: "2024-25" });
    const events = (await agent.get("/api/calendar?from=2026-01-01&to=2028-01-01")).body as Array<{ category: string; title: string; date: string }>;
    const smsf = events.filter((e) => e.category === "SMSF");
    expect(smsf.find((e) => e.title.startsWith("Annual return for 2025-26"))?.date).toBe("2027-05-15");
    expect(smsf.find((e) => e.title.startsWith("Appoint the auditor"))?.date).toBe("2027-03-31");
    expect(smsf.find((e) => e.title.startsWith("Review the investment strategy"))?.date).toBe("2027-02-01");
    expect(smsf.some((e) => e.title.startsWith("Pay Alex Member's pension minimum"))).toBe(true);
  });
});
