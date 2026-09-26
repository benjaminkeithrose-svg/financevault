import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { log } from "./log.mjs";
import { PROGRAM_DIR, stamp } from "./paths.mjs";

/**
 * Before this version, records and documents lived inside the program
 * folder (server/prisma/dev.db and server/storage/documents). They're moved
 * to the data folder once, on the first start: copied across, checked, and
 * the old ones renamed "…moved-to-data-folder" (not deleted) so nothing can
 * use them by mistake. Documents are then found in their new place at start-up.
 */

function readEnvFile(programDir) {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(programDir, "server", ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* no .env */
  }
  return out;
}

/** Where a program folder kept its records and documents (before the data folder). */
export function legacyData(programDir) {
  const env = readEnvFile(programDir);
  const dbRaw = (env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
  const db = path.isAbsolute(dbRaw) ? dbRaw : path.join(programDir, "server", "prisma", dbRaw.replace(/^\.\//, ""));
  const storageRaw = env.STORAGE_DIR || "./storage/documents";
  const storage = path.isAbsolute(storageRaw) ? storageRaw : path.join(programDir, "server", storageRaw.replace(/^\.\//, ""));
  const size = fs.existsSync(db) ? fs.statSync(db).size : 0;
  return { db, storage, hasRecords: size > 0 };
}

function copyDirContents(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) n += copyDirContents(src, dest);
    else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      if (fs.statSync(dest).size !== fs.statSync(src).size) throw new Error(`Copy of ${src} is incomplete`);
      n++;
    }
  }
  return n;
}

/** Copies one program folder's records and documents into the data folder. */
export function moveLegacyData(legacy, l, { renameOld = true } = {}) {
  fs.mkdirSync(l.root, { recursive: true });
  fs.copyFileSync(legacy.db, l.db);
  if (fs.statSync(l.db).size !== fs.statSync(legacy.db).size) throw new Error("The copy of your records is incomplete");
  const docs = copyDirContents(legacy.storage, l.documents);
  if (renameOld) {
    const tag = `moved-to-data-folder-${stamp()}`;
    fs.renameSync(legacy.db, `${legacy.db}.${tag}`);
    for (const ext of ["-journal", "-wal", "-shm"]) if (fs.existsSync(legacy.db + ext)) fs.rmSync(legacy.db + ext);
    if (fs.existsSync(legacy.storage)) fs.renameSync(legacy.storage, `${legacy.storage}-${tag}`);
  }
  log(`Moved your records and ${docs} document file${docs === 1 ? "" : "s"} into ${l.root}`);
  return docs;
}

/** Other copies of Financial Vault next to this one (e.g. "financevault-old") that hold records. */
export function findOtherCopies(programDir = PROGRAM_DIR) {
  const parent = path.dirname(programDir);
  const found = [];
  let names = [];
  try {
    names = fs.readdirSync(parent);
  } catch {
    return found;
  }
  for (const name of names) {
    const dir = path.join(parent, name);
    if (dir === programDir || !/vault/i.test(name)) continue;
    for (const candidate of [dir, path.join(dir, "financevault")]) {
      if (!fs.existsSync(path.join(candidate, "server", "package.json"))) continue;
      const legacy = legacyData(candidate);
      if (legacy.hasRecords) found.push({ dir: candidate, legacy });
    }
  }
  return found;
}

/**
 * Makes sure the data folder has records: already there → nothing to do;
 * in this program folder → moved; in an older copy beside it → offered
 * (asked in the window, since it's someone else's folder).
 */
export async function ensureDataMoved(l, { interactive = process.stdin.isTTY } = {}) {
  if (fs.existsSync(l.db) && fs.statSync(l.db).size > 0) return "present";
  const here = legacyData(PROGRAM_DIR);
  if (here.hasRecords) {
    moveLegacyData(here, l);
    return "moved";
  }
  const others = findOtherCopies();
  if (others.length && interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (const other of others) {
      const answer = (await rl.question(`\nFound Financial Vault records in:\n  ${other.dir}\nCopy them into this version? (Y/n) `)).trim().toLowerCase();
      if (answer === "" || answer.startsWith("y")) {
        rl.close();
        // Someone else's folder: copy only, never rename.
        moveLegacyData(other.legacy, l, { renameOld: false });
        return "copied";
      }
    }
    rl.close();
  }
  return "fresh";
}
