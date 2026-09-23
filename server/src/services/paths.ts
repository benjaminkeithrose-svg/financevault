import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";

// Resolved from this module's own location so file paths are correct
// regardless of the process's working directory when it was started —
// STORAGE_DIR/DATABASE_URL are meant relative to the server package, not
// wherever `node dist/index.js` happened to be launched from.
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function resolveDefaultStorageDir(): string {
  const raw = process.env.STORAGE_DIR || "./storage/documents";
  return path.isAbsolute(raw) ? raw : path.join(SERVER_ROOT, raw);
}

// Where NEW document uploads are written. Checks Settings.customStorageDir
// first (set from the Settings page — e.g. a folder inside a Google
// Drive/OneDrive/Dropbox sync folder), falling back to STORAGE_DIR/default.
// Existing documents are never affected by this — each keeps its own
// recorded filePath from when it was uploaded.
export async function getEffectiveStorageDir(): Promise<string> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.customStorageDir) return settings.customStorageDir;
  return resolveDefaultStorageDir();
}

export function resolveDbPath(): string {
  const raw = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
  return path.isAbsolute(raw) ? raw : path.join(SERVER_ROOT, "prisma", raw.replace(/^\.\//, ""));
}

/**
 * After the program folder moves — a new version unzipped somewhere else,
 * with the data copied across — each document's recorded location still
 * points at the old folder. Any document whose file isn't where it was
 * recorded, but is in the current storage folder under the same name, is
 * pointed at that copy. Runs at start-up; does nothing when all is well.
 */
export async function relinkMovedDocuments(): Promise<number> {
  const folders = [...new Set([await getEffectiveStorageDir(), resolveDefaultStorageDir()])];
  const documents = await prisma.document.findMany({ select: { id: true, filePath: true, storedFilename: true } });
  let relinked = 0;
  for (const doc of documents) {
    if (fs.existsSync(doc.filePath)) continue;
    const found = folders.map((f) => path.join(f, doc.storedFilename)).find((candidate) => fs.existsSync(candidate));
    if (!found) continue;
    await prisma.document.update({ where: { id: doc.id }, data: { filePath: found } });
    relinked += 1;
  }
  return relinked;
}
