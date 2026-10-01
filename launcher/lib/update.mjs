import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { log } from "./log.mjs";
import { compareVersions, programVersion, stamp } from "./paths.mjs";

/**
 * Installing a new version from its ZIP (IDEAS.md idea 16). The program is
 * replaced; the data folder never is. Before anything changes, the records
 * are backed up and the current program is kept as "Previous version", so a
 * failed update — or one you don't like — is put back exactly.
 */

/** Program files an update never touches: installed libraries, and data from before the data folder. */
const KEEP = new Set(["node_modules", ".git"]);
const KEEP_IN_SERVER = (name) => name === ".env" || name === "storage" || name.startsWith("storage-moved-to-data-folder");
const KEEP_IN_PRISMA = (name) => /\.db($|[.-])/.test(name);

function openZip(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err || !zip ? reject(err ?? new Error("Not a ZIP")) : resolve(zip)))
  );
}

async function zipEntries(zip) {
  return new Promise((resolve, reject) => {
    const out = [];
    zip.on("entry", (e) => {
      out.push(e);
      zip.readEntry();
    });
    zip.on("end", () => resolve(out));
    zip.on("error", reject);
    zip.readEntry();
  });
}

async function readEntry(zip, entry) {
  const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (err, s) => (err || !s ? reject(err) : resolve(s))));
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

