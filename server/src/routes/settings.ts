import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

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
    res.json(await getOrCreateSettings());
  })
);

const updateInput = z.object({ allowExternalAiProcessing: z.boolean() });

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = updateInput.parse(req.body);
    await getOrCreateSettings();
    const settings = await prisma.settings.update({ where: { id: 1 }, data: parsed });
    res.json(settings);
  })
);
