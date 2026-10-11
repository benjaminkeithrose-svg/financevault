import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { readStatement } from "../src/services/pdfStatement.js";

// PDF bank statements → transactions: read by column position and checked
// against the balances printed; previewed, then brought in with duplicates
// skipped. Every PDF's layout is recorded without its contents, and can be
// sent to the owner's own private GitHub repository.
//
// The statements in fixtures/statements are made up (make-statements.mjs).

const FIX = path.join(__dirname, "fixtures", "statements");
const pdf = (name: string) => fs.readFileSync(path.join(FIX, `${name}.pdf`));
const sum = (xs: Array<{ amount: number }>) => Math.round(xs.reduce((s, t) => s + t.amount, 0) * 100) / 100;

describe("reading PDF statements", () => {
  it.each([
    ["westpac", "TRANSACTION", "Westpac", 46, 17191.94, "2023-01-01"],
    ["westpac-tight", "TRANSACTION", "Westpac", 46, 17191.94, "2023-01-01"],
    ["stgeorge", "TRANSACTION", "St.George", 40, 20201.4, "2023-12-15"],
    ["macquarie", "TRANSACTION", "Macquarie", 24, 2807.41, "2022-07-01"],
    ["card", "CREDIT_CARD", "Bendigo Bank", 18, -467.22, "2024-02-03"],
  ])("%s: every transaction, adding up", (name, accountType, bank, count, total, first) => {
    const r = readStatement(pdf(name), { accountType });
    expect(r.status).toBe("ADDS_UP");
    expect(r.bank).toBe(bank);
    expect(r.transactions).toHaveLength(count);
    expect(sum(r.transactions)).toBeCloseTo(total, 2);
    expect(r.transactions[0].date.toISOString().slice(0, 10)).toBe(first);
    expect(r.problems).toEqual([]);
  });

  it("reads across a year end, wrapped descriptions and dates on only the first transaction of the day", () => {
    const r = readStatement(pdf("stgeorge"));
    expect(r.transactions[0]).toMatchObject({ description: "DEPOSIT SALARY ACME PTY LTD", amount: 2807.09 });
    expect(r.transactions.at(-1)!.date.toISOString().slice(0, 10)).toBe("2024-01-03");
    expect(r.layout.datesOnEveryRow).toBe(false);
    const w = readStatement(pdf("westpac"));
    expect(w.transactions.some((t) => t.description === "DIRECT DEBIT ST MARYS SCHOOL FEES TERM PAYMENT")).toBe(true);
  });

  it("a credit card's spending is money out, payments money in", () => {
    const r = readStatement(pdf("card"), { accountType: "CREDIT_CARD" });
    expect(r.transactions[0].amount).toBe(-126.78);
    expect(r.transactions.find((t) => /PAYMENT RECEIVED/.test(t.description))!.amount).toBe(1000);
    expect(r.balanceSense).toBe("owing");
  });

  it("flags a statement that doesn't add up, at the line it goes wrong — once", () => {
    const r = readStatement(pdf("broken"));
    expect(r.status).toBe("DOESNT_ADD_UP");
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ page: 1, line: 12, kind: "BALANCE_MISMATCH" });
    expect(r.message).toMatch(/page 1, line 12/);
  });

  it("says when it's a scan", () => {
    const r = readStatement(pdf("scanned"));
    expect(r.status).toBe("NOT_READ");
    expect(r.scanned).toBe(true);
  });
});

