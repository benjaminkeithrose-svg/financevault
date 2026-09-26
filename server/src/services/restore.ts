import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { relinkMovedDocuments, resolveDbPath, resolveDefaultStorageDir, SERVER_ROOT } from "./paths.js";

/**
 * Loading a full backup (Settings → Download full backup) into a fresh copy
 * of Financial Vault — a new computer, or a new version unzipped somewhere
 * else. Only offered before a passcode is set, so it can never overwrite
 * records someone is using. The fresh copy's own database is set aside, not
 * deleted; an older backup is brought up to this version's layout; documents
 * go into this copy's storage folder and are linked up to their records.
 */

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err || !zip ? reject(err) : resolve(zip)))
  );
}

function entries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const out: yauzl.Entry[] = [];
    zip.on("entry", (e: yauzl.Entry) => {
      out.push(e);
      zip.readEntry();
    });
    zip.on("end", () => resolve(out));
    zip.on("error", reject);
    zip.readEntry();
  });
}

async function extract(zip: yauzl.ZipFile, entry: yauzl.Entry, to: string) {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
    zip.openReadStream(entry, (err, s) => (err || !s ? reject(err) : resolve(s)))
  );
  await pipeline(stream, fs.createWriteStream(to));
}

function migrate(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["prisma", "migrate", "deploy"],
      { cwd: SERVER_ROOT, env: process.env, shell: process.platform === "win32" },
      (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve())
    );
  });
}

export async function restoreFromBackup(zipFile: string): Promise<{ people: number; documents: number }> {
  if (await prisma.vault.findUnique({ where: { id: 1 } })) {
    throw new HttpError(409, "This copy already has a passcode and records, so a backup can't be loaded over it.");
  }

  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(zipFile);
  } catch {
    throw new HttpError(400, "That file isn't a Financial Vault backup (it couldn't be opened as a ZIP file).");
  }
  const tmpDb = path.join(os.tmpdir(), `financevault-restore-${Date.now()}.db`);
  const dbPath = resolveDbPath();
  const setAside = `${dbPath}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  let swapped = false;

  try {
    const list = await entries(zip);
    const dbEntry = list.find((e) => e.fileName === "database/financevault.db");
    if (!dbEntry) throw new HttpError(400, "That ZIP file isn't a Financial Vault backup — it has no database in it.");
    await extract(zip, dbEntry, tmpDb);
    const head = Buffer.alloc(SQLITE_HEADER.length);
    const fd = fs.openSync(tmpDb, "r");
    fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    if (!head.equals(SQLITE_HEADER)) throw new HttpError(400, "The database inside that backup is damaged or isn't a Financial Vault database.");

    // Swap the database files, keeping this copy's own aside.
    await prisma.$disconnect();
    if (fs.existsSync(dbPath)) fs.renameSync(dbPath, setAside);
    for (const extra of ["-journal", "-wal", "-shm"]) fs.rmSync(`${dbPath}${extra}`, { force: true });
    fs.copyFileSync(tmpDb, dbPath);
    swapped = true;

    // An older backup gets this version's additions; nothing is removed.
    await migrate();
    await prisma.$connect();
    if (!(await prisma.vault.findUnique({ where: { id: 1 } }))) {
      throw new HttpError(400, "That backup has no passcode set, so it can't be opened. Nothing was changed.");
    }

    // Documents into this copy's storage folder.
    const storage = resolveDefaultStorageDir();
    fs.mkdirSync(storage, { recursive: true });
    let documents = 0;
    for (const e of list) {
      if (!e.fileName.startsWith("documents/") || e.fileName.endsWith("/")) continue;
      const name = path.basename(e.fileName);
      const target = path.join(storage, name);
      if (!fs.existsSync(target)) await extract(zip, e, target);
      documents += 1;
    }

    // A storage folder chosen on the old computer may not exist here.
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings?.customStorageDir && !fs.existsSync(settings.customStorageDir)) {
      await prisma.settings.update({ where: { id: 1 }, data: { customStorageDir: null } });
    }
    await relinkMovedDocuments();
    return { people: await prisma.person.count(), documents };
  } catch (err) {
    if (swapped) {
      // Put this copy's own database back exactly as it was.
      await prisma.$disconnect().catch(() => {});
      fs.rmSync(dbPath, { force: true });
      if (fs.existsSync(setAside)) fs.renameSync(setAside, dbPath);
      await prisma.$connect().catch(() => {});
    }
    throw err;
  } finally {
    zip.close();
    fs.rmSync(tmpDb, { force: true });
  }
}
