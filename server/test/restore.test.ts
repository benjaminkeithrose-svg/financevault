import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Restoring a full backup into a fresh copy (a new computer, or a new
// version unzipped elsewhere): only before a passcode is set, records and
// the passcode come back, and a bad file changes nothing.

const agent = request.agent(app);
const backupFile = path.join(os.tmpdir(), `fv-restore-test-${Date.now()}.zip`);

describe("restore from a backup", () => {
  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "restore test passcode" })).status).toBe(201);
    await agent.post("/api/people").send({ name: "Restored Person" });
    const res = await agent.get("/api/backup").buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    fs.writeFileSync(backupFile, res.body as Buffer);
  }, 60_000);

  it("remembers when the last backup was taken", async () => {
    const dash = (await agent.get("/api/dashboard")).body;
    expect(dash.backup.lastBackupAt).toBeTruthy();
  });

  it("refuses to load a backup over a copy that already has a passcode", async () => {
    const res = await request(app).post("/api/vault/restore").attach("backup", backupFile);
    expect(res.status).toBe(409);
  });

  it("refuses a file that isn't a backup, and changes nothing", async () => {
    await prisma.person.deleteMany({ where: { name: "Only In Fresh Copy" } });
    await prisma.vault.deleteMany();
    await prisma.person.create({ data: { name: "Only In Fresh Copy" } });
    const junk = path.join(os.tmpdir(), `fv-not-a-backup-${Date.now()}.zip`);
    fs.writeFileSync(junk, "not a zip");
    const res = await request(app).post("/api/vault/restore").attach("backup", junk);
    expect(res.status).toBe(400);
    expect(await prisma.person.count({ where: { name: "Only In Fresh Copy" } })).toBe(1);
  });

  it("loads the backup into a fresh copy: records and passcode come back", async () => {
    const res = await request(app).post("/api/vault/restore").attach("backup", backupFile);
    expect(res.status).toBe(200);
    expect(res.body.people).toBeGreaterThan(0);
    // The fresh copy's own record was set aside, the backup's is in place.
    expect(await prisma.person.count({ where: { name: "Only In Fresh Copy" } })).toBe(0);
    expect(await prisma.person.count({ where: { name: "Restored Person" } })).toBe(1);
    const unlock = await request(app).post("/api/vault/unlock").send({ passcode: "restore test passcode" });
    expect(unlock.status).toBe(200);
  }, 120_000);
});
