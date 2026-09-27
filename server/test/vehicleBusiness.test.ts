import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { carLimit, declineInValue, treatmentFor } from "../src/services/vehicleBusiness.js";

// Business use of a vehicle: the logbook, the year's costs, and the schedule
// for tax time, treated by who owns the car.

describe("the sums", () => {
  it("caps a car's cost at the car limit for the year it was bought", () => {
    expect(carLimit("2025-26")).toBe(69_674);
    expect(carLimit("2026-27")).toBe(69_883);
    const first = declineInValue({ cost: 80_000, bought: new Date("2024-07-01T00:00:00Z"), fy: "2024-25", isCar: true });
    expect(first).toEqual({ amount: 17_419, base: 69_674, capped: true });
    // Then 25% of what's left.
    expect(declineInValue({ cost: 80_000, bought: new Date("2024-07-01T00:00:00Z"), fy: "2025-26", isCar: true }).amount).toBe(13_064);
    // A ute built to carry a tonne isn't capped.
    expect(declineInValue({ cost: 80_000, bought: new Date("2024-07-01T00:00:00Z"), fy: "2024-25", isCar: false }).capped).toBe(false);
  });

  it("counts only the days held in the first year, and nothing after it's sold", () => {
    expect(declineInValue({ cost: 40_000, bought: new Date("2025-01-01T00:00:00Z"), fy: "2024-25", isCar: true }).amount).toBe(4_959);
    expect(declineInValue({ cost: 40_000, bought: new Date("2025-01-01T00:00:00Z"), fy: "2023-24", isCar: true }).amount).toBe(0);
    const sold = new Date("2025-12-31T00:00:00Z");
    expect(declineInValue({ cost: 40_000, bought: new Date("2025-01-01T00:00:00Z"), fy: "2026-27", isCar: true, sold }).amount).toBe(0);
  });

  it("follows who owns the vehicle", () => {
    expect(treatmentFor("INDIVIDUAL")).toBe("LOGBOOK");
    expect(treatmentFor("PARTNERSHIP")).toBe("LOGBOOK");
    expect(treatmentFor("COMPANY")).toBe("COMPANY_TRUST");
    expect(treatmentFor("TRUST")).toBe("COMPANY_TRUST");
    expect(treatmentFor("SMSF")).toBe("SUPER_FUND");
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  async function send(method: "post" | "put", p: string, body: unknown, status?: number) {
    const res = await agent[method](`/api${p}`).send(body as object);
    if (status ? res.status !== status : res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "vehicle business test passcode" })).status).toBe(201);
  });

  it("works out a person's logbook claim and puts it in their work deductions", async () => {
    const created = await send("post", "/people", { name: "Logbook Larry" });
    const person = (await agent.get(`/api/people/${created.id}`)).body;
    const car = await send("post", "/assets", {
      name: "Larry's Prado",
      assetType: "VEHICLE",
      vehicleType: "CAR",
      entityId: person.entityId,
      acquisitionCost: 60_000,
      acquisitionDate: "2024-07-01T00:00:00.000Z",
    });
    // 12 weeks exactly: 1 August to 23 October.
    await send("post", `/vehicle-business/${car.id}/logbooks`, {
      startDate: "2024-08-01",
      endDate: "2024-10-23",
      startOdometer: 40_000,
      endOdometer: 45_000,
      businessKm: 3_600,
    });
    const s = await send("put", `/vehicle-business/${car.id}/years/2025-26`, {
      openingOdometer: 50_000,
      closingOdometer: 70_000,
      fuel: 3_000,
      registration: 900,
      insurance: 1_500,
      repairs: 800,
    });
    expect(s.treatment).toBe("LOGBOOK");
    expect(s.logbook.percent).toBe(72);
    expect(s.logbook.validUntilFy).toBe("2028-29");
    expect(s.km).toBe(20_000);
    expect(s.businessKm).toBe(14_400);
    expect(s.workedDecline.amount).toBe(11_250); // 60,000 × 75% × 25%
    expect(s.totalCosts).toBe(17_450);
    expect(s.claim).toBe(12_564);
    expect(s.warnings).toEqual([]);

    const d = await send("post", `/vehicle-business/${car.id}/schedule/2025-26/work-deduction`, {}, 201);
    expect(d).toMatchObject({ category: "CAR", method: "LOGBOOK", amount: 12_564, fyLabel: "2025-26" });
    // Again, after a change: the same entry is updated, not a second one added.
    await send("put", `/vehicle-business/${car.id}/years/2025-26`, { fuel: 4_000 });
    const again = await send("post", `/vehicle-business/${car.id}/schedule/2025-26/work-deduction`, {}, 200);
    expect(again.id).toBe(d.id);
    expect(await prisma.workDeduction.count({ where: { personId: person.id, category: "CAR" } })).toBe(1);

    // A logbook is good for five years: the sixth year has none.
    const later = (await agent.get(`/api/vehicle-business/${car.id}/schedule?fy=2029-30`)).body;
    expect(later.logbook).toBeNull();
    expect(later.warnings.join(" ")).toMatch(/No logbook covers this year/);

    // What's missing: a current logbook and the year's odometer readings.
    type Item = { addAs: string; met: boolean; kind: string };
    const items = async (fy: string): Promise<Item[]> =>
      (await agent.get(`/api/expected?fy=${fy}&target=${encodeURIComponent(`asset:${car.id}`)}`)).body.groups[0].items;
    const now = await items("2025-26");
    expect(now.find((i) => i.addAs === "LOGBOOK")).toMatchObject({ kind: "RECORD", met: true });
    expect(now.find((i) => i.addAs === "ODOMETER")?.met).toBe(true);
    const sixth = await items("2029-30");
    expect(sixth.find((i) => i.addAs === "LOGBOOK")?.met).toBe(false);
    expect(sixth.find((i) => i.addAs === "ODOMETER")?.met).toBe(false);

    // The car can't be deleted with its logbook on record.
    const del = await agent.delete(`/api/assets/${car.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/logbook/);
  });

  it("flags a short logbook and missing odometer readings", async () => {
    const created = await send("post", "/people", { name: "Short Sheila" });
    const person = (await agent.get(`/api/people/${created.id}`)).body;
    const car = await send("post", "/assets", { name: "Sheila's Corolla", assetType: "VEHICLE", vehicleType: "CAR", entityId: person.entityId });
    await send("post", `/vehicle-business/${car.id}/logbooks`, { startDate: "2025-08-01", endDate: "2025-08-31", totalKm: 2_000, businessKm: 500 });
    const s = (await agent.get(`/api/vehicle-business/${car.id}/schedule?fy=2025-26`)).body;
    expect(s.logbook.percent).toBe(25);
    expect(s.warnings.join(" ")).toMatch(/31 days/);
    expect(s.warnings.join(" ")).toMatch(/odometer/);
    const bad = await agent.post(`/api/vehicle-business/${car.id}/logbooks`).send({ startDate: "2025-08-01", endDate: "2025-10-31", totalKm: 100, businessKm: 500 });
    expect(bad.status).toBe(400);
  });

  it("treats a company's car as actual costs with fringe benefits tax on private use", async () => {
    const company = await send("post", "/entities", { name: "Larry Pty Ltd", entityType: "COMPANY" });
    const car = await send("post", "/assets", {
      name: "Company Hilux",
      assetType: "VEHICLE",
      vehicleType: "CAR",
      entityId: company.id,
      acquisitionCost: 50_000,
      acquisitionDate: "2025-07-01T00:00:00.000Z",
    });
    let s = (await agent.get(`/api/vehicle-business/${car.id}/schedule?fy=2025-26`)).body;
    expect(s.treatment).toBe("COMPANY_TRUST");
    expect(s.warnings.join(" ")).toMatch(/statutory formula/);
    expect(s.fbt.statutoryTaxable).toBe(10_000);

    await send("post", `/vehicle-business/${car.id}/logbooks`, { startDate: "2025-07-01", endDate: "2025-09-30", totalKm: 10_000, businessKm: 8_000 });
    s = await send("put", `/vehicle-business/${car.id}/years/2025-26`, { openingOdometer: 1_000, closingOdometer: 31_000, fuel: 5_000 });
    expect(s.fbt.privatePercent).toBe(20);
    // The company claims the full costs: fuel plus decline in value (50,000 × 25%).
    expect(s.claim).toBe(17_500);
    expect(s.fbt.operatingCostTaxable).toBe(3_500);
    // Not a person's car: it can't go into anyone's work deductions.
    expect((await agent.post(`/api/vehicle-business/${car.id}/schedule/2025-26/work-deduction`)).status).toBe(400);
  });
});
