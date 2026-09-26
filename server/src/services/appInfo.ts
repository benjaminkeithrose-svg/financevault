import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SERVER_ROOT } from "./paths.js";

/**
 * The program's version, where its data folder is, and what the launcher
 * (launcher/launch.mjs) last did — an update installed, one that failed and
 * was put back, or the previous version restored. The launcher does the
 * installing; the app hands it the ZIP and restarts (IDEAS.md idea 16).
 */

export const PROGRAM_ROOT = path.join(SERVER_ROOT, "..");
/** Exit code that asks the launcher to install what's waiting, then start again. */
export const RESTART_CODE = 75;

export function programVersion(dir = PROGRAM_ROOT): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The data folder, when started by the launcher (not in development or tests). */
export function dataFolder(): string | null {
  return process.env.FV_DATA_DIR ? path.resolve(process.env.FV_DATA_DIR) : null;
}

export const supervised = () => process.env.FV_SUPERVISED === "1";

export function dataPaths(root: string) {
  return {
    updates: path.join(root, "Updates"),
    backups: path.join(root, "Backups"),
    previous: path.join(root, "Previous version"),
    lastUpdate: path.join(root, "last-update.json"),
    rollbackRequest: path.join(root, "Updates", "put-back-previous-version.request"),
  };
}

export interface LastUpdate {
  kind: "UPDATED" | "FAILED" | "ROLLED_BACK";
  from: string;
  to: string;
  notes?: string | null;
  error?: string;
  at: string;
  seen: boolean;
}

export function readLastUpdate(root: string): LastUpdate | null {
  try {
    return JSON.parse(fs.readFileSync(dataPaths(root).lastUpdate, "utf8")) as LastUpdate;
  } catch {
    return null;
  }
}

export function previousVersion(root: string): string | null {
  const dir = dataPaths(root).previous;
  if (!fs.existsSync(path.join(dir, "package.json"))) return null;
  // After a failed update, the kept copy is the version that's running again — nothing to put back.
  const version = programVersion(dir);
  return version === programVersion() ? null : version;
}

type Inspect = (zip: string, current: string) => Promise<{ version: string; prefix: string; notes: string | null }>;

/** The launcher's own check of an update ZIP — one set of rules, used by both. */
export async function inspectUpdate(zipFile: string): Promise<{ version: string; notes: string | null }> {
  const mod = (await import(pathToFileURL(path.join(PROGRAM_ROOT, "launcher", "lib", "update.mjs")).href)) as { inspectUpdate: Inspect };
  const { version, notes } = await mod.inspectUpdate(zipFile, programVersion());
  return { version, notes };
}
