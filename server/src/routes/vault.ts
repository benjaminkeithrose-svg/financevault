import os from "node:os";
import fs from "node:fs";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { restoreFromBackup } from "../services/restore.js";
import { logAudit } from "../services/audit.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  IDLE_LOCK_MS,
  MIN_PASSCODE_LENGTH,
  VaultError,
  changePasscode,
  lockNow,
  recoverVault,
  setUpVault,
  touchSession,
  unlockVault,
  vaultStatus,
} from "../services/vault.js";

export const vaultRouter = Router();

const COOKIE = "fv_session";

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return undefined;
}

/**
 * HttpOnly so page scripts can't read it; SameSite=Strict so no other website
 * can make the browser send it. No Max-Age: it ends with the browser session,
 * and the server forgets it anyway on lock or restart.
 */
function setSessionCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function sendVaultError(res: Response, err: unknown) {
  if (err instanceof VaultError) {
    if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(err.status).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
    return;
  }
  throw err;
}

/** Every /api route except these lock routes goes through here. */
export function requireSession(req: Request, res: Response, next: NextFunction) {
  if (touchSession(readSessionToken(req))) {
    next();
    return;
  }
  res.status(401).json({ error: "Financial Vault is locked.", locked: true });
}

vaultRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const status = await vaultStatus();
    res.json({
      ...status,
      // "Unlocked" only counts for this browser if it holds a live session.
      unlocked: status.unlocked && touchSession(readSessionToken(req)),
      minPasscodeLength: MIN_PASSCODE_LENGTH,
      idleLockMinutes: IDLE_LOCK_MS / 60_000,
    });
  })
);

vaultRouter.post(
  "/setup",
  asyncHandler(async (req, res) => {
    try {
      const { token, recoveryKey } = await setUpVault(String(req.body?.passcode ?? ""));
      setSessionCookie(res, token);
      res.status(201).json({ recoveryKey });
    } catch (err) {
      sendVaultError(res, err);
    }
  })
);

vaultRouter.post(
  "/unlock",
  asyncHandler(async (req, res) => {
    try {
      setSessionCookie(res, await unlockVault(String(req.body?.passcode ?? "")));
      res.json({ unlocked: true });
    } catch (err) {
      sendVaultError(res, err);
    }
  })
);

vaultRouter.post(
  "/recover",
  asyncHandler(async (req, res) => {
    try {
      const token = await recoverVault(String(req.body?.recoveryKey ?? ""), String(req.body?.newPasscode ?? ""));
      setSessionCookie(res, token);
      res.json({ unlocked: true });
    } catch (err) {
      sendVaultError(res, err);
    }
  })
);

// Loading a backup into a fresh copy — only possible before a passcode is set.
const backupUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 * 1024 } });
vaultRouter.post(
  "/restore",
  backupUpload.single("backup"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Choose the backup file first." });
      return;
    }
    try {
      const result = await restoreFromBackup(req.file.path);
      await logAudit("BACKUP_RESTORED", { targetType: "Vault", data: result });
      res.json(result);
    } finally {
      fs.rmSync(req.file.path, { force: true });
    }
  })
);

vaultRouter.post("/lock", (_req, res) => {
  lockNow("MANUAL");
  clearSessionCookie(res);
  res.json({ unlocked: false });
});

vaultRouter.post(
  "/change-passcode",
  requireSession,
  asyncHandler(async (req, res) => {
    try {
      await changePasscode(String(req.body?.currentPasscode ?? ""), String(req.body?.newPasscode ?? ""));
      res.json({ changed: true });
    } catch (err) {
      sendVaultError(res, err);
    }
  })
);
