// Blink Check engine tests. Run: node --test blink-check/test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const E = createRequire(import.meta.url)("../src/engine.js");

const household = () => ({
  people: [
    { name: "Adam", salary: 150000, super: 180000 },
    { name: "Kate", salary: 100000, super: 150000 },
  ],
  livingMonthly: 5500,
  cash: 20000,
  cardLimits: 15000,
  otherRepayMonthly: 600,
  otherRepayYears: 3,
  home: { has: true, value: 900000, loan: { balance: 420000, rate: 5.8, type: "PI", yearsLeft: 25, offset: 60000 } },
  rentals: [{ id: "r1", name: "Rental 1", kind: "RES", value: 650000, costBase: 520000, rentWeekly: 600, loan: { balance: 470000, rate: 6.2, type: "IO", ioYears: 3, yearsLeft: 28 } }],
  assumptions: {},
});
const run = (steps, extra = {}) => {
  const p = household();
  Object.assign(p.assumptions, extra.assumptions || {});
  p.scenarios = [
    { id: "base", name: "Cash stays in the offset", baseline: true, steps: [] },
    { id: "s", name: "Plan", spare: extra.spare || "HOME_OFFSET", steps },
  ];
  return E.runAll(p);
};

test("an offset shortens a loan: $100k against $400k at 6% clears in about 16 years, not 30", () => {
  const pay = E.pmt(0.06, 360, 400000);
  assert.equal(Math.round(pay), 2398);
  const months = E.monthsToClear(400000, 100000, 0.06, pay);
  assert.ok(months > 190 && months < 200, `months ${months}`);
});

test("tax, duty and land tax match Financial Vault", () => {
  assert.equal(Math.round(E.individualTax(100000, 2026)), 4020 + 16500 + 2000); // 4,020 + 30% of 55,000 + 2% Medicare
  assert.equal(E.nswDuty(700000, true), 25687);
  assert.equal(E.nswLandTax(1000000), 0);
  assert.equal(Math.round(E.nswLandTax(1275000)), 100 + 3200);
});

test("spoken and typed amounts are read", () => {
  assert.equal(E.parseAmount("four hundred and twenty thousand"), 420000);
  assert.equal(E.parseAmount("$650k"), 650000);
  assert.equal(E.parseAmount("1.2m"), 1200000);
  assert.equal(E.parseAmount("one point five million"), 1500000);
  assert.equal(E.parseAmount("580 dollars"), 580);
  assert.equal(E.parseAmount("6.2%"), 6.2);
  assert.equal(E.parseAmount("blue"), null);
});

test("rates follow the cycle since 2000, starting from today's rate", () => {
  const shifts = E.rateShifts({ ...E.DEFAULT_ASSUMPTIONS, rateModel: "CYCLE", cycleStart: 2000, cycleScale: 1 }, 20);
  assert.equal(shifts[0], 0);
  assert.ok(Math.max(...shifts) > 1.5, "the 2008 peak shows");
  assert.ok(Math.min(...shifts) < -1, "the 2009 and 2020s lows show");
  assert.deepEqual(E.rateShifts({ ...E.DEFAULT_ASSUMPTIONS, rateModel: "FLAT" }, 5), [0, 0, 0, 0, 0]);
});

test("buying with equity: the money chain adds up, and the comparison uses the offset plan", () => {
  const r = run([{ id: "b1", type: "BUY", year: 1, kind: "RES", price: 700000, rentWeekly: 600, funding: "EQUITY" }]);
  const plan = r.runs.find((x) => x.id === "s");
  const c = plan.chains[0];
  assert.equal(c.total, 700000 + 25687 + 4000);
  assert.equal(c.mainLoan + c.equity.reduce((s, e) => s + e.amount, 0) + c.cash, c.total);
  assert.equal(c.equity[0].from, "Home");
  assert.ok(["LIKELY", "TIGHT", "UNLIKELY"].includes(c.borrow.result));
  assert.equal(plan.verdict.gain, plan.summary.nwEnd - r.base.summary.nwEnd);
  assert.equal(plan.years.length, 20);
});

