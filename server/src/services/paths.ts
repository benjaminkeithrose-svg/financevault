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
