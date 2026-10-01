import fs from "node:fs";
import os from "node:os";
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

/**
 * Other copies of Financial Vault that hold records — beside this one (e.g.
 * "financevault-old"), one folder up (when the new one was unzipped into a
 * folder of its own), and in Documents, OneDrive, the desktop and Downloads.
 */
export function findOtherCopies(programDir = PROGRAM_DIR) {
  const home = os.homedir();
  const places = [
    path.dirname(programDir),
    path.dirname(path.dirname(programDir)),
    path.join(home, "Documents"),
    path.join(home, "OneDrive", "Documents"),
    path.join(home, "OneDrive"),
    path.join(home, "Desktop"),
    path.join(home, "OneDrive", "Desktop"),
    path.join(home, "Downloads"),
    home,
  ];
  const seen = new Set();
  const found = [];
  const consider = (dir) => {
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real) || real === fs.realpathSync(programDir)) return;
    seen.add(real);
    if (!fs.existsSync(path.join(real, "server", "package.json"))) return;
    const legacy = legacyData(real);
    if (legacy.hasRecords) found.push({ dir: real, legacy });
  };
  const children = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /vault/i.test(e.name)).map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  };
  for (const place of places) {
    for (const dir of children(place)) {
      consider(dir);
      // "financevault-1.0.0/financevault" — an unzipped download's own folder.
      for (const inner of children(dir)) consider(inner);
    }
  }
  // Newest first: the copy most recently used is the one to offer.
  return found.sort((a, b) => fs.statSync(b.legacy.db).mtimeMs - fs.statSync(a.legacy.db).mtimeMs);
}

/**
 * Whether the data folder's records are real ones: a passcode has been set.
 * A start that went wrong can leave an empty set of records behind, which
 * shouldn't stop the old records being copied in. Uses Node's built-in
 * SQLite where there is one; otherwise assumes they're real.
 */
async function recordsInUse(dbFile) {
  if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) return false;
  // Node marks its built-in SQLite "experimental"; that notice means nothing here.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes("SQLite") ? undefined : emit.call(process, w, ...rest));
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM "Vault"').get();
      return Number(row?.n ?? 0) > 0;
    } finally {
      db.close();
    }
  } catch {
    return true;
  } finally {
    process.emitWarning = emit;
  }
}

/**
 * Makes sure the data folder has records: already there → nothing to do;
 * in this program folder → moved; in an older copy elsewhere → offered
 * (asked in the window, since it's someone else's folder). An empty set of
 * records left by a start that went wrong is set aside, not deleted.
 */
export async function ensureDataMoved(l, { interactive = process.stdin.isTTY } = {}) {
  if (await recordsInUse(l.db)) return "present";
  const setAsideEmpty = () => {
    if (!fs.existsSync(l.db)) return;
    const to = `${l.db}.empty-${stamp()}`;
    fs.renameSync(l.db, to);
    for (const ext of ["-journal", "-wal", "-shm"]) fs.rmSync(l.db + ext, { force: true });
    log(`Set aside an empty set of records as ${path.basename(to)}.`);
  };
  const here = legacyData(PROGRAM_DIR);
  if (here.hasRecords) {
    setAsideEmpty();
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
        setAsideEmpty();
        // Someone else's folder: copy only, never rename.
        moveLegacyData(other.legacy, l, { renameOld: false });
        return "copied";
      }
    }
    rl.close();
  }
  if (!others.length) log("No earlier Financial Vault records were found — starting fresh. (A backup can be restored on the first screen.)");
  return "fresh";
}
