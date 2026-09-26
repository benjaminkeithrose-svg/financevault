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

/** Features switched off, as a list (stored as JSON). */
export function parseFeaturesOff(raw: string | null | undefined): string[] {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function respond(res: import("express").Response) {
  const settings = await getOrCreateSettings();
  const effectiveStorageDir = await getEffectiveStorageDir();
  res.json({ ...settings, featuresOff: parseFeaturesOff(settings.featuresOff), effectiveStorageDir });
}

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    await respond(res);
  })
);

const updateInput = z.object({
  allowExternalAiProcessing: z.boolean().optional(),
  checklistDismissed: z.boolean().optional(),
  allowPriceLookups: z.boolean().optional(),
  defaultLandingPage: z.enum(["DASHBOARD", "VISUALIZATION"]).optional(),
  customStorageDir: z.string().optional().nullable(),
  featuresOff: z.array(z.string().regex(/^[a-z-]{1,40}$/)).max(50).optional(),
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
    const { featuresOff, ...rest } = parsed;
    await prisma.settings.update({
      where: { id: 1 },
      data: { ...rest, ...(featuresOff ? { featuresOff: JSON.stringify([...new Set(featuresOff)]) } : {}) },
    });
    await respond(res);
  })
);