test("negative gearing: rental losses bring tax back; switched off, they're carried forward", () => {
  const on = run([{ id: "b1", type: "BUY", year: 1, kind: "RES", price: 700000, rentWeekly: 600, funding: "EQUITY" }]).runs[1];
  const off = run([{ id: "b1", type: "BUY", year: 1, kind: "RES", price: 700000, rentWeekly: 600, funding: "EQUITY" }], { assumptions: { negativeGearing: false } }).runs[1];
  assert.ok(on.years[0].taxEffect < 0, "tax back in year 1");
  assert.equal(off.years[0].taxEffect, 0);
  assert.ok(on.years[0].writeOffs > 0, "the building write-off counts");
  assert.ok(on.years[0].investCashAfter > on.years[0].investCashBefore, "after tax is better than before tax");
});

test("cards and personal loans count against borrowing", () => {
  const p = household();
  const steps = [{ id: "b1", type: "BUY", year: 1, kind: "RES", price: 700000, rentWeekly: 600, funding: "EQUITY" }];
  p.scenarios = [{ id: "s", name: "Plan", steps }];
  const withDebts = E.simulate(p, p.scenarios[0]).chains[0].borrow.surplus;
  p.cardLimits = 0;
  p.otherRepayMonthly = 0;
  const without = E.simulate(p, p.scenarios[0]).chains[0].borrow.surplus;
  assert.equal(Math.round(without - withDebts), Math.round(15000 * 0.038 * 12 + 600 * 12));
});

test("spare cash goes where the plan says", () => {
  const own = run([{ id: "b1", type: "BUY", year: 1, kind: "RES", price: 500000, rentWeekly: 750, funding: "EQUITY" }], { spare: "OWN_OFFSET" }).runs[1];
  assert.ok(own.years.some((y) => y.sentTo.ownOffset > 0), "a positive property's money goes to its own offset");
  const cash = run([], { spare: "CASH" }).runs[1];
  assert.equal(cash.years[0].sentTo.homeOffset, 0);
  assert.ok(cash.years[0].sentTo.cash > 0);
});

test("selling clears its loans and pays down the rest", () => {
  const r = run([{ id: "sl", type: "SELL", year: 5, target: "r1" }]).runs[1];
  assert.ok(r.years[4].events.some((e) => /Sell rental 1/.test(e)));
  assert.ok(r.years[4].debt < r.years[3].debt);
});

test("debt recycling turns offset cash into shares with a deductible split", () => {
  const r = run([{ id: "sh", type: "SHARES", year: 1, amount: 50000, funding: "RECYCLE" }]).runs[1];
  assert.equal(r.chains[0].recycled, 50000);
  assert.ok(r.years[0].shares > 50000);
});

test("SMSF purchases come out of super, not household cash", () => {
  const r = run([{ id: "sm", type: "SMSF", year: 2, kind: "COM", price: 600000, rentWeekly: 850 }]).runs[1];
  assert.ok(r.chains[0].fromSuper > 0);
  assert.equal(r.years[1].upfrontCash, 0);
});

test("a plan that can't be funded says so", () => {
  const p = household();
  p.people = [{ name: "Solo", salary: 60000, super: 20000 }];
  p.home.loan.offset = 0;
  p.cash = 0;
  p.scenarios = [
    { id: "base", baseline: true, name: "Base", steps: [] },
    { id: "s", name: "Too big", steps: [{ id: "b", type: "BUY", year: 1, kind: "COM", price: 2500000, rentWeekly: 2000, funding: "EQUITY" }] },
  ];
  const r = E.runAll(p).runs[1];
  assert.equal(r.verdict.level, "STOP");
  assert.ok(r.verdict.stops.length >= 1);
});

test("a red flag goes up when the household can't carry a second purchase two years after the first", () => {
  const p = household();
  p.people = [{ name: "Solo", salary: 200000, super: 100000 }];
  p.cash = 30000;
  p.home.loan.offset = 20000;
  p.scenarios = [
    { id: "base", baseline: true, name: "Base", steps: [] },
    { id: "s", name: "Two quick buys", steps: [
      { id: "b1", type: "BUY", year: 8, kind: "RES", price: 900000, rentWeekly: 650, funding: "EQUITY" },
      { id: "b2", type: "BUY", year: 10, kind: "RES", price: 900000, rentWeekly: 650, funding: "EQUITY" },
    ] },
  ];
  const r = E.runAll(p).runs[1];
  assert.equal(r.verdict.level, "STOP");
  assert.match(r.verdict.stops.join(" "), /lender would very likely say no|Runs out of money/);
  assert.equal(r.years[0].income, 200000);
});