describe("bringing statements in on a bank account", () => {
  const agent = request.agent(app);
  const post = async (p: string, body: unknown, status = 201) => {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status !== status) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const read = async (accountId: string, ...names: string[]) => {
    let req = agent.post("/api/statement-import/read").field("accountId", accountId);
    for (const n of names) req = req.attach("files", pdf(n), { filename: `${n}.pdf`, contentType: "application/pdf" });
    const res = await req;
    if (res.status !== 200) throw new Error(`read -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let entityId = "";
  let everyday = "";
  let gh: http.Server;
  const received: Array<{ method: string; url: string; body: string }> = [];
  let repoPrivate = true;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "statement import test" })).status).toBe(201);
    const person = await post("/people", { name: "Statement Sam" });
    entityId = (await agent.get(`/api/people/${person.id}`)).body.entityId;
    everyday = (
      await post("/banking/accounts", {
        institution: "Westpac",
        accountName: "Choice",
        accountType: "TRANSACTION",
        accountNumber: "123456",
        bsb: "032-000",
        entityId,
      })
    ).id;

    // A stand-in for GitHub.
    gh = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ method: req.method!, url: req.url!, body });
        res.setHeader("content-type", "application/json");
        if (req.headers.authorization !== "Bearer test-key") return res.writeHead(401).end("{}");
        if (req.method === "GET" && req.url === "/repos/sam/layouts")
          return res.end(JSON.stringify({ private: repoPrivate, permissions: { push: true } }));
        if (req.method === "PUT" && req.url!.startsWith("/repos/sam/layouts/contents/layouts/")) return res.writeHead(201).end("{}");
        res.writeHead(404).end("{}");
      });
    });
    await new Promise<void>((r) => gh.listen(0, "127.0.0.1", r));
    process.env.FV_GITHUB_API = `http://127.0.0.1:${(gh.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    gh?.close();
    delete process.env.FV_GITHUB_API;
  });

  it("previews before saving anything, and suggests only the ones that add up", async () => {
    const before = await prisma.transaction.count({ where: { accountId: everyday } });
    const r = await read(everyday, "broken", "westpac");
    expect(await prisma.transaction.count({ where: { accountId: everyday } })).toBe(before);
    const [westpac, broken] = r.statements; // in date order
    expect(westpac).toMatchObject({
      filename: "westpac.pdf",
      status: "ADDS_UP",
      count: 46,
      newCount: 46,
      duplicates: 0,
      suggested: true,
      otherAccount: false,
    });
    expect(broken).toMatchObject({ filename: "broken.pdf", status: "DOESNT_ADD_UP", suggested: false });
    expect(broken.problems[0]).toMatchObject({ page: 1, line: 12 });
  });

  it("brings in the ticked ones, files the PDF under the account, and never adds a transaction twice", async () => {
    const r = await read(everyday, "westpac");
    const done = await post("/statement-import/commit", { batchId: r.batchId, keys: [r.statements[0].key] }, 200);
    expect(done).toEqual({ statements: 1, imported: 46, duplicates: 0 });
    const txns = await prisma.transaction.findMany({ where: { accountId: everyday }, orderBy: { date: "asc" } });
    expect(txns).toHaveLength(46);
    expect(sum(txns)).toBeCloseTo(17191.94, 2);
    expect(txns[0].documentId).toBeTruthy();
    expect(await prisma.documentLink.count({ where: { documentId: txns[0].documentId!, targetType: "ACCOUNT", targetId: everyday } })).toBe(
      1,
    );
    expect(txns[0].financialYearId).toBeTruthy();
    // Filed as a bank statement, though its transactions mention health insurance.
    expect((await prisma.document.findUnique({ where: { id: txns[0].documentId! } }))!.documentType).toBe("Bank Statement");
    await new Promise((r) => setTimeout(r, 300)); // the background layout record from filing it
    expect((await prisma.layoutRecord.findMany({ where: { issuer: "Westpac", result: "ADDS_UP" } })).map((x) => x.kind)).toEqual([
      "Bank Statement",
    ]);

    // The same statement again: nothing new, and it says it's been read.
    const again = await read(everyday, "westpac");
    expect(again.statements[0]).toMatchObject({ newCount: 0, duplicates: 46, alreadyRead: true, suggested: false });

    // Already in Documents: listed to read from there.
    const filed = (await agent.get(`/api/statement-import/filed?accountId=${everyday}`)).body;
    expect(filed).toEqual([expect.objectContaining({ name: "westpac.pdf", filedHere: true, alreadyRead: true })]);
  });

  it("skips what came in from the bank's CSV on the same day for the same amount", async () => {
    const savings = (
      await post("/banking/accounts", { institution: "Macquarie", accountName: "Savings", accountType: "SAVINGS", entityId })
    ).id;
    await post(`/banking/accounts/${savings}/transactions`, {
      date: "2022-07-01T00:00:00.000Z",
      description: "NETFLIX.COM",
      amount: -216.73,
    });
    const r = await read(savings, "macquarie");
    expect(r.statements[0]).toMatchObject({ count: 24, newCount: 23, duplicates: 1 });
    const done = await post("/statement-import/commit", { batchId: r.batchId, keys: [r.statements[0].key] }, 200);
    expect(done.imported).toBe(23);
    expect(await prisma.transaction.count({ where: { accountId: savings } })).toBe(24);
  });

  it("warns when a statement may be another account's", async () => {
    const card = (
      await post("/banking/accounts", {
        institution: "Bendigo",
        accountName: "Card",
        accountType: "CREDIT_CARD",
        accountNumber: "4564 1111 2222 1234",
        entityId,
      })
    ).id;
    const r = await read(card, "card");
    expect(r.statements[0]).toMatchObject({ status: "ADDS_UP", otherAccount: true, suggested: false });
  });

  it("records each PDF's layout without its contents", async () => {
    const list = (await agent.get("/api/layout-records")).body;
    const westpac = list.records.find((x: { issuer: string; result: string }) => x.issuer === "Westpac" && x.result === "ADDS_UP");
    expect(westpac).toMatchObject({ kind: "Bank Statement", pages: 2, textLayer: true });
    expect(westpac.layout.headings.map((h: { kind: string }) => h.kind)).toEqual(["date", "description", "debit", "credit", "balance"]);
    expect(westpac.layout.dateFormats).toEqual(["DD/MM/YY"]);
    const everything = JSON.stringify(list.records);
    for (const secret of ["WOOLWORTHS", "CITIZEN", "2,812.29", "2812.29", "123456", "3456", "fileHash"])
      expect(everything).not.toContain(secret);
    expect(list.share).toMatchObject({ on: false, hasKey: false });
  });

  it("sends the records to a private repository only, once set up", async () => {
    // Not set up: can't be switched on.
    expect((await agent.put("/api/layout-records/share").send({ on: true })).status).toBe(400);
    let status = (
      await agent.put("/api/layout-records/share").send({ repo: "https://github.com/sam/layouts", token: "test-key", on: true })
    ).body;
    expect(status).toMatchObject({ on: true, repo: "sam/layouts", hasKey: true });
    // The key is stored encrypted, and never comes back from the app.
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings!.layoutShareToken).not.toContain("test-key");
    expect(JSON.stringify((await agent.get("/api/settings")).body)).not.toContain("layoutShareToken");
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain("test-key");

    // A public repository: nothing is sent.
    repoPrivate = false;
    let sent = (await agent.post("/api/layout-records/share/send")).body;
    expect(sent).toMatchObject({ sent: 0, error: expect.stringMatching(/public/) });
    expect(received.filter((r) => r.method === "PUT")).toHaveLength(0);

    repoPrivate = true;
    expect((await agent.post("/api/layout-records/share/check")).body).toMatchObject({ ok: true });
    sent = (await agent.post("/api/layout-records/share/send")).body;
    const total = await prisma.layoutRecord.count();
    expect(sent).toMatchObject({ sent: total, error: null });
    expect(sent.share.unsent).toBe(0);
    const puts = received.filter((r) => r.method === "PUT");
    expect(puts).toHaveLength(total);
    const bodies = puts.map((p) => Buffer.from(JSON.parse(p.body).content, "base64").toString("utf8")).join("\n");
    for (const secret of ["WOOLWORTHS", "2,812.29", "fileHash", "123456"]) expect(bodies).not.toContain(secret);
    expect(bodies).toContain('"kind": "Bank Statement"');

    // Nothing new: nothing sent again.
    sent = (await agent.post("/api/layout-records/share/send")).body;
    expect(sent.sent).toBe(0);
    status = (await agent.put("/api/layout-records/share").send({ on: false })).body;
    expect(status.on).toBe(false);
  });
});
