import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { planCopies, safeName, syncMirror } from "../src/services/mirror.js";

// Readable copies of documents in folders that follow the asset tree.

describe("folder names", () => {
  it("are safe on Windows, Mac and OneDrive", () => {
    expect(safeName('5/7 Smith St: "Unit"?')).toBe("5 7 Smith St Unit");
    expect(safeName("CON")).toBe("CON_");
    expect(safeName("Trailing dots...")).toBe("Trailing dots");
    expect(safeName("")).toBe("Untitled");
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fv-readable-"));
  const at = (...parts: string[]) => path.join(root, ...parts);
  async function post(p: string, body: unknown) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  async function upload(text: string, name: string) {
    return (await agent.post("/api/documents/upload").attach("file", Buffer.from(text), { filename: name, contentType: "text/plain" })).body.document;
  }

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "readable copies test passcode" })).status).toBe(201);
  });

  it("is off until a folder is chosen (outside the launcher), and checks the folder", async () => {
    expect((await agent.get("/api/mirror").expect(200)).body).toMatchObject({ folder: null, enabled: false });
    await agent.put("/api/mirror").send({ folder: "relative/folder" }).expect(400);
    const s = (await agent.put("/api/mirror").send({ folder: root, enabled: true }).expect(200)).body;
    expect(s).toMatchObject({ folder: root, enabled: true, custom: true });
  });

  it("puts each document in its owner / asset / year folder, readable, with an index", async () => {
    const created = await post("/people", { name: "Robin Mirror" });
    const robin = (await agent.get(`/api/people/${created.id}`)).body;
    const home = await post("/properties", { name: "9 Copy St", address: "9 Copy St, Sydney NSW", state: "NSW", entityId: robin.entityId, currentValue: 800_000 });
    const loan = await post("/liabilities", { name: "CBA home loan", liabilityType: "HOME_LOAN", entityId: robin.entityId, currentBalance: 400_000, securityPropertyId: home.id });

    const rates = await upload("Council rates notice for 9 Copy St, readable", "rates-scan-001.txt");
    await agent.put(`/api/documents/${rates.id}`).send({ documentType: "Council Rates", documentDate: "2025-08-14T00:00:00.000Z", financialYearLabel: "2025-26" }).expect(200);
    await post(`/documents/${rates.id}/links`, { targetType: "PROPERTY", targetId: home.id });

    const statement = await upload("Loan statement for the CBA home loan", "loan-stmt.txt");
    await agent.put(`/api/documents/${statement.id}`).send({ documentType: "Loan Statement", documentDate: "2026-06-30T00:00:00.000Z" }).expect(200);
    await post(`/documents/${statement.id}/links`, { targetType: "LIABILITY", targetId: loan.id });

    const loose = await upload("Something not filed anywhere yet", "mystery.txt");

    const result = await syncMirror();
    expect(result).toMatchObject({ problems: [] });
    const ratesFile = at("Robin Mirror", "Properties", "9 Copy St", "2025-26", "Council Rates – 14 Aug 2025.txt");
    expect(fs.readFileSync(ratesFile, "utf8")).toBe("Council rates notice for 9 Copy St, readable");
    expect(fs.existsSync(at("Robin Mirror", "Properties", "9 Copy St", "Loan – CBA home loan", "2025-26", "Loan Statement – 30 Jun 2026.txt"))).toBe(true);
    expect(fs.existsSync(at("Not filed yet", "mystery.txt"))).toBe(true);
    const index = fs.readFileSync(at("Robin Mirror", "Properties", "9 Copy St", "2025-26", "_Index.csv"), "utf8");
    expect(index).toContain("Council Rates – 14 Aug 2025.txt,Council Rates,2025-08-14,2025-26,rates-scan-001.txt");
    expect(fs.existsSync(at("READ ME.txt"))).toBe(true);
    expect(fs.readdirSync(at("Records backups")).some((n) => /^financevault-records-\d{4}-\d{2}-\d{2}\.db$/.test(n))).toBe(true);

    // Filed later: it moves out of "Not filed yet".
    await agent.put(`/api/documents/${loose.id}`).send({ entityId: robin.entityId }).expect(200);
    await syncMirror();
    expect(fs.existsSync(at("Not filed yet", "mystery.txt"))).toBe(false);
    expect(fs.existsSync(at("Not filed yet"))).toBe(false);
    expect(fs.existsSync(at("Robin Mirror", "mystery.txt"))).toBe(true);
  });

  it("follows renames and deletions, and never touches files you added", async () => {
    const home = (await agent.get("/api/properties")).body.find((p: { asset?: { name: string } }) => p.asset?.name === "9 Copy St");
    fs.writeFileSync(at("Robin Mirror", "Properties", "9 Copy St", "2025-26", "my own notes.txt"), "mine");
    await agent.put(`/api/assets/${home.assetId}`).send({ name: "9 Copy Street" }).expect(200);
    await syncMirror();
    expect(fs.existsSync(at("Robin Mirror", "Properties", "9 Copy Street", "2025-26", "Council Rates – 14 Aug 2025.txt"))).toBe(true);
    // The old folder keeps only the file you put there.
    expect(fs.readdirSync(at("Robin Mirror", "Properties", "9 Copy St", "2025-26"))).toEqual(["my own notes.txt"]);

    const plan = await planCopies();
    const rates = plan.find((p) => p.rel.includes("Council Rates"))!;
    await agent.delete(`/api/documents/${rates.documentId}`).expect(204);
    await syncMirror();
    expect(fs.existsSync(at("Robin Mirror", "Properties", "9 Copy Street", "2025-26", "Council Rates – 14 Aug 2025.txt"))).toBe(false);
  });

  it("never copies identity documents", async () => {
    const person = (await agent.get("/api/people")).body.find((p: { name: string }) => p.name === "Robin Mirror");
    const id = await post("/identity", { personId: person.id, kind: "PASSPORT", label: "Passport" });
    const scan = await upload("Passport scan", "passport.txt");
    await post(`/documents/${scan.id}/links`, { targetType: "IDENTITY_RECORD", targetId: id.id });
    expect((await planCopies()).some((p) => p.documentId === scan.id)).toBe(false);
  });

  it("does nothing while locked", async () => {
    await agent.post("/api/vault/lock").expect(200);
    expect(await syncMirror()).toBeNull();
  });
});