test("pay rises with prices (CPI) unless a wage growth figure is set", () => {
  const base = run([]).base;
  assert.equal(base.years[0].income, 250000);
  assert.equal(base.years[1].income, Math.round(250000 * 1.0275));
  const own = run([], { assumptions: { wageGrowth: 4 } }).base;
  assert.equal(own.years[1].income, 260000);
  assert.ok(base.years[0].takeHome > 0 && base.years[0].takeHome < 250000);
});

// --- Retirement -----------------------------------------------------------------
const retiree = (steps, extra = {}) => ({
  stage: "RETIRED",
  people: [{ name: "Mum", age: 72, salary: 0, super: 750000 }],
  livingMonthly: 4000,
  cash: 450000,
  rentWeekly: 550,
  home: { has: false },
  rentals: [],
  assumptions: Object.assign({}, extra.assumptions || {}),
  scenarios: [
    { id: "base", name: "Keep renting", baseline: true, steps: [] },
    { id: "s", name: "Buy a home", steps },
  ],
});

test("Age Pension: full rate on small assets, nothing on large, the home doesn't count", () => {
  const full = E.agePension({ couple: false, eligible: 1, homeowner: true, assets: 100000, financial: 60000, otherIncome: 0 });
  assert.equal(Math.round(full), E.AGE_PENSION.maxSingle);
  assert.equal(E.agePension({ couple: false, eligible: 1, homeowner: true, assets: 2000000, financial: 2000000, otherIncome: 0 }), 0);
  const renter = E.agePension({ couple: false, eligible: 1, homeowner: false, assets: 700000, financial: 680000, otherIncome: 0 });
  const owner = E.agePension({ couple: false, eligible: 1, homeowner: true, assets: 700000, financial: 680000, otherIncome: 0 });
  assert.ok(renter > owner, "non-homeowners get a higher assets threshold");
  assert.equal(E.agePension({ couple: false, eligible: 0, homeowner: true, assets: 0, financial: 0 }), 0);
});

test("super pension minimums go up with age", () => {
  assert.equal(E.minDrawRate(60), 0.04);
  assert.equal(E.minDrawRate(72), 0.05);
  assert.equal(E.minDrawRate(96), 0.14);
});

test("a retiree buying a home: paid from savings then super, rent stops, Age Pension goes up", () => {
  const r = E.runAll(retiree([{ id: "h", type: "HOME", year: 1, price: 800000 }]));
  const base = r.base;
  const buy = r.runs[1];
  const c = buy.chains[0];
  assert.equal(c.total, 800000 + E.nswDuty(800000, true) + 4000);
  assert.ok(c.fromSuper > 0, "super tops up what savings can't cover");
  assert.equal(c.cash + c.fromSuper, c.total);
  assert.ok(base.years[0].rentPaid > 0 && buy.years[1].rentPaid === 0);
  assert.ok(buy.years[1].agePension > base.years[1].agePension, "money moved into the home raises the pension");
  assert.ok(buy.years[0].homeEquity > 0);
  assert.ok(buy.years.length >= 28, "runs to age 100");
  assert.ok(typeof buy.maxHomePrice === "number" && buy.maxHomePrice > 0);
});

test("a home that's too dear raises a red flag, and the highest safe price is below it", () => {
  const r = E.runAll(retiree([{ id: "h", type: "HOME", year: 1, price: 1150000 }], { assumptions: { pensionReturn: 4, resGrowth: 3 } }));
  const buy = r.runs[1];
  assert.equal(buy.verdict.level, "STOP");
  assert.ok(buy.maxHomePrice < 1150000);
  const ok = E.runAll(retiree([{ id: "h", type: "HOME", year: 1, price: buy.maxHomePrice }], { assumptions: { pensionReturn: 4, resGrowth: 3 } })).runs[1];
  assert.notEqual(ok.verdict.level, "STOP");
});
