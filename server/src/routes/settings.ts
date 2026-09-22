import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getEffectiveStorageDir } from "../services/paths.js";

export const settingsRouter = Router();

async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await getOrCreateSettings();
    const effectiveStorageDir = await getEffectiveStorageDir();
    res.json({ ...settings, effectiveStorageDir });
  })
);

const updateInput = z.object({
  allowExternalAiProcessing: z.boolean().optional(),
  allowPriceLookups: z.boolean().optional(),
  defaultLandingPage: z.enum(["DASHBOARD", "VISUALIZATION"]).optional(),
  customStorageDir: z.string().optional().nullable(),
});

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = updateInput.parse(req.body);

    if (parsed.customStorageDir) {
      if (!path.isAbsolute(parsed.customStorageDir)) {
        res.status(400).json({ error: "Storage location must be a full, absolute path (e.g. /Users/you/Google Drive/FinanceVault)" });
        return;
      }
      try {
        fs.mkdirSync(parsed.customStorageDir, { recursive: true });
        fs.accessSync(parsed.customStorageDir, fs.constants.W_OK);
      } catch {
        res.status(400).json({ error: "That folder couldn't be created or isn't writable — check the path and try again" });
        return;
      }
    }

    await getOrCreateSettings();
    const settings = await prisma.settings.update({ where: { id: 1 }, data: parsed });
    const effectiveStorageDir = await getEffectiveStorageDir();
    res.json({ ...settings, effectiveStorageDir });
  })
);
