import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { financialYearBounds } from "../services/financialYear.js";

export const financialYearsRouter = Router();

financialYearsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const years = await prisma.financialYear.findMany({ orderBy: { startDate: "desc" } });
    res.json(years);
  })
);

const createInput = z.object({ label: z.string().regex(/^\d{4}-\d{2}$/) });

financialYearsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { label } = createInput.parse(req.body);
    const { start, end } = financialYearBounds(label);
    const year = await prisma.financialYear.upsert({
      where: { label },
      update: {},
      create: { label, startDate: start, endDate: end },
    });
    res.status(201).json(year);
  })
);
