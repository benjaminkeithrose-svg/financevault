import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { compareCars } from "../src/services/carCompare.js";
import { taxChange } from "../src/services/incomeTax.js";
import { compareStructures } from "../src/services/structureCompare.js";
import { carClaim, wfhClaim } from "../src/services/workDeductions.js";

// Batch 4: PAYG work deductions and the car comparison, the "worth asking
// your accountant" checklist, and the structure comparison.

describe("work deductions (ATO rates)", () => {
  it("claims cents per km at the year's rate, capped at 5,000 km", () => {
    expect(carClaim(3_000, "2026-27")).toMatchObject({ amount: 2_730, capped: false });
    expect(carClaim(8_000, "2025-26")).toMatchObject({ amount: 4_400, kmCounted: 5_000, capped: true });
  });
  it("claims working from home at 70c an hour", () => {
    expect(wfhClaim(600, "2025-26")).toMatchObject({ amount: 420, rateKnown: true });
    expect(wfhClaim(600, "2026-27").rateKnown).toBe(false);
  });
});

describe("car comparison", () => {
  const base = { fy: "2026-27", baseIncome: 150_000, leasePayments: 12_000, runningCosts: 6_000, carPrice: 50_000, workKm: 4_000, allowance: 15_000 };
  it("works out the after-tax cost of each option", () => {
    const [allowance, novated, electric] = compareCars(base);
    expect(allowance.netCost).toBeCloseTo(18_000 - 15_000 + taxChange(150_000, 15_000 - 3_640));
    expect(novated.postTax).toBe(10_000); // 20% of $50,000
    expect(novated.preTax).toBe(8_000);
    expect(novated.netCost).toBeCloseTo(18_000 + taxChange(150_000, -8_000));
    expect(electric.preTax).toBe(18_000);
    expect(electric.netCost).toBeLessThan(novated.netCost);
  });
  it("warns about the 2027 change for electric cars over $75,000", () => {
    const [, , electric] = compareCars({ ...base, electricCarPrice: 80_000 });
    expect(electric.notes.join(" ")).toMatch(/1 April 2027/);
  });
});

