import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma, prismaAll } from "../src/db.js";
import { placeFromAddress } from "../src/routes/considering.js";
import { factFindCsv } from "../src/routes/documentPacks.js";
import { ensureFinancialYear } from "../src/services/documentIngest.js";

// Properties being considered (or passed on) are normal property records
// with a status, and must never count: every total, report, checklist, tree
// and list is compared before and after adding some — nothing may change.
// Once bought, it counts like any other property.

const TOTALS = [
  "/api/accountant-checklist",
  "/api/assets",
  "/api/borrowing",
  "/api/calendar",
  "/api/commercial-properties",
  "/api/commercial-properties/portfolio",
  "/api/dashboard",
  "/api/debt-allocation/schedule?fy=2025-26",
  "/api/entities",
  "/api/expected",
  "/api/graph",
  "/api/net-worth/preview",
  "/api/properties",
  "/api/reports/capital-gains?financialYearId=FY",
  "/api/reports/debt-summary",
  "/api/reports/income-spending",
  "/api/reports/property-performance",
  "/api/reports/property-profit",
  "/api/reports/tax-summary?financialYearId=FY",
  "/api/tree",
];

describe("properties being considered", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let fyId = "";
  const snapshot = async (paths: string[]) => {
    const out: Record<string, string> = {};
    for (const p of paths.map((x) => x.replace("=FY", `=${fyId}`))) {
      const res = await agent.get(p);
      expect(res.status, p).toBeLessThan(300);
      out[p] = JSON.stringify(res.body);
    }
    return out;
  };
  let ownerEntityId = "";
  let personId = "";

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "considering test" })).status).toBe(201);
    const owner = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Considering Cleo", grossSalary: 140_000 })).id}`)).body;
    ownerEntityId = owner.entityId;
    personId = owner.id;
    fyId = (await ensureFinancialYear("2025-26"))!;
    // Something owned, so the reports have figures in them.
    const home = await send("post", "/properties", { name: "Cleo Home", address: "2 Own St, Bathurst NSW 2795", state: "NSW", entityId: ownerEntityId, use: "INVESTMENT", currentValue: 700_000, weeklyRent: 600 });
    await send("post", "/liabilities", { name: "Cleo loan", liabilityType: "INVESTMENT_LOAN", entityId: ownerEntityId, currentBalance: 400_000, interestRate: 6, securityPropertyId: home.id });
  });

  it("reads the suburb and state from an address", () => {
    expect(placeFromAddress("12 Smith St, Dubbo NSW 2830")).toEqual({ suburb: "Dubbo", state: "NSW" });
    expect(placeFromAddress("Unit 4, 9 Hill Rd, South Yarra vic")).toEqual({ suburb: "South Yarra", state: "VIC" });
    expect(placeFromAddress("Lot 7 Somewhere")).toEqual({ suburb: null, state: null });
  });

  it("leaves every total, report and list exactly as it was", async () => {
    const entityPage = `/api/entities/${ownerEntityId}`;
    const pages = [...TOTALS, entityPage, `/api/people/${personId}`, `/api/document-packs/preview?entityId=${ownerEntityId}&packType=BROKER`];
    const before = await snapshot(pages);
    const factFindBefore = await factFindCsv(ownerEntityId);

    // A rental being considered, with everything a total might pick up.
    const house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "5 Maybe Ave, Orange NSW 2800", askingPrice: 650_000, entityId: ownerEntityId });
    expect(house.route).toBe(`/properties/${house.id}`);
    await send("put", `/properties/${house.id}`, { currentValue: 660_000, weeklyRent: 620, councilRates: 2_400, strataFees: 0 });
    await send("put", `/assets/${house.assetId}`, { landValue: 300_000, landTaxPerYear: 1_200 });
    // A commercial one with a lease, and one passed on.
    const shop = await send("post", "/considering", { kind: "COMMERCIAL", address: "1 Shop Lane, Albury NSW 2640", askingPrice: 1_200_000, entityId: ownerEntityId });
    await send("post", `/commercial-properties/${shop.id}/tenancies`, { tenantName: "Maybe Cafe", rentPerAnnum: 84_000 });
    const unit = await send("post", "/considering", { kind: "RESIDENTIAL", address: "9/3 Nope St, Parkes NSW 2870", askingPrice: 400_000, entityId: ownerEntityId });
    await send("post", `/considering/${unit.assetId}/pass`, { reason: "Strata report showed a big special levy coming" }, 200);

    const after = await snapshot(pages);
    for (const p of Object.keys(before)) expect(after[p], p).toBe(before[p]);
    expect(await factFindCsv(ownerEntityId)).toBe(factFindBefore);
  });

  it("lists them with their stage, and keeps the ones passed on", async () => {
    // (Only this test's own — other test files leave theirs in the shared test database.)
    const mine = () => agent.get("/api/considering").then((r) => (r.body as Array<Record<string, unknown>>).filter((x) => x.owner === "Considering Cleo"));
    const list = await mine();
    expect(list).toHaveLength(3);
    const house = list.find((x) => x.address === "5 Maybe Ave, Orange NSW 2800")!;
    expect(house).toMatchObject({ kind: "RESIDENTIAL", stage: "LOOKING", status: "CONSIDERING", suburb: "Orange", askingPrice: 650_000 });
    expect(house.grossYield).toBeCloseTo((620 * 52) / 650_000);
    const shop = list.find((x) => x.kind === "COMMERCIAL")!;
    expect(shop.grossYield).toBeCloseTo(84_000 / 1_200_000);
    expect(list.find((x) => x.status === "PASSED_ON")).toMatchObject({ passedOnReason: "Strata report showed a big special levy coming", stage: "LOOKING" });
    // Its own page still opens.
    expect((await agent.get(`/api/properties/${house.id}`)).status).toBe(200);

    await send("put", `/considering/${house.assetId}/stage`, { stage: "INVESTIGATING" }, 200);
    expect((await agent.put(`/api/considering/${house.assetId}/stage`).send({ stage: "SOLD" })).status).toBe(400);
    const passed = list.find((x) => x.status === "PASSED_ON")!;
    expect((await agent.put(`/api/considering/${passed.assetId}/stage`).send({ stage: "OFFER" })).status).toBe(400);
    await send("post", `/considering/${passed.assetId}/reconsider`, {}, 200);
    expect((await prismaAll.asset.findUnique({ where: { id: String(passed.assetId) } }))?.status).toBe("CONSIDERING");
  });

  it("counts once bought", async () => {
    const before = (await agent.get("/api/net-worth/preview")).body;
    const house = ((await agent.get("/api/considering")).body as Array<Record<string, string>>).find((x) => x.address === "5 Maybe Ave, Orange NSW 2800")!;
    await send("post", `/considering/${house.assetId}/bought`, { price: 640_000 }, 200);
    const asset = await prisma.asset.findUnique({ where: { id: house.assetId } });
    expect(asset).toMatchObject({ status: "OWNED", acquisitionCost: 640_000, currentValue: 660_000, pipelineStage: null });
    expect(((await agent.get("/api/properties")).body as Array<{ id: string }>).map((p) => p.id)).toContain(house.id);
    expect(((await agent.get("/api/considering")).body as Array<{ owner: string }>).filter((x) => x.owner === "Considering Cleo").length).toBe(2);
    const after = (await agent.get("/api/net-worth/preview")).body;
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    // Bought is final — it's not "considered" any more.
    expect((await agent.post(`/api/considering/${house.assetId}/pass`).send({})).status).toBe(404);
  });
});
