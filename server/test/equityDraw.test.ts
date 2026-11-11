import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";
import { prisma } from "../src/db.js";
import { isMixed, purposeSplit, yearSplit } from "../src/services/debtAllocation.js";
import { splitLoanFlags } from "../src/services/equityDraw.js";

// Debt allocation, stage 2: redraws apportioned the ATO's way (TR 2000/2),
// drawing equity from a property with a preview of what to watch for, and
// linking a Portfolio Plan's equity draw to the real loan (stage 3).

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const use = (id: string, amount: number, deductible: boolean, date: string | null = null, balanceBefore: number | null = null) => ({
  id,
  amount,
  deductible,
  date: date ? d(date) : null,
  balanceBefore,
  assetId: null,
  description: id,
});

describe("the ATO's proportional method", () => {
  it("scales earlier uses to the balance before a redraw, then adds the redraw", () => {
    // $400k borrowed for a rental, repaid to $300k, then $100k redrawn for a car.
    const purposes = [use("rental", 400_000, true), use("car", 100_000, false, "2026-01-01", 300_000)];
    const split = purposeSplit(purposes);
    expect(split.total).toBe(400_000);
    expect(split.deductible).toBe(300_000);
    expect(split.deductibleShare).toBe(0.75); // not 400/500 = 80%
    expect(isMixed(split)).toBe(true);
    // Before the redraw, it was all deductible.
    expect(purposeSplit(purposes, d("2025-12-31")).deductibleShare).toBe(1);
  });

  it("without redraw balances, works as before: each use's amount", () => {
    const split = purposeSplit([use("a", 300_000, true), use("b", 100_000, false)]);
    expect(split.deductibleShare).toBe(0.75);
  });

  it("weights a year by balance and days when a redraw happens part-way", () => {
    const purposes = [use("rental", 300_000, true), use("holiday", 100_000, false, "2026-01-01", 300_000)];
    const year = yearSplit(purposes, d("2025-07-01"), d("2026-06-30"))!;
    // 184 days at $300k all deductible, then 180 days at $400k with $300k deductible.
    expect(year.deductibleShare).toBeCloseTo((300 * 184 + 300 * 180) / (300 * 184 + 400 * 180), 6);
    expect(year.changedDuring.map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-01-01"]);
  });

  it("flags an interest-only investment split beside a private split being paid down (TD 2012/1)", () => {
    const investment = { interestOnly: true, purposes: [use("rental", 500_000, true)] };
    const home = { interestOnly: false, purposes: [use("home", 400_000, false)] };
    expect(splitLoanFlags([investment, home])[0]).toMatch(/TD 2012\/1/);
    expect(splitLoanFlags([{ ...investment, interestOnly: false }, home])).toEqual([]);
  });
});

describe("drawing equity, through the app", () => {
  const agent = request.agent(app);
  async function send(p: string, body: unknown, status = 200) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status !== status) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "equity draw test passcode" })).status).toBe(201);
  });

  it("previews, then draws as a new split or a redraw, and links the plan's draw", async () => {
    const owner = (await agent.get(`/api/people/${(await send("/people", { name: "Draw Dana" }, 201)).id}`)).body;
    const rental = await send(
      "/properties",
      { name: "4 Equity Ave", address: "4 Equity Ave, Wagga NSW", state: "NSW", entityId: owner.entityId, currentValue: 1_000_000, use: "INVESTMENT" },
      201
    );
    const base = await send(
      "/liabilities",
      { name: "Westpac investment loan", liabilityType: "INVESTMENT_LOAN", entityId: owner.entityId, lender: "Westpac", currentBalance: 500_000, interestRate: 6.1, securityPropertyId: rental.id },
      201
    );
    await send(`/debt-allocation/loans/${base.id}/purposes`, { amount: 500_000, use: "PROPERTY", deductible: true, description: "Buying 4 Equity Ave" }, 201);

    const draw = { assetId: rental.assetId, date: "2026-08-01", use: "PROPERTY", deductible: true, description: "Deposit on the next rental", mode: "NEW_SPLIT" };
    // $800k usable limit less $500k owed = $300k: $400k is over it.
    const over = await send("/debt-allocation/equity-draw", { ...draw, amount: 400_000 });
    expect(over.warnings.join(" ")).toMatch(/more than the usable-equity estimate of \$300,000/);
    expect(over.loanName).toBe("Westpac investment loan — Deposit on the next rental");

    // A plan's equity draw to link it to.
    const fy = { id: (await ensureFinancialYear("2026-27"))! };
    const plan = await prisma.portfolioPlan.create({
      data: { name: "Draw test plan", startFinancialYearId: fy.id, interestRate: 0.06, rentalGrowthRate: 0.03, capRate: 0.05, refinanceLvrTarget: 0.8 },
    });
    const pp = await prisma.planProperty.create({ data: { planId: plan.id, name: "Next rental", acquisitionYearNumber: 1, purchasePrice: 700_000, initialLvr: 0.8 } });
    const planDraw = await prisma.planEquityDraw.create({ data: { planPropertyId: pp.id, yearNumber: 1, amount: 150_000 } });

    const made = await send("/debt-allocation/equity-draw", { ...draw, amount: 150_000, confirm: true, planEquityDrawId: planDraw.id }, 201);
    const split = await prisma.liability.findUnique({ where: { id: made.loanId }, include: { purposes: true } });
    expect(split).toMatchObject({ facility: "Westpac investment loan", currentBalance: 150_000, securityPropertyId: rental.id, lender: "Westpac", liabilityType: "INVESTMENT_LOAN" });
    expect(split!.purposes).toHaveLength(1);
    expect((await prisma.liability.findUnique({ where: { id: base.id } }))!.facility).toBe("Westpac investment loan");
    expect(await prisma.planEquityDraw.findUnique({ where: { id: planDraw.id } })).toMatchObject({ liabilityId: made.loanId });

    // A private redraw on the original loan: previewed as making it mixed, then recorded.
    const redraw = { ...draw, amount: 50_000, use: "PRIVATE", deductible: false, description: "New car", mode: "EXISTING_LOAN", loanId: base.id };
    const preview = await send("/debt-allocation/equity-draw", redraw);
    expect(preview.warnings.join(" ")).toMatch(/mixed-purpose loan: about 91% deductible/);
    expect(preview.warnings.join(" ")).toMatch(/isn't deductible/);
    await send("/debt-allocation/equity-draw", { ...redraw, confirm: true }, 201);
    const after = (await agent.get(`/api/debt-allocation/loans/${base.id}`)).body;
    expect(after.split.deductibleShare).toBeCloseTo(500 / 550, 6);
    expect(after.purposes.find((p: { description: string }) => p.description === "New car").balanceBefore).toBe(500_000);
    expect(after.flags.join(" ")).toMatch(/Mixed purpose: 91%/);

    // With the investment loan interest-only, drawing a private split beside it is flagged (TD 2012/1).
    await prisma.liability.update({ where: { id: made.loanId }, data: { interestOnly: true } });
    const hart = await send("/debt-allocation/equity-draw", { ...draw, amount: 20_000, use: "PRIVATE", deductible: false, description: "Holiday" });
    expect(hart.warnings.join(" ")).toMatch(/TD 2012\/1/);
    expect((await prisma.liability.findUnique({ where: { id: base.id } }))!.currentBalance).toBe(550_000);

    // Redrawing on a loan that isn't secured by this property is refused.
    const other = await send("/liabilities", { name: "Car loan", liabilityType: "VEHICLE_LOAN", entityId: owner.entityId, currentBalance: 10_000 }, 201);
    const bad = await agent.post("/api/debt-allocation/equity-draw").send({ ...redraw, loanId: other.id });
    expect(bad.status).toBe(400);
  });
});
