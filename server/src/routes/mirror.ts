import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { lastMirrorResult, mirrorFolder, runMirror } from "../services/mirror.js";

/** Settings → Readable copies of your documents. */
export const mirrorRouter = Router();

async function status() {
  const { folder, enabled, custom } = await mirrorFolder();
  return { folder, enabled, custom, last: lastMirrorResult() };
}

mirrorRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await status());
  })
);

const input = z.object({
  enabled: z.boolean().optional(),
  folder: z.string().trim().max(500).nullable().optional(),
});

mirrorRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const { enabled, folder } = input.parse(req.body);
    if (folder) {
      if (!path.isAbsolute(folder)) throw new HttpError(400, "Give the folder's full address, e.g. C:\\Users\\you\\OneDrive\\Financial Vault");
      try {
        fs.mkdirSync(folder, { recursive: true });
        fs.accessSync(folder, fs.constants.W_OK);
      } catch {
        throw new HttpError(400, "That folder couldn't be created or isn't writable — check the address and try again.");
      }
    }
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...(enabled !== undefined ? { mirrorEnabled: enabled } : {}), ...(folder !== undefined ? { mirrorDir: folder || null } : {}) },
      update: { ...(enabled !== undefined ? { mirrorEnabled: enabled } : {}), ...(folder !== undefined ? { mirrorDir: folder || null } : {}) },
    });
    await logAudit("READABLE_COPIES_SETTINGS", { data: { enabled, folderChanged: folder !== undefined } });
    res.json(await status());
  })
);

mirrorRouter.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    const result = await runMirror();
    if (!result) throw new HttpError(400, "Readable copies are switched off, or no folder has been chosen yet.");
    res.json(await status());
  })
);
