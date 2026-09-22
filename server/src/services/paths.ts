import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this module's own location so file paths are correct
// regardless of the process's working directory when it was started —
// STORAGE_DIR/DATABASE_URL are meant relative to the server package, not
// wherever `node dist/index.js` happened to be launched from.
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function resolveStorageDir(): string {
  const raw = process.env.STORAGE_DIR || "./storage/documents";
  return path.isAbsolute(raw) ? raw : path.join(SERVER_ROOT, raw);
}

export function resolveDbPath(): string {
  const raw = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
  return path.isAbsolute(raw) ? raw : path.join(SERVER_ROOT, "prisma", raw.replace(/^\.\//, ""));
}
