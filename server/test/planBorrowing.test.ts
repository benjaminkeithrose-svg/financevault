import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";

// "Can you borrow it?" on a Portfolio Plan: each year's new borrowing against
// roughly what a lender might lend, counting the plan's earlier purchases.

describe("a plan's borrowing check", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "plan borrowing test" })).status).toBe(201);
    // Only this test's people have salaries.
    await prisma.person.updateMany({ data: { grossSalary: null } });
  });

  it("flags the years that need more than a lender might lend", async () => {
    const earner = await send("post", "/people", { name: "Borrow Bea", grossSalary: 180_000 });
    await send("put", "/borrowing/assumptions", { declaredExpenses: 4_000, benchmarkExpenses: null, buffer: 3 });
    const fy = (await ensureFinancialYear("2026-27"))!;
    const plan = await send("post", "/portfolio-plans", {
      name: "Borrowing plan",
      startFinancialYearId: fy,
      projectionYears: 5,
      interestRate: 0.06,
      rentalGrowthRate: 0.03,
      capRate: 0.05,
      refinanceLvrTarget: 0.8,
    });
    await send("post", `/portfolio-plans/${plan.id}/properties`, { name: "Small unit", acquisitionYearNumber: 1, purchasePrice: 400_000, initialLvr: 0.8, initialRent: 20_000 });
    await send("post", `/portfolio-plans/${plan.id}/properties`, { name: "Big house", acquisitionYearNumber: 3, purchasePrice: 3_000_000, initialLvr: 0.8, initialRent: 90_000 });

    const check = (await agent.get(`/api/portfolio-plans/${plan.id}/borrowing`)).body;
    expect(check.people.map((p: { name: string }) => p.name)).toEqual(["Borrow Bea"]);
    const [y1, y2, y3] = check.years;
    expect(y1).toMatchObject({ newBorrowing: 320_000, status: "FINE", parts: ["$320,000 to buy Small unit"] });
    expect(y2.status).toBeNull(); // nothing borrowed
    expect(y3).toMatchObject({ newBorrowing: 2_400_000, status: "TOO_MUCH" });
    // The unit's loan counts against later borrowing (its rent helps, but less).
    expect(y2.capacity[0]).toBeLessThan(y1.capacity[0] + 320_000);
    expect(check.overYears).toEqual([{ yearNumber: 3, status: "TOO_MUCH" }]);

    // Choosing who backs it: nobody with income → a note, and nothing fits.
    const other = await send("post", "/people", { name: "No Income Ned" });
    await send("put", `/portfolio-plans/${plan.id}`, { borrowerIds: [other.id] });
    const nedOnly = (await agent.get(`/api/portfolio-plans/${plan.id}/borrowing`)).body;
    expect(nedOnly.chosen).toBe(true);
    expect(nedOnly.years[0].status).toBe("TOO_MUCH");
    expect(nedOnly.notes.join(" ")).toMatch(/No income/);
    // Back to everyone with a salary.
    await send("put", `/portfolio-plans/${plan.id}`, { borrowerIds: [] });
    expect((await agent.get(`/api/portfolio-plans/${plan.id}/borrowing`)).body.chosen).toBe(false);
    expect(earner.id).toBeTruthy();
  });
});