describe("structure comparison", () => {
  const inputs = {
    price: 800_000,
    rent: 36_400,
    runningCosts: 6_000,
    loanAmount: 640_000,
    ratePct: 6,
    landValue: 500_000,
    depreciation: 5_000,
    growthPct: 5,
    yearsHeld: 10,
    residential: true,
    nsw: true,
    people: [
      { id: "a", name: "Alex", income: 180_000, existingNswLand: 700_000 },
      { id: "s", name: "Sam", income: 40_000, existingNswLand: 0 },
    ],
    beneficiaryIds: ["s"],
  };
  it("shows a loss helping the high earner, trapped in a trust, and SMSF borrowing blocked for residential", () => {
    const opts = compareStructures(inputs);
    const alex = opts.find((o) => o.key === "person-a")!;
    const trust = opts.find((o) => o.key === "trust")!;
    const smsf = opts.find((o) => o.key === "smsf")!;
    const company = opts.find((o) => o.key === "company")!;
    expect(alex.taxResult).toBeLessThan(0);
    expect(alex.yearlyTax).toBeLessThan(0); // tax saved
    expect(alex.landTax).toBeCloseTo(100 + 0.016 * (1_200_000 - 1_075_000));
    expect(trust.yearlyTax).toBe(0);
    expect(trust.landTax).toBe(8_000); // 1.6% from the first dollar
    expect(smsf.available).toBe(false);
    const gain = 800_000 * (Math.pow(1.05, 10) - 1);
    expect(company.saleTax).toBeCloseTo(gain * 0.3);
    expect(alex.saleTax).toBeCloseTo(taxChange(180_000, gain * 0.5));
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
    expect((await agent.post("/api/vault/setup").send({ passcode: "payg advice test passcode" })).status).toBe(201);
  });

  it("records work deductions, flags missing records and a car allowance, and explains a claim", async () => {
    const jo = await post("/people", { name: "Jo Teacher", grossSalary: 95_000, occupation: "Teacher", employmentType: "FULL_TIME", carAllowance: 8_000 });
    const d = await post(`/payg/people/${jo.id}/deductions`, { fyLabel: "2026-27", category: "SELF_EDUCATION", description: "Masters unit", amount: 1_800 });
    let view = (await agent.get(`/api/payg/people/${jo.id}?fy=2026-27`)).body;
    expect(view.total).toBe(1_800);
    expect(view.checks.join(" ")).toMatch(/car allowance/);
    expect(view.checks.join(" ")).toMatch(/no receipt/);
    expect(view.estimatedTaxSaved).toBeCloseTo(-taxChange(103_000, -1_800, "2026-27"));
    await post(`/payg/people/${jo.id}/deductions`, { fyLabel: "2026-27", category: "CAR", description: "Work trips", amount: 2_730, method: "CENTS_PER_KM", quantity: 3_000 });
    view = (await agent.get(`/api/payg/people/${jo.id}?fy=2026-27`)).body;
    expect(view.checks.join(" ")).not.toMatch(/car allowance is taxed/);

    await agent.put("/api/claim-notes").send({ targetType: "WORK_DEDUCTION", targetId: d.id, reason: "Course for my current teaching role" }).expect(200);
    expect((await agent.get(`/api/payg/people/${jo.id}?fy=2026-27`)).body.reasonsFor).toEqual([d.id]);

    const statement = await post(`/payg/people/${jo.id}/income-statements`, { fyLabel: "2026-27", grossPayments: 60_000, allowances: 8_000 });
    expect((await agent.get(`/api/payg/people/${jo.id}?fy=2026-27`)).body.checks.join(" ")).toMatch(/differs/);
    await agent.delete(`/api/payg/income-statements/${statement.id}`).expect(204);

    const car = (await post("/payg/car-compare", { personId: jo.id, fy: "2026-27", leasePayments: 10_000, runningCosts: 5_000, carPrice: 45_000, workKm: 3_000, allowance: 8_000 })).options;
    expect(car).toHaveLength(3);
  });

  it("builds the accountant checklist from the records, and the facts for a private ruling", async () => {
    const pat = await agent.get(`/api/people/${(await post("/people", { name: "Pat Owner", grossSalary: 200_000 })).id}`).then((r) => r.body);
    const trust = await post("/entities", { name: "Pat Family Trust", entityType: "TRUST" });
    const rental = await post("/properties", { name: "5 Trust St", address: "5 Trust St, Sydney NSW", state: "NSW", entityId: trust.id, currentValue: 700_000, weeklyRent: 300 });
    await post("/liabilities", { name: "Trust loan", liabilityType: "INVESTMENT_LOAN", entityId: trust.id, currentBalance: 600_000, interestRate: 6, securityPropertyId: rental.id, establishmentFees: 800 });

    const { items } = (await agent.get("/api/accountant-checklist")).body as { items: Array<{ id: string; risk: string }> };
    const ids = items.map((i) => i.id);
    expect(ids).toContain(`mls-${pat.id}`);
    expect(ids).toContain(`depreciation-${rental.assetId}`);
    expect(ids).toContain("trust-distributions");
    expect(ids).toContain(`trust-loss-${rental.assetId}`);
    expect(ids.some((i) => i.startsWith("loan-uses-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("borrowing-costs-"))).toBe(true);
    expect(items.find((i) => i.id === "trust-distributions")!.risk).toBe("ATO_TARGETED");

    const facts = await agent.get(`/api/accountant-checklist/trust-loss-${rental.assetId}/facts`).expect(200);
    expect(facts.text).toMatch(/private binding ruling/);
    expect(facts.text).toMatch(/Pat Family Trust/);
  });

  it("compares structures with the family's real incomes and land", async () => {
    const view = (await agent.get("/api/structure-comparison")).body;
    const pat = view.people.find((p: { name: string }) => p.name === "Pat Owner");
    const result = (
      await post("/structure-comparison", {
        price: 800_000,
        rent: 36_400,
        runningCosts: 6_000,
        loanAmount: 640_000,
        ratePct: 6,
        landValue: 500_000,
        depreciation: 5_000,
        growthPct: 5,
        yearsHeld: 10,
        residential: true,
        nsw: true,
        personIds: [pat.id],
        beneficiaryIds: [pat.id],
      })
    ).options;
    expect(result.map((o: { key: string }) => o.key)).toEqual([`person-${pat.id}`, "trust", "company", "smsf"]);
  });
});
