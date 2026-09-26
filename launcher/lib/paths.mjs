import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The program folder: where "Start Financial Vault" and this launcher live. Replaced on update. */
export const PROGRAM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The data folder: records, documents, backups — everything that isn't the
 * program. It lives apart from the program (in Documents) so an update can
 * replace the program without going near the data. FV_DATA_DIR overrides it.
 */
export function dataDir() {
  if (process.env.FV_DATA_DIR) return path.resolve(process.env.FV_DATA_DIR);
  const docs = path.join(os.homedir(), "Documents");
  return path.join(fs.existsSync(docs) ? docs : os.homedir(), "Financial Vault Data");
}

export function layout(root = dataDir()) {
  return {
    root,
    db: path.join(root, "financevault.db"),
    documents: path.join(root, "Documents"),
    backups: path.join(root, "Backups"),
    updates: path.join(root, "Updates"),
    notInstalled: path.join(root, "Updates", "Not installed"),
    staging: path.join(root, "Updates", ".staging"),
    inProgress: path.join(root, "Updates", ".in-progress.json"),
    rollbackRequest: path.join(root, "Updates", "put-back-previous-version.request"),
    previous: path.join(root, "Previous version"),
    logs: path.join(root, "Logs"),
    lastUpdate: path.join(root, "last-update.json"),
    browserProfile: path.join(root, ".app-window"),
    iconMade: path.join(root, ".desktop-icon-made"),
  };
}

export function ensureFolders(l) {
  for (const dir of [l.root, l.documents, l.backups, l.updates, l.logs]) fs.mkdirSync(dir, { recursive: true });
}

export function programVersion(dir = PROGRAM_DIR) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** -1, 0 or 1, comparing "1.2.3" style versions. */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function stamp(d = new Date()) {
  return d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
