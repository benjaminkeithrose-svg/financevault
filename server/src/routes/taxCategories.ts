import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const taxCategoriesRouter = Router();

taxCategoriesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.taxCategory.findMany({ orderBy: { name: "asc" } });
    res.json(categories);
  })
);

const createInput = z.object({
  name: z.string().min(1),
  group: z.enum(["INCOME", "EXPENSE", "CAPITAL", "OTHER"]),
  description: z.string().optional().nullable(),
});

taxCategoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createInput.parse(req.body);
    const category = await prisma.taxCategory.create({ data: parsed });
    res.status(201).json(category);
  })
);
