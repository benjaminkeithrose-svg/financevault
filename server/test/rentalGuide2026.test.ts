import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { accountantChecklist } from "../src/services/accountantChecklist.js";
import { expectedChecklist } from "../src/services/expected.js";
import { propertyProfit } from "../src/services/propertyProfit.js";

// What the ATO's 2026 guides changed: holiday homes also rented out
// (TR 2026/1, PCG 2026/3), part-private properties split by the rented share
// (PCG 2026/2), clearance certificates on every sale, and the $20,000
// instant asset write-off for 2025-26.

describe("the 2026 rental guide, through the app", () => {
  const agent = request.agent(app);
  const post = async (p: string, body: unknown) => {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status !== 201) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const put = async (p: string, body: unknown) => {
    const res = await agent.put(`/api${p}`).send(body as object);
    if (res.status !== 200) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let owner: { entityId: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "rental guide 2026 test" })).status).toBe(201);
    owner = (await agent.get(`/api/people/${(await post("/people", { name: "Guide Gale" })).id}`)).body;
  });

  const costs = { weeklyRent: 500, councilRates: 2_000, waterRates: 1_000, managementPercent: 10, repairsPerYear: 1_000, otherCostsPerYear: 500 };

  it("claims only the rented share of a holiday home's costs, and none of its ownership costs if it isn't mainly rented", async () => {
    const beach = await post("/properties", {
      name: "Guide Beach House",
      address: "1 Shore Rd, Byron Bay NSW",
      state: "QLD", // not NSW, so no land tax estimate muddies the sums
      entityId: owner.entityId,
      currentValue: 900_000,
      use: "HOLIDAY_RENTED",
      ...costs,
    });
    const row = async () => (await propertyProfit()).rows.find((r) => r.recordId === beach.id)!;

    // No share yet: everything counted, and said so.
    let r = await row();
    expect(r).toMatchObject({ use: "HOLIDAY_RENTED", rentedShare: 1, rent: 26_000 });
    expect(r.notes.join(" ")).toMatch(/rented share isn't entered/);
    expect(r.notes.join(" ")).toMatch(/mainly used to earn rent/);

    // 60% rented, mainly rented: 60% of everything but management (in full).
    await put(`/properties/${beach.id}`, { rentedShare: 60, mainlyRented: true });
    r = await row();
    const management = 2_600;
    const ownership = 2_000 + 1_000 + 1_000; // rates, water, repairs
    expect(r.deductions).toBeCloseTo(management + 0.6 * (ownership + 500), 6);
    expect(r.taxResult).toBeCloseTo(26_000 - r.deductions, 6);
    expect(r.cashBeforeTax).toBeCloseTo(26_000 - management - ownership - 500, 6); // cash is still all of it

    // Not mainly rented: its ownership costs are denied (s 26-50).
    await put(`/properties/${beach.id}`, { mainlyRented: false });
    r = await row();
    expect(r.deductions).toBeCloseTo(management + 0.6 * 500, 6);
    expect(r.notes.join(" ")).toMatch(/section 26-50, TR 2026\/1/);

    // What's missing: short-stay cover, and the year's rent.
    const group = (await expectedChecklist()).groups.find((g) => g.route === `/properties/${beach.id}`)!;
    const labels = group.items.map((i) => i.label);
    expect(labels).toContain("Holiday rental (short-stay) or landlord cover");
    expect(labels).toContain("Rent received for the year");
    expect(labels).not.toContain("Landlord insurance");

    // The accountant checklist flags it.
    const items = await accountantChecklist(new Date("2026-09-28T00:00:00Z"));
    const holiday = items.find((i) => i.id === `holiday-home-${beach.assetId}`)!;
    expect(holiday).toMatchObject({ risk: "ATO_TARGETED", title: expect.stringMatching(/not mainly rented/) });
    expect(holiday.source.referenceCode).toBe("TR 2026/1");
  });

  it("keeps a part-rented home as the home for land tax, and splits its costs", async () => {
    const home = await post("/properties", {
      name: "Guide Home With Flat",
      address: "2 Lane St, Orange NSW",
      state: "NSW",
      entityId: owner.entityId,
      currentValue: 800_000,
      use: "HOME_PART_RENTED",
      ...costs,
    });
    expect((await prisma.asset.findUnique({ where: { id: home.assetId } }))!.mainResidence).toBe("FULL");
    let r = (await propertyProfit()).rows.find((x) => x.recordId === home.id)!;
    expect(r.landTax.basis).toBe("EXEMPT_HOME");
    let items = await accountantChecklist(new Date("2026-09-28T00:00:00Z"));
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining([`rented-share-${home.assetId}`, `part-rented-home-${home.assetId}`]));

    await put(`/properties/${home.id}`, { rentedShare: 25 });
    r = (await propertyProfit()).rows.find((x) => x.recordId === home.id)!;
    expect(r.deductions).toBeCloseTo(2_600 + 0.25 * (4_000 + 500), 6);
    items = await accountantChecklist(new Date("2026-09-28T00:00:00Z"));
    expect(items.map((i) => i.id)).not.toContain(`rented-share-${home.assetId}`);

    // Only 0-100.
    expect((await agent.put(`/api/properties/${home.id}`).send({ rentedShare: 120 })).status).toBe(400);
  });

  it("an ordinary rental is worked out exactly as before", async () => {
    const rental = await post("/properties", {
      name: "Guide Rental",
      address: "3 Rent St, Toowoomba QLD",
      state: "QLD",
      entityId: owner.entityId,
      currentValue: 600_000,
      use: "INVESTMENT",
      ...costs,
    });
    const r = (await propertyProfit()).rows.find((x) => x.recordId === rental.id)!;
    expect(r.rentedShare).toBe(1);
    expect(r.taxResult).toBeCloseTo(r.cashBeforeTax - r.depreciation - r.capitalWorks, 6);
  });

  it("reminds about the 15% withheld on a sale, and the instant asset write-off", async () => {
    const sold = await post("/properties", { name: "Guide Sold Unit", address: "4 Sold St, Dubbo NSW", state: "NSW", entityId: owner.entityId, use: "INVESTMENT" });
    await put(`/assets/${sold.assetId}`, { disposalDate: "2026-08-15T00:00:00.000Z", disposalValue: 700_000 });
    const company = await post("/entities", { name: "Guide Pty Ltd", entityType: "COMPANY" });
    const laptop = await post("/assets", {
      name: "Guide laptop",
      assetType: "EQUIPMENT",
      entityId: company.id,
      acquisitionDate: "2026-02-10T00:00:00.000Z",
      acquisitionCost: 3_200,
    });
    const dear = await post("/assets", { name: "Guide excavator", assetType: "EQUIPMENT", entityId: company.id, acquisitionDate: "2026-02-10T00:00:00.000Z", acquisitionCost: 85_000 });

    const items = await accountantChecklist(new Date("2026-09-28T00:00:00Z"));
    const ids = items.map((i) => i.id);
    expect(items.find((i) => i.id === `clearance-${sold.assetId}`)?.rule).toMatch(/15% of the price/);
    expect(ids).toContain(`instant-write-off-${laptop.id}`);
    expect(ids).not.toContain(`instant-write-off-${dear.id}`);
    // Two years on, it's no longer this year's question.
    expect((await accountantChecklist(new Date("2027-09-28T00:00:00Z"))).map((i) => i.id)).not.toContain(`instant-write-off-${laptop.id}`);
  });
});
