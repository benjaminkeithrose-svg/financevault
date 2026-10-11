import { Router, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import {
  dataFolder,
  dataPaths,
  inspectUpdate,
  installed,
  previousVersion,
  programVersion,
  readLastUpdate,
  RESTART_CODE,
  supervised,
} from "../services/appInfo.js";
import { checkNow, INSTALL_CODE, onlineStatus, prepareInstall, remindLater, setAutoCheck } from "../services/onlineUpdate.js";
import { z } from "zod";

/** Settings → Program and updates: version, install an update, put the previous version back. */
export const appUpdateRouter = Router();

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

function requireDataFolder(): string {
  if (installed()) throw new HttpError(400, "This is the installed program: it updates itself from Settings → Program and updates, or run the new version's Financial Vault Setup file.");
  const root = dataFolder();
  if (!root) throw new HttpError(400, "Updates are installed when Financial Vault is started with its Start Financial Vault file or desktop icon.");
  return root;
}

/** Hands over to the launcher: this process stops, it installs, and starts the app again. */
function restartSoon(res: Response, body: Record<string, unknown>) {
  res.json({ ...body, restarting: supervised() });
  if (supervised()) setTimeout(() => process.exit(RESTART_CODE), 400);
}

appUpdateRouter.get(
  "/info",
  asyncHandler(async (_req, res) => {
    const root = dataFolder();
    res.json({
      version: programVersion(),
      dataFolder: root,
      canUpdate: !!root && !installed(),
      installed: installed(),
      supervised: supervised(),
      previousVersion: root && !installed() ? previousVersion(root) : null,
      lastUpdate: root ? readLastUpdate(root) : null,
    });
  })
);

/** A full, consistent copy of the records, in Backups, before an update. */
async function backupBefore(version: string): Promise<string> {
  const p = dataPaths(dataFolder()!);
  fs.mkdirSync(p.backups, { recursive: true });
  const when = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const backup = path.join(p.backups, `financevault-before-update-to-${version}-${when}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  return backup;
}

// Automatic updates for the installed program: from the project's GitHub releases.

appUpdateRouter.get("/online", (_req, res) => {
  res.json(onlineStatus());
});

function requireInstalled() {
  if (!onlineStatus().enabled) throw new HttpError(400, "Automatic updates are for the installed program (Financial Vault Setup).");
}

appUpdateRouter.post(
  "/online/check",
  asyncHandler(async (_req, res) => {
    requireInstalled();
    await checkNow();
    res.json(onlineStatus());
  })
);

appUpdateRouter.put(
  "/online/settings",
  asyncHandler(async (req, res) => {
    requireInstalled();
    const { autoCheck } = z.object({ autoCheck: z.boolean() }).parse(req.body);
    setAutoCheck(autoCheck);
    await logAudit("AUTO_UPDATE_CHECK_SWITCHED", { data: { on: autoCheck } });
    res.json(onlineStatus());
  })
);

appUpdateRouter.post(
  "/online/later",
  asyncHandler(async (req, res) => {
    requireInstalled();
    const { version } = z.object({ version: z.string() }).parse(req.body);
    remindLater(version);
    res.json(onlineStatus());
  })
);

/** Starts downloading; the page follows along with GET /online. When it's ready, the program restarts into the new version. */
appUpdateRouter.post(
  "/online/install",
  asyncHandler(async (_req, res) => {
    requireInstalled();
    const status = onlineStatus();
    if (!status.available) throw new HttpError(400, "There's no newer version to install. Check again first.");
    if (status.job.state === "downloading" || status.job.state === "installing") throw new HttpError(409, "An update is already being installed.");
    const from = programVersion();
    prepareInstall(backupBefore)
      .then(async (request) => {
        await logAudit("UPDATE_DOWNLOADED", { data: { from, to: request.version } });
        if (supervised()) setTimeout(() => process.exit(INSTALL_CODE), 1500);
      })
      .catch((e: Error) => console.error(e.message));
    res.status(202).json({ ...onlineStatus(), job: { state: "downloading", received: 0, total: status.available.size } });
  })
);

appUpdateRouter.post(
  "/update",
  upload.single("update"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    try {
      const root = requireDataFolder();
      if (!file) throw new HttpError(400, "Choose the Financial Vault ZIP file to install.");
      let found: { version: string; notes: string | null };
      try {
        found = await inspectUpdate(file.path);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      const p = dataPaths(root);
      // A full, consistent copy of the records before anything changes.
      const backup = await backupBefore(found.version);
      fs.mkdirSync(p.updates, { recursive: true });
      fs.copyFileSync(file.path, path.join(p.updates, `financevault-${found.version}.zip`));
      await logAudit("UPDATE_STAGED", { data: { from: programVersion(), to: found.version } });
      restartSoon(res, { version: found.version, notes: found.notes, backup: path.basename(backup) });
    } finally {
      if (file) fs.rm(file.path, { force: true }, () => {});
    }
  })
);

appUpdateRouter.post(
  "/rollback",
  asyncHandler(async (_req, res) => {
    const root = requireDataFolder();
    const version = previousVersion(root);
    if (!version) throw new HttpError(400, "There's no previous version kept to put back.");
    const p = dataPaths(root);
    fs.mkdirSync(p.updates, { recursive: true });
    fs.writeFileSync(p.rollbackRequest, `${programVersion()} -> ${version}\n`);
    await logAudit("ROLLBACK_REQUESTED", { data: { from: programVersion(), to: version } });
    restartSoon(res, { version });
  })
);

appUpdateRouter.post(
  "/update-seen",
  asyncHandler(async (_req, res) => {
    const root = dataFolder();
    if (!root) throw new HttpError(400, "No data folder.");
    const last = readLastUpdate(root);
    if (last) fs.writeFileSync(dataPaths(root).lastUpdate, JSON.stringify({ ...last, seen: true }, null, 2));
    res.status(204).end();
  })
);
