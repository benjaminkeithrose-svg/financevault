import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const agent = request.agent(app);

beforeAll(async () => {
  await prisma.vault.deleteMany();
  await prisma.person.deleteMany();
});

describe("network boundary", () => {
  it("refuses requests addressed to another hostname (DNS rebinding)", async () => {
    const res = await request(app).get("/api/health").set("Host", "attacker.example:4000");
    expect(res.status).toBe(403);
  });

  it("sends no CORS header, so other websites can't read responses", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses writes coming from another website", async () => {
    const res = await request(app)
      .post("/api/vault/unlock")
      .set("Origin", "https://evil.example")
      .send({ passcode: "anything at all" });
    expect(res.status).toBe(403);
  });

  it("can't be framed by another site", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("lock gate", () => {
  it("answers nothing while locked", async () => {
    expect((await agent.get("/api/entities")).status).toBe(401);
    expect((await agent.get("/api/backup")).status).toBe(401);
  });

  it("issues a session cookie that scripts can't read and other sites can't send", async () => {
    const res = await agent.post("/api/vault/setup").send({ passcode: "correct horse battery" });
    expect(res.status).toBe(201);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it("serves the API once unlocked", async () => {
    expect((await agent.get("/api/entities")).status).toBe(200);
  });
});

describe("tax file numbers over the API", () => {
  let personId = "";

  it("rejects a mistyped TFN", async () => {
    const res = await agent.post("/api/people").send({ name: "Ben", tfn: "123 456 789" });
    expect(res.status).toBe(400);
  });

  it("stores a valid one and returns only the masked form", async () => {
    const res = await agent.post("/api/people").send({ name: "Ben", tfn: "123 456 782" });
    expect(res.status).toBe(201);
    personId = res.body.id;
    expect(res.body.tfnMasked).toBe("••• ••• 782");
    expect(res.body).not.toHaveProperty("tfn");
    expect(JSON.stringify(res.body)).not.toMatch(/123456782|enc:v1/);
  });

  it("keeps it out of list and detail responses", async () => {
    const list = JSON.stringify((await agent.get("/api/people")).body);
    const detail = JSON.stringify((await agent.get(`/api/people/${personId}`)).body);
    for (const body of [list, detail]) expect(body).not.toMatch(/123456782|enc:v1/);
  });

  it("reveals the full number on request, and audits it", async () => {
    const res = await agent.get(`/api/people/${personId}/tfn`);
    expect(res.body.tfn).toBe("123 456 782");
    expect(await prisma.auditLog.count({ where: { action: "TFN_REVEALED", targetId: personId } })).toBe(1);
  });

  it("never writes the number into the audit log", async () => {
    await agent.put(`/api/people/${personId}`).send({ tfn: "876 543 210" });
    const entries = await prisma.auditLog.findMany({ where: { targetId: personId } });
    expect(JSON.stringify(entries)).not.toMatch(/123456782|876543210|123 456 782|876 543 210/);
  });

  it("clears it when blanked", async () => {
    const res = await agent.put(`/api/people/${personId}`).send({ tfn: "" });
    expect(res.body.hasTfn).toBe(false);
  });
});

describe("serving uploaded files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-files-"));

  async function makeDoc(name: string, mimeType: string, body: string) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, body);
    return prisma.document.create({
      data: {
        originalFilename: name,
        storedFilename: name,
        filePath,
        mimeType,
        fileSize: body.length,
        fileHash: `${name}-${Date.now()}-${Math.random()}`,
      },
    });
  }

  it("shows PDFs inline, frameable only by the app itself", async () => {
    const doc = await makeDoc("statement.pdf", "application/pdf", "%PDF-1.4");
    const res = await agent.get(`/api/documents/${doc.id}/file`);
    expect(res.headers["content-disposition"]).toMatch(/^inline/);
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("forces HTML to download in a sandbox, so it can't run as the app", async () => {
    const doc = await makeDoc("statement.html", "text/html", "<script>fetch('/api/entities')</script>");
    const res = await agent.get(`/api/documents/${doc.id}/file`);
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
    expect(res.headers["content-security-policy"]).toMatch(/sandbox/);
  });

  it("does the same for SVG, which is an image that can carry script", async () => {
    const doc = await makeDoc("logo.svg", "image/svg+xml", "<svg onload=\"alert(1)\"/>");
    const res = await agent.get(`/api/documents/${doc.id}/file`);
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
  });
});

describe("locking", () => {
  it("ends the session", async () => {
    await agent.post("/api/vault/lock");
    expect((await agent.get("/api/entities")).status).toBe(401);
  });
});
