import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import { acquisitionFigures } from "../services/acquisitionMath.js";

/** The Acquisition Model page's sums — the same ones the assessment of a considered property uses. */
export const acquisitionModelRouter = Router();

const n = z.number().finite().default(0);
const input = z.object({
  purchasePrice: n,
  acquisitionCosts: n,
  lvr: n,
  rent: n,
  occupancy: n,
  fixedIncome: n,
  expenses: n,
  interestRate: n,
  repaymentType: z.enum(["IO", "PI"]).default("IO"),
  loanTermYears: n,
});

acquisitionModelRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.json(acquisitionFigures(input.parse(req.body)));
  })
);
