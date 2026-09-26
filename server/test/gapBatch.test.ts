import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { assetsLiabilitiesCsv } from "../src/routes/documentPacks.js";
import { findTransfers, incomeAndSpending } from "../src/services/cashflow.js";
import { encryptStoredDocuments } from "../src/services/documentFiles.js";
import { isSealedFile } from "../src/services/fieldCrypto.js";
import { resolveDefaultStorageDir } from "../src/services/paths.js";

// Joint bank and investment accounts, offset accounts, insurance, estate
// papers, the income and spending report, and encrypted document files.

const agent = request.agent(app);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const net = async (entityId: string) => (await agent.get(`/api/net-worth/preview?entityId=${entityId}`)).body.netPosition as number;

describe("findTransfers", () => {
  const t = (id: string, accountId: string, date: string, amount: number) => ({ id, accountId, date: d(date), amount });

  it("pairs money out of one account with the same amount into another within three days", () => {
    const pairs = findTransfers([t("out", "a", "2026-05-01", -1000), t("in", "b", "2026-05-03", 1000), t("pay", "a", "2026-05-02", 5000)]);
    expect([...pairs].sort()).toEqual(["in", "out"]);
  });

  it("leaves alone a match in the same account, or too far apart", () => {
    expect(findTransfers([t("out", "a", "2026-05-01", -1000), t("in", "a", "2026-05-01", 1000)]).size).toBe(0);
    expect(findTransfers([t("out", "a", "2026-05-01", -1000), t("in", "b", "2026-05-06", 1000)]).size).toBe(0);
  });

  it("pairs each transaction only once", () => {
    const pairs = findTransfers([t("o1", "a", "2026-05-01", -50), t("o2", "a", "2026-05-01", -50), t("i1", "b", "2026-05-01", 50)]);
    expect(pairs.size).toBe(2);
  });
});