/** The first section of RELEASE-NOTES.md — what's new in that version. */
export function latestNotes(text) {
  if (!text) return null;
  const sections = text.split(/^## /m).slice(1);
  if (!sections.length) return null;
  return `## ${sections[0]}`.trim();
}

/**
 * Checks a ZIP is a Financial Vault download, and newer than what's here.
 * Returns { version, prefix, notes } or throws with a plain-English reason.
 */
export async function inspectUpdate(zipFile, currentVersion) {
  let zip;
  try {
    zip = await openZip(zipFile);
  } catch {
    throw new Error("That file isn't a ZIP file. Choose the Financial Vault download as it came, without unzipping it.");
  }
  try {
    const entries = await zipEntries(zip).catch((e) => {
      throw new Error(
        /relative path|absolute path/i.test(e.message)
          ? "That ZIP has unsafe file paths in it and wasn't installed."
          : "That ZIP file is damaged — download it again."
      );
    });
    const pkg = entries.find((e) => /^([^/]+\/)?package\.json$/.test(e.fileName));
    if (!pkg) throw new Error("That ZIP isn't a Financial Vault download — there's no program in it.");
    const prefix = pkg.fileName.slice(0, -"package.json".length);
    for (const e of entries) {
      if (e.fileName.includes("..") || path.isAbsolute(e.fileName)) throw new Error("That ZIP has unsafe file paths in it and wasn't installed.");
    }
    const need = ["launcher/launch.mjs", "server/package.json", "server/prisma/schema.prisma", "web/package.json"];
    const missing = need.filter((n) => !entries.some((e) => e.fileName === prefix + n));
    if (missing.length) throw new Error("That ZIP isn't a complete Financial Vault download.");
    let meta;
    try {
      meta = JSON.parse((await readEntry(zip, pkg)).toString("utf8"));
    } catch {
      throw new Error("That ZIP isn't a Financial Vault download.");
    }
    if (meta.name !== "financevault" || !meta.version) throw new Error("That ZIP isn't a Financial Vault download.");
    if (compareVersions(meta.version, currentVersion) <= 0) {
      throw new Error(`That's version ${meta.version}, and this is already version ${currentVersion} — nothing to install.`);
    }
    const notesEntry = entries.find((e) => e.fileName === prefix + "RELEASE-NOTES.md");
    const notes = notesEntry ? latestNotes((await readEntry(zip, notesEntry)).toString("utf8")) : null;
    return { version: meta.version, prefix, notes };
  } finally {
    zip.close();
  }
}

async function extractTo(zipFile, prefix, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const zip = await openZip(zipFile);
  try {
    const entries = await zipEntries(zip);
    for (const e of entries) {
      if (!e.fileName.startsWith(prefix)) continue;
      const rel = e.fileName.slice(prefix.length);
      if (!rel) continue;
      const to = path.join(dest, rel);
      if (!to.startsWith(dest)) continue;
      if (rel.endsWith("/")) {
        fs.mkdirSync(to, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const stream = await new Promise((resolve, reject) => zip.openReadStream(e, (err, s) => (err || !s ? reject(err) : resolve(s))));
      await pipeline(stream, fs.createWriteStream(to));
      // Keep scripts runnable on a Mac.
      const mode = (e.externalFileAttributes >>> 16) & 0o777;
      if (mode & 0o111) fs.chmodSync(to, mode);
    }
  } finally {
    zip.close();
  }
}

/** The program's own files and folders at the top level and in server/ — everything an update replaces. */
function programEntries(programDir) {
  const out = [];
  for (const name of fs.readdirSync(programDir)) {
    if (KEEP.has(name)) continue;
    if (name !== "server") {
      out.push(name);
      continue;
    }
    for (const s of fs.readdirSync(path.join(programDir, "server"))) {
      if (KEEP_IN_SERVER(s)) continue;
      if (s !== "prisma") {
        out.push(path.join("server", s));
        continue;
      }
      for (const p of fs.readdirSync(path.join(programDir, "server", "prisma"))) {
        if (!KEEP_IN_PRISMA(p)) out.push(path.join("server", "prisma", p));
      }
    }
  }
  return out;
}

function copyEntry(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true, preserveTimestamps: true });
}

/** Replaces this program's files with those in `source` (the data and installed libraries stay). */
export function replaceProgram(programDir, source) {
  for (const rel of programEntries(programDir)) fs.rmSync(path.join(programDir, rel), { recursive: true, force: true });
  for (const rel of programEntries(source)) {
    const to = path.join(programDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyEntry(path.join(source, rel), to);
  }
}

/** Keeps a copy of the current program (with its built app) as "Previous version". */
export function keepPreviousVersion(programDir, previousDir) {
  fs.rmSync(previousDir, { recursive: true, force: true });
  fs.mkdirSync(previousDir, { recursive: true });
  for (const rel of programEntries(programDir)) {
    const to = path.join(previousDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyEntry(path.join(programDir, rel), to);
  }
}

/** Copies the records file into Backups before an update changes its layout. */
export function backupRecords(l, label) {
  if (!fs.existsSync(l.db)) return null;
  fs.mkdirSync(l.backups, { recursive: true });
  // Installed from inside the app: it took a backup a moment ago — use that one.
  const recent = fs
    .readdirSync(l.backups)
    .filter((n) => n.startsWith(`financevault-${label}-`))
    .map((n) => path.join(l.backups, n))
    .find((f) => Date.now() - fs.statSync(f).mtimeMs < 10 * 60_000 && fs.statSync(f).mtimeMs >= fs.statSync(l.db).mtimeMs - 5_000);
  if (recent) return recent;
  const to = path.join(l.backups, `financevault-${label}-${stamp()}.db`);
  fs.copyFileSync(l.db, to);
  return to;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The ZIPs waiting in the Updates folder, newest version first. */
export async function pendingUpdates(l, currentVersion) {
  let names = [];
  try {
    names = fs.readdirSync(l.updates).filter((n) => n.toLowerCase().endsWith(".zip"));
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const file = path.join(l.updates, name);
    try {
      out.push({ file, ...(await inspectUpdate(file, currentVersion)) });
    } catch (e) {
      // Not installable: moved aside with the reason, so it isn't tried every start.
      fs.mkdirSync(l.notInstalled, { recursive: true });
      fs.renameSync(file, path.join(l.notInstalled, name));
      fs.writeFileSync(path.join(l.notInstalled, `${name}.why.txt`), e.message + "\n");
      log(`Not installing ${name}: ${e.message}`);
    }
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Step one of an update: back up the records, keep the current program,
 * put the new program in place. The caller then prepares and starts it;
 * if that fails, `putBackPrevious` undoes this.
 */
export async function applyUpdate(programDir, l, update) {
  const from = programVersion(programDir);
  log(`Updating Financial Vault from version ${from} to ${update.version}…`);
  await extractTo(update.file, update.prefix, l.staging);
  const backup = backupRecords(l, `before-update-to-${update.version}`);
  keepPreviousVersion(programDir, l.previous);
  writeJson(l.inProgress, { from, to: update.version, backup, notes: update.notes, startedAt: new Date().toISOString() });
  replaceProgram(programDir, l.staging);
  fs.rmSync(l.staging, { recursive: true, force: true });
  // Done with the ZIP: a copy stays in Backups only as the records file.
  fs.rmSync(update.file, { force: true });
  log(`Version ${update.version} is in place.`);
}

/**
 * Puts the previous version's program back. `restoreRecords` also puts back
 * the records as they were before the update (used when the update failed
 * part-way through changing their layout).
 */
export function putBackPrevious(programDir, l, { restoreRecords = null } = {}) {
  if (!fs.existsSync(path.join(l.previous, "package.json"))) throw new Error("There's no previous version kept to put back.");
  const version = programVersion(l.previous);
  replaceProgram(programDir, l.previous);
  if (restoreRecords && fs.existsSync(restoreRecords)) {
    fs.copyFileSync(restoreRecords, l.db);
    for (const ext of ["-journal", "-wal", "-shm"]) fs.rmSync(l.db + ext, { force: true });
  }
  log(`Put back version ${version}.`);
  return version;
}
