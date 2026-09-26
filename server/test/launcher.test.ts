import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
// The launcher is plain JavaScript beside the program; its rules are tested here.
// @ts-expect-error — no type declarations for the launcher's .mjs files
import { compareVersions, layout } from "../../launcher/lib/paths.mjs";
// @ts-expect-error — as above
import { inspectUpdate, keepPreviousVersion, latestNotes, putBackPrevious, replaceProgram } from "../../launcher/lib/update.mjs";
// @ts-expect-error — as above
import { legacyData, moveLegacyData } from "../../launcher/lib/data.mjs";

// Batch 6: the data folder, updates from a ZIP, and putting a version back.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fv-launch-"));
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A small ZIP (stored, no compression) — enough for the launcher's checks. */
function makeZip(file: string, entries: Record<string, string>) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, cd, end]));
}

const program = (version: string, extra: Record<string, string> = {}) => ({
  "financevault/package.json": JSON.stringify({ name: "financevault", version }),
  "financevault/launcher/launch.mjs": "// launcher",
  "financevault/server/package.json": "{}",
  "financevault/server/prisma/schema.prisma": "// schema",
  "financevault/web/package.json": "{}",
  "financevault/RELEASE-NOTES.md": `# Notes\n\n## ${version} — October\n- Something new\n\n## 1.0.0\n- Old\n`,
  ...extra,
});

describe("versions and notes", () => {
  it("compares versions number by number", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
  });
  it("shows only the newest version's notes", () => {
    expect(latestNotes("# x\n\n## 1.1.0\n- a\n\n## 1.0.0\n- b")).toBe("## 1.1.0\n- a");
  });
  it("uses the ZIP reader the server already relies on", () => {
    expect(typeof yauzl.open).toBe("function");
  });
});

describe("checking an update ZIP", () => {
  const dir = tmp();
  it("accepts a newer Financial Vault download and reads what's new", async () => {
    const zip = path.join(dir, "good.zip");
    makeZip(zip, program("1.2.0"));
    expect(await inspectUpdate(zip, "1.0.0")).toEqual({ version: "1.2.0", prefix: "financevault/", notes: "## 1.2.0 — October\n- Something new" });
  });
  it("turns away an older version, something else, or an unsafe ZIP", async () => {
    const older = path.join(dir, "older.zip");
    makeZip(older, program("0.9.0"));
    await expect(inspectUpdate(older, "1.0.0")).rejects.toThrow(/already version 1.0.0/);

    const other = path.join(dir, "other.zip");
    makeZip(other, { "something/package.json": JSON.stringify({ name: "other", version: "9.0.0" }) });
    await expect(inspectUpdate(other, "1.0.0")).rejects.toThrow(/isn't a (complete )?Financial Vault download/);

    const unsafe = path.join(dir, "unsafe.zip");
    makeZip(unsafe, program("2.0.0", { "financevault/../../evil.txt": "x" }));
    await expect(inspectUpdate(unsafe, "1.0.0")).rejects.toThrow(/unsafe/);

    const notZip = path.join(dir, "note.txt");
    fs.writeFileSync(notZip, "hello");
    await expect(inspectUpdate(notZip, "1.0.0")).rejects.toThrow(/isn't a ZIP/);
  });
});

describe("replacing the program, never the data", () => {
  it("swaps program files, keeps libraries and old records, and puts the previous version back", () => {
    const prog = tmp();
    const data = layout(tmp());
    write(path.join(prog, "package.json"), JSON.stringify({ version: "1.0.0" }));
    write(path.join(prog, "server", "src", "old.ts"), "old");
    write(path.join(prog, "server", ".env"), "PORT=4000");
    write(path.join(prog, "server", "prisma", "dev.db"), "records");
    write(path.join(prog, "server", "prisma", "schema.prisma"), "old schema");
    write(path.join(prog, "node_modules", "lib", "index.js"), "lib");

    const next = tmp();
    write(path.join(next, "package.json"), JSON.stringify({ version: "1.1.0" }));
    write(path.join(next, "server", "src", "new.ts"), "new");
    write(path.join(next, "server", "prisma", "schema.prisma"), "new schema");

    keepPreviousVersion(prog, data.previous);
    replaceProgram(prog, next);
    expect(fs.existsSync(path.join(prog, "server", "src", "old.ts"))).toBe(false);
    expect(fs.readFileSync(path.join(prog, "server", "src", "new.ts"), "utf8")).toBe("new");
    expect(fs.readFileSync(path.join(prog, "server", "prisma", "dev.db"), "utf8")).toBe("records");
    expect(fs.existsSync(path.join(prog, "server", ".env"))).toBe(true);
    expect(fs.existsSync(path.join(prog, "node_modules", "lib", "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(data.previous, "node_modules"))).toBe(false);

    expect(putBackPrevious(prog, data)).toBe("1.0.0");
    expect(fs.readFileSync(path.join(prog, "server", "src", "old.ts"), "utf8")).toBe("old");
    expect(fs.existsSync(path.join(prog, "server", "src", "new.ts"))).toBe(false);
    expect(fs.readFileSync(path.join(prog, "server", "prisma", "schema.prisma"), "utf8")).toBe("old schema");
  });
});

describe("moving records into the data folder", () => {
  it("copies the records and documents across and renames the old ones", () => {
    const prog = tmp();
    const data = layout(path.join(tmp(), "Financial Vault Data"));
    write(path.join(prog, "server", "prisma", "dev.db"), "records");
    write(path.join(prog, "server", "storage", "documents", "abc.pdf"), "pdf");
    const legacy = legacyData(prog);
    expect(legacy.hasRecords).toBe(true);
    expect(moveLegacyData(legacy, data)).toBe(1);
    expect(fs.readFileSync(data.db, "utf8")).toBe("records");
    expect(fs.readFileSync(path.join(data.documents, "abc.pdf"), "utf8")).toBe("pdf");
    expect(fs.existsSync(path.join(prog, "server", "prisma", "dev.db"))).toBe(false);
    expect(fs.readdirSync(path.join(prog, "server", "prisma")).some((n) => n.startsWith("dev.db.moved-to-data-folder"))).toBe(true);
  });
});

describe("Settings → Program and updates", () => {
  const agent = request.agent(app);
  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "launcher test passcode" })).status).toBe(201);
  });

  it("shows the version, and explains updates need the launcher", async () => {
    const info = (await agent.get("/api/app/info").expect(200)).body;
    expect(info).toMatchObject({ version: expect.stringMatching(/^\d+\.\d+\.\d+$/), canUpdate: false, dataFolder: null });
    const res = await agent.post("/api/app/update").attach("update", Buffer.from("x"), "update.zip");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Start Financial Vault/);
  });

  it("stages an update in the data folder with a backup first, when run by the launcher", async () => {
    const root = tmp();
    process.env.FV_DATA_DIR = root;
    try {
      const zip = path.join(root, "upload.zip");
      makeZip(zip, program("99.0.0"));
      const res = await agent.post("/api/app/update").attach("update", zip);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ version: "99.0.0", restarting: false });
      expect(fs.existsSync(path.join(root, "Updates", "financevault-99.0.0.zip"))).toBe(true);
      expect(fs.readdirSync(path.join(root, "Backups")).some((n) => n.startsWith("financevault-before-update-to-99.0.0"))).toBe(true);
      await agent.post("/api/app/rollback").expect(400);
    } finally {
      delete process.env.FV_DATA_DIR;
    }
  });

  it("answers the version while locked, for a window waiting on a restart", async () => {
    const res = await request(app).get("/api/app-window/version").expect(200);
    expect(res.body.version).toMatch(/\d/);
  });
});