describe("the gap batch", () => {
  let alex: { id: string; entityId: string };
  let sam: { id: string; entityId: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "gap batch passcode" })).status).toBe(201);
    const person = async (name: string) => (await agent.get(`/api/people/${(await post("/people", { name })).id}`)).body;
    alex = await person("Alex Joint");
    sam = await person("Sam Joint");
  });

  it("splits a joint bank account between its owners and keeps the number encrypted", async () => {
    const [a0, s0] = [await net(alex.entityId), await net(sam.entityId)];
    const account = await post("/banking/accounts", {
      institution: "Bank",
      accountName: "Joint savings",
      accountType: "SAVINGS",
      accountNumber: "12345678",
      entityId: alex.entityId,
      currentBalance: 10_000,
      owners: [
        { entityId: alex.entityId, percent: 60 },
        { entityId: sam.entityId, percent: 40 },
      ],
    });
    expect((await net(alex.entityId)) - a0).toBeCloseTo(6_000);
    expect((await net(sam.entityId)) - s0).toBeCloseTo(4_000);

    const [raw] = await prisma.$queryRaw<Array<{ accountNumber: string }>>`SELECT accountNumber FROM Account WHERE id = ${account.id}`;
    expect(raw.accountNumber).not.toContain("12345678");
    const detail = (await agent.get(`/api/banking/accounts/${account.id}`)).body;
    expect(detail.accountNumber).toBeUndefined();
    expect(detail.accountNumberMasked).toBe("•••• 678");
    expect((await agent.get(`/api/banking/accounts/${account.id}/account-number`)).body.accountNumber).toBe("12345678");
  });

  it("adds a co-owner to an investment account afterwards", async () => {
    const acct = await post("/investments", { accountRef: "Joint shares", institution: "Broker", accountType: "SHARES", entityId: alex.entityId });
    const res = await agent.post(`/api/investments/${acct.id}/ownerships`).send({ ownerEntityId: sam.entityId, ownershipPercent: 50 });
    expect(res.status).toBe(201);
    const detail = (await agent.get(`/api/investments/${acct.id}`)).body;
    expect(detail.ownerships.map((o: { ownerEntityId: string }) => o.ownerEntityId)).toEqual([sam.entityId]);
    // A second share that would take it past 100% is refused.
    expect((await agent.post(`/api/investments/${acct.id}/ownerships`).send({ ownerEntityId: alex.entityId, ownershipPercent: 60 })).status).toBe(400);
  });

  it("shows each owner's share in the broker's assets-and-liabilities statement", async () => {
    const csv = await assetsLiabilitiesCsv(sam.entityId);
    const line = csv.split("\n").find((l) => l.includes("Joint savings"))!;
    expect(line).toContain("40%");
    expect(line).toContain("4000.00");
    expect(line).toContain("10000");
  });

  it("counts an offset account against its loan", async () => {
    const loan = await post("/liabilities", { name: "Offset home loan", liabilityType: "HOME_LOAN", entityId: alex.entityId, currentBalance: 500_000, interestRate: 6 });
    await post("/banking/accounts", {
      institution: "Bank",
      accountName: "Offset",
      accountType: "OFFSET",
      entityId: alex.entityId,
      currentBalance: 50_000,
      offsetForLiabilityId: loan.id,
    });
    const summary = (await agent.get("/api/reports/debt-summary")).body;
    const row = summary.rows.find((r: { id: string }) => r.id === loan.id);
    expect(row.offsetBalance).toBe(50_000);
    expect(row.netOfOffset).toBe(450_000);
    expect(row.interestSavedPerYear).toBeCloseTo(3_000);
    const detail = (await agent.get(`/api/liabilities/${loan.id}`)).body;
    expect(detail.offsetAccounts.map((a: { accountName: string }) => a.accountName)).toEqual(["Offset"]);
  });

  it("keeps insurance policies with an encrypted number, and puts renewals in the calendar", async () => {
    expect((await agent.post("/api/insurance").send({ kind: "LIFE" })).status).toBe(400);
    const policy = await post("/insurance", {
      kind: "LIFE",
      insurer: "TAL",
      policyNumber: "POL-998877",
      coverAmount: 1_000_000,
      premium: 120,
      premiumFrequency: "MONTHLY",
      renewalDate: d("2027-03-01").toISOString(),
      personId: alex.id,
      entityId: alex.entityId,
    });
    expect(policy.policyNumber).toBeUndefined();
    expect(policy.policyNumberMasked).toBe("•••• 877");
    const [raw] = await prisma.$queryRaw<Array<{ policyNumber: string }>>`SELECT policyNumber FROM InsurancePolicy WHERE id = ${policy.id}`;
    expect(raw.policyNumber).not.toContain("998877");
    expect((await agent.get(`/api/insurance/${policy.id}/reveal`)).body.policyNumber).toBe("POL-998877");
    expect((await agent.get(`/api/insurance?personId=${alex.id}`)).body.map((p: { id: string }) => p.id)).toEqual([policy.id]);

    const events = (await agent.get("/api/calendar?from=2027-01-01&to=2027-12-31")).body as Array<{ id: string; category: string; route: string }>;
    const renewal = events.find((e) => e.id === `policy-${policy.id}`);
    expect(renewal?.category).toBe("INSURANCE");
    expect(renewal?.route).toBe(`/insurance/${policy.id}`);

    const tree = (await agent.get("/api/tree")).body;
    const me = tree.people.find((p: { id: string }) => p.id === alex.id);
    expect(me.ownPolicies.some((n: { route: string }) => n.route === `/insurance/${policy.id}`)).toBe(true);

    expect((await agent.delete(`/api/insurance/${policy.id}`)).status).toBe(204);
    expect((await agent.get(`/api/insurance/${policy.id}`)).status).toBe(404);
  });

  it("sets a lapsing death benefit nomination to lapse three years after signing", async () => {
    const paper = await post("/estate", { personId: alex.id, kind: "BDBN_LAPSING", signedDate: d("2025-06-10").toISOString(), heldBy: "AustralianSuper" });
    expect(paper.expiryDate.slice(0, 10)).toBe("2028-06-10");
    const will = await post("/estate", { personId: alex.id, kind: "WILL", signedDate: d("2020-01-01").toISOString(), reviewDate: d("2027-01-01").toISOString() });
    expect(will.expiryDate).toBeNull();

    const events = (await agent.get("/api/calendar?from=2026-10-01&to=2028-12-31")).body as Array<{ id: string; category: string }>;
    expect(events.find((e) => e.id === `estate-expiry-${paper.id}`)?.category).toBe("ESTATE");
    expect(events.find((e) => e.id === `estate-review-${will.id}`)?.category).toBe("ESTATE");
    expect((await agent.get(`/api/estate/person/${alex.id}`)).body).toHaveLength(2);
  });

  it("attaches documents to every kind of record the app offers", async () => {
    const upload = await agent.post("/api/documents/upload").attach("file", Buffer.from("scan of a card"), "card-scan.txt");
    expect(upload.status).toBe(201);
    // Each of these is attached to from a page in the app.
    for (const targetType of ["IDENTITY_RECORD", "INSURANCE_POLICY", "ESTATE_DOCUMENT", "MAINTENANCE", "ACCOUNT", "INVESTMENT_ACCOUNT"]) {
      const res = await agent.post(`/api/documents/${upload.body.document.id}/links`).send({ targetType, targetId: "some-record" });
      expect(res.status, targetType).toBe(201);
    }
  });

  it("stores document files encrypted and serves them as they were", async () => {
    const content = Buffer.from("Council rates notice — 2026 — private contents");
    const upload = await agent.post("/api/documents/upload").attach("file", content, "rates.txt");
    expect(upload.status).toBe(201);
    const onDisk = await fs.readFile(upload.body.document.filePath);
    expect(isSealedFile(onDisk)).toBe(true);
    expect(onDisk.includes(Buffer.from("private contents"))).toBe(false);
    const served = await agent.get(`/api/documents/${upload.body.document.id}/file`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(served.status).toBe(200);
    expect(Buffer.compare(served.body as Buffer, content)).toBe(0);
  });

  it("encrypts document files stored before this version", async () => {
    const dir = resolveDefaultStorageDir();
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "legacy-plain.txt");
    await fs.writeFile(filePath, "an old plaintext document");
    const doc = await prisma.document.create({
      data: { originalFilename: "old.txt", storedFilename: "legacy-plain.txt", filePath, mimeType: "text/plain", fileSize: 25, fileHash: "legacy-plain-hash", source: "MANUAL_UPLOAD" },
    });
    // Readable before it's sealed…
    expect((await agent.get(`/api/documents/${doc.id}/file`)).text).toBe("an old plaintext document");
    await encryptStoredDocuments();
    expect(isSealedFile(await fs.readFile(filePath))).toBe(true);
    // …and after.
    expect((await agent.get(`/api/documents/${doc.id}/file`)).text).toBe("an old plaintext document");
  });

  it("says plainly when a file was sealed under a key that's gone", async () => {
    const dir = resolveDefaultStorageDir();
    const filePath = path.join(dir, "sealed-elsewhere.bin");
    await fs.writeFile(filePath, Buffer.concat([Buffer.from("FVAULT\x01\x00", "latin1"), Buffer.alloc(60, 7)]));
    const doc = await prisma.document.create({
      data: { originalFilename: "lost.pdf", storedFilename: "sealed-elsewhere.bin", filePath, mimeType: "application/pdf", fileSize: 68, fileHash: "sealed-elsewhere-hash", source: "MANUAL_UPLOAD" },
    });
    const res = await agent.get(`/api/documents/${doc.id}/file`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/passcode that has since been reset/);
  });

  it("adds up money in and out by month, leaving out transfers between accounts", async () => {
    const everyday = await post("/banking/accounts", { institution: "Bank", accountName: "Everyday", accountType: "TRANSACTION", entityId: sam.entityId });
    const saver = await post("/banking/accounts", { institution: "Bank", accountName: "Saver", accountType: "SAVINGS", entityId: sam.entityId });
    const txn = (accountId: string, date: string, amount: number, description: string) =>
      post(`/banking/accounts/${accountId}/transactions`, { date: d(date).toISOString(), amount, description });
    await txn(everyday.id, "2026-07-15", 6_000, "Salary");
    await txn(everyday.id, "2026-07-20", -2_500, "Groceries and bills");
    await txn(everyday.id, "2026-07-21", -1_000, "To saver");
    await txn(saver.id, "2026-07-22", 1_000, "From everyday");
    await txn(everyday.id, "2026-08-15", 6_000, "Salary");
    await txn(everyday.id, "2026-08-20", -3_500, "Groceries and bills");

    const report = await incomeAndSpending({ months: 3, entityId: sam.entityId, today: d("2026-09-10") });
    expect(report.months.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(report.months[1]).toMatchObject({ moneyIn: 6_000, moneyOut: 2_500 });
    expect(report.transfersLeftOut).toBe(2);
    // Averaged over July and August — June has nothing on record.
    expect(report.monthsCovered).toBe(2);
    expect(report.averageMonthlyIn).toBe(6_000);
    expect(report.averageMonthlyOut).toBe(3_000);

    const res = await agent.get(`/api/reports/income-spending?months=12&entityId=${sam.entityId}`);
    expect(res.status).toBe(200);
    expect(res.body.months).toHaveLength(12);
  });
});
