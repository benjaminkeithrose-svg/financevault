import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { assetsLiabilitiesCsv } from "../src/routes/documentPacks.js";

// Regression tests for the QA pass: error responses a person can read,
// deletes that refuse rather than destroy history, and totals that agree
// with each other across screens.

const agent = request.agent(app);
const iso = (d: string) => new Date(`${d}T00:00:00.000Z`).toISOString();

async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

beforeAll(async () => {
  await prisma.vault.deleteMany();
  const res = await agent.post("/api/vault/setup").send({ passcode: "integrity test passcode" });
  expect(res.status).toBe(201);
});

describe("error responses", () => {
  it("answers invalid input with 400 and a readable message, not a 500", async () => {
    const res = await agent.post("/api/entities").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Name is required/);
    expect(res.body.error).not.toMatch(/invalid_type|"path"/);
  });

  it("answers a missing record with 404, not a database error", async () => {
    const put = await agent.put("/api/liabilities/does-not-exist").send({ name: "x" });
    expect(put.status).toBe(404);
    const del = await agent.delete("/api/liabilities/does-not-exist");
    expect(del.status).toBe(404);
    expect(JSON.stringify(del.body)).not.toMatch(/prisma|P2025/i);
  });

  it("answers an unknown API path with JSON", async () => {
    const res = await agent.get("/api/no-such-thing");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("answers malformed JSON with 400", async () => {
    const res = await agent.post("/api/entities").set("content-type", "application/json").send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("deletes don't take history with them", () => {
  let entityId = "";

  beforeAll(async () => {
    entityId = (await post("/entities", { name: "Delete-test Trust", entityType: "TRUST" })).id;
  });

  it("refuses to delete a commercial property that has tenancies, and changes nothing", async () => {
    const cp = await post("/commercial-properties", { name: "Unit 9", address: "9 Test Rd", propertyTypes: ["INDUSTRIAL"], entityId, currentValue: 1_000_000 });
    const tenancy = await post(`/commercial-properties/${cp.id}/tenancies`, { tenantName: "Tenant", leaseStatus: "ACTIVE" });

    const res = await agent.delete(`/api/commercial-properties/${cp.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 tenancy/);
    expect(await prisma.tenancy.findUnique({ where: { id: tenancy.id } })).not.toBeNull();
    expect(await prisma.commercialProperty.findUnique({ where: { id: cp.id } })).not.toBeNull();
  });

  it("refuses to delete a property a loan is secured against", async () => {
    const property = await post("/properties", { name: "1 Loan St", address: "1 Loan St", entityId, currentValue: 800_000 });
    const loan = await post("/liabilities", {
      name: "Mortgage",
      liabilityType: "HOME_LOAN",
      entityId,
      currentBalance: 400_000,
      securityPropertyId: property.id,
    });

    const res = await agent.delete(`/api/properties/${property.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 secured loan/);
    const stillSecured = await prisma.liability.findUnique({ where: { id: loan.id } });
    expect(stillSecured?.securityPropertyId).toBe(property.id);
  });

  it("deletes an unused property with its asset, and removes links pointing at it", async () => {
    const property = await post("/properties", { name: "2 Free St", address: "2 Free St", entityId, currentValue: 500_000 });
    const doc = await prisma.document.create({
      data: {
        originalFilename: "rates.pdf",
        storedFilename: "x.pdf",
        filePath: "/nowhere/x.pdf",
        mimeType: "application/pdf",
        fileSize: 1,
        fileHash: `integrity-${Date.now()}`,
      },
    });
    await prisma.documentLink.create({ data: { documentId: doc.id, targetType: "PROPERTY", targetId: property.id } });

    const res = await agent.delete(`/api/properties/${property.id}`);
    expect(res.status).toBe(204);
    expect(await prisma.asset.findUnique({ where: { id: property.assetId } })).toBeNull();
    expect(await prisma.documentLink.count({ where: { targetId: property.id } })).toBe(0);
    // The document itself is kept.
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).not.toBeNull();
  });

  it("refuses to delete an investment account that holds parcels", async () => {
    const account = await post("/investments", { institution: "Broker", entityId, accountType: "SHARES" });
    const security = await post("/investments/securities", { code: "DELT", assetClass: "SHARE", priceSource: "MANUAL" });
    await post(`/investments/${account.id}/parcels`, {
      securityId: security.id,
      acquisitionDate: iso("2022-01-01"),
      quantity: 10,
      unitPrice: 5,
    });
    const res = await agent.delete(`/api/investments/${account.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 parcel/);
  });

  it("deletes a bank account together with its transactions and their document links", async () => {
    const account = await post("/banking/accounts", {
      institution: "Bank",
      accountName: "Old account",
      accountType: "TRANSACTION",
      entityId,
    });
    const txn = await post(`/banking/accounts/${account.id}/transactions`, {
      date: iso("2025-01-02"),
      description: "Coffee",
      amount: -5,
    });
    const doc = await prisma.document.create({
      data: {
        originalFilename: "receipt.pdf",
        storedFilename: "r.pdf",
        filePath: "/nowhere/r.pdf",
        mimeType: "application/pdf",
        fileSize: 1,
        fileHash: `integrity-txn-${Date.now()}`,
      },
    });
    await prisma.documentLink.create({ data: { documentId: doc.id, targetType: "TRANSACTION", targetId: txn.id } });

    const res = await agent.delete(`/api/banking/accounts/${account.id}`);
    expect(res.status).toBe(204);
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0);
    expect(await prisma.documentLink.count({ where: { targetId: txn.id } })).toBe(0);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).not.toBeNull();
  });

  it("moves an account's transactions when the account moves to another entity", async () => {
    const other = await post("/entities", { name: "New owner", entityType: "COMPANY" });
    const account = await post("/banking/accounts", {
      institution: "Bank",
      accountName: "Moving account",
      accountType: "SAVINGS",
      entityId,
    });
    const txn = await post(`/banking/accounts/${account.id}/transactions`, {
      date: iso("2025-01-03"),
      description: "Interest",
      amount: 2,
    });
    const res = await agent.put(`/api/banking/accounts/${account.id}`).send({ entityId: other.id });
    expect(res.status).toBe(200);
    expect((await prisma.transaction.findUnique({ where: { id: txn.id } }))?.entityId).toBe(other.id);
    await agent.delete(`/api/banking/accounts/${account.id}`);
  });

  it("refuses to delete an entity that still owns things, naming what", async () => {
    const res = await agent.delete(`/api/entities/${entityId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 loan\b/);
    expect(res.body.error).toMatch(/investment account/);
  });
});

describe("totals agree across screens", () => {
  let entityId = "";

  beforeAll(async () => {
    entityId = (await post("/entities", { name: "Totals Person", entityType: "INDIVIDUAL" })).id;
    await post("/banking/accounts", {
      institution: "Bank",
      accountName: "Everyday",
      accountType: "TRANSACTION",
      entityId,
      currentBalance: 10_000,
    });
    await post("/assets", { name: "Car", assetType: "VEHICLE", entityId, currentValue: 20_000 });
    const account = await post("/investments", { institution: "Broker", entityId, accountType: "SHARES" });
    const security = await post("/investments/securities", { code: "TOTL", assetClass: "SHARE", priceSource: "MANUAL" });
    await post(`/investments/${account.id}/parcels`, {
      securityId: security.id,
      acquisitionDate: iso("2021-01-01"),
      quantity: 100,
      unitPrice: 10,
    });
    await post(`/investments/securities/${security.id}/prices`, { price: 12 });
  });

  it("dashboard matches the Net Worth page, including cash and share holdings", async () => {
    const dashboard = (await agent.get(`/api/dashboard?entityId=${entityId}`)).body.financialSnapshot;
    const netWorth = (await agent.get(`/api/net-worth/preview?entityId=${entityId}`)).body;
    // $10k cash + $20k car + 100 shares at $12.
    expect(netWorth.totalAssets).toBe(31_200);
    expect(dashboard.totalAssets).toBe(netWorth.totalAssets);
    expect(dashboard.netPosition).toBe(netWorth.netPosition);
    expect(dashboard.investmentValue).toBe(1_200);
  });

  it("the entity's balance sheet includes its share holdings", async () => {
    const entity = (await agent.get(`/api/entities/${entityId}`)).body;
    expect(entity.financialPosition.totalAssets).toBe(31_200);
    expect(entity.financialPosition.byAssetType.INVESTMENT_HOLDINGS).toBe(1_200);
  });
});

describe("capital gains report", () => {
  it("takes losses off gains before the discount, per entity", async () => {
    const entityId = (await post("/entities", { name: "CGT Person", entityType: "INDIVIDUAL" })).id;
    const account = await post("/investments", { institution: "Broker", entityId, accountType: "SHARES" });
    const winner = await post("/investments/securities", { code: "WIN", assetClass: "SHARE", priceSource: "MANUAL" });
    const loser = await post("/investments/securities", { code: "LOSE", assetClass: "SHARE", priceSource: "MANUAL" });
    await post(`/investments/${account.id}/parcels`, { securityId: winner.id, acquisitionDate: iso("2020-01-01"), quantity: 100, unitPrice: 100 });
    await post(`/investments/${account.id}/parcels`, { securityId: loser.id, acquisitionDate: iso("2020-01-01"), quantity: 100, unitPrice: 100 });
    // $10,000 discountable gain and a $4,000 loss in the same year.
    const sale = await post(`/investments/${account.id}/disposals`, { securityId: winner.id, disposalDate: iso("2023-03-01"), quantity: 100, unitPrice: 200 });
    await post(`/investments/${account.id}/disposals`, { securityId: loser.id, disposalDate: iso("2023-03-02"), quantity: 100, unitPrice: 60 });

    const report = (await agent.get(`/api/reports/capital-gains?financialYearId=${sale.financialYearId}`)).body;
    const row = report.byEntity.find((e: { entityId: string }) => e.entityId === entityId);
    // (10,000 - 4,000) x 50% = 3,000 — not 10,000 x 50% - 4,000 = 1,000.
    expect(row.netCapitalGain).toBe(3_000);
    expect(row.discountAmount).toBe(3_000);
    expect(row.lossCarriedForward).toBe(0);

    const summary = (await agent.get(`/api/reports/tax-summary?financialYearId=${sale.financialYearId}`)).body;
    const taxRow = summary.rows.find((r: { entityId: string }) => r.entityId === entityId);
    expect(taxRow.calculatedCapitalGain).toBe(3_000);
  });
});

describe("deleting documents", () => {
  async function makeDocument(name: string) {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fv-doc-")), name);
    fs.writeFileSync(filePath, "test");
    return prisma.document.create({
      data: {
        originalFilename: name,
        storedFilename: name,
        filePath,
        mimeType: "application/pdf",
        fileSize: 4,
        fileHash: `${name}-${Date.now()}`,
      },
    });
  }

  it("archiving keeps the file but hides it from the list", async () => {
    const doc = await makeDocument("archive-me.pdf");
    expect((await agent.delete(`/api/documents/${doc.id}`)).status).toBe(204);
    expect(fs.existsSync(doc.filePath)).toBe(true);
    const list = (await agent.get("/api/documents")).body as Array<{ id: string }>;
    expect(list.some((d) => d.id === doc.id)).toBe(false);
    const archived = (await agent.get("/api/documents?reviewStatus=ARCHIVED")).body as Array<{ id: string }>;
    expect(archived.some((d) => d.id === doc.id)).toBe(true);
  });

  it("deleting permanently removes the record, its links and the file", async () => {
    const doc = await makeDocument("delete-me.pdf");
    await prisma.documentLink.create({ data: { documentId: doc.id, targetType: "PERSON", targetId: "someone" } });
    expect((await agent.delete(`/api/documents/${doc.id}?permanent=true`)).status).toBe(204);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await prisma.documentLink.count({ where: { documentId: doc.id } })).toBe(0);
    expect(fs.existsSync(doc.filePath)).toBe(false);
  });
});

describe("vehicles, vehicle loans and credit card limits", () => {
  let entityId = "";
  let boatId = "";

  beforeAll(async () => {
    entityId = (await post("/entities", { name: "Borrower", entityType: "INDIVIDUAL" })).id;
    const boat = await post("/assets", {
      name: "The tinny",
      assetType: "VEHICLE",
      vehicleType: "BOAT",
      make: "Quintrex",
      model: "420 Hornet",
      year: 2020,
      registration: "BQ123",
      entityId,
      currentValue: 25_000,
    });
    boatId = boat.id;
    await post("/liabilities", {
      name: "Boat loan",
      liabilityType: "VEHICLE_LOAN",
      entityId,
      currentBalance: 15_000,
      repaymentAmount: 300,
      repaymentFrequency: "FORTNIGHTLY",
      securityAssetId: boatId,
    });
    await post("/liabilities", {
      name: "Visa",
      liabilityType: "CREDIT_CARD",
      entityId,
      currentBalance: 1_000,
      creditLimit: 20_000,
    });
  });

  it("keeps the vehicle's details and shows the loan against it", async () => {
    const boat = (await agent.get(`/api/assets/${boatId}`)).body;
    expect(boat).toMatchObject({ vehicleType: "BOAT", make: "Quintrex", year: 2020, registration: "BQ123" });
    expect(boat.securedLoans).toHaveLength(1);
  });

  it("won't delete a vehicle while a loan is linked to it", async () => {
    const res = await agent.delete(`/api/assets/${boatId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 loan linked to it/);
  });

  it("counts vehicle loans on their own line in net worth", async () => {
    const nw = (await agent.get(`/api/net-worth/preview?entityId=${entityId}`)).body;
    expect(nw.vehicleLoans).toBe(15_000);
    expect(nw.creditCards).toBe(1_000);
    expect(nw.totalLiabilities).toBe(16_000);
    expect(nw.vehicleValue).toBe(25_000);
  });

  it("borrowing summary gives card limits and monthly repayments", async () => {
    const summary = (await agent.get("/api/reports/debt-summary")).body;
    const boatLoan = summary.rows.find((r: { name: string }) => r.name === "Boat loan");
    // $300 a fortnight = 300 x 26 / 12 = $650 a month.
    expect(boatLoan.monthlyRepayment).toBe(650);
    expect(boatLoan.securedAsset).toBe("2020 Quintrex 420 Hornet (rego BQ123)");
    const visa = summary.rows.find((r: { name: string }) => r.name === "Visa");
    expect(visa.creditLimit).toBe(20_000);
    expect(summary.totalCreditLimits).toBeGreaterThanOrEqual(20_000);
    expect(summary.totalMonthlyRepayments).toBeGreaterThanOrEqual(650);
  });

  it("the broker's assets and liabilities statement carries limits and repayments", async () => {
    const csv = await assetsLiabilitiesCsv(entityId);
    expect(csv).toMatch(/Credit limit.*Monthly repayment/);
    expect(csv).toMatch(/Visa.*20000/);
    expect(csv).toMatch(/Boat loan.*650\.00.*2020 Quintrex 420 Hornet/);
    expect(csv).toMatch(/BOAT: 2020 Quintrex 420 Hornet/);
  });
});
