import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { expectedChecklist } from "../services/expected.js";

/** "What's missing": expected insurance and paperwork, and the ones set aside. */
export const expectedRouter = Router();

expectedRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const fy = typeof req.query.fy === "string" ? req.query.fy : undefined;
    const result = await expectedChecklist(fy);
    // A detail page asks only about itself ("asset:<id>", "person:<id>", "entity:<id>").
    const target = typeof req.query.target === "string" ? req.query.target : null;
    res.json(target ? { ...result, groups: result.groups.filter((g) => g.target === target) } : result);
  })
);

const setAsideInput = z.object({
  key: z.string().regex(/^(ins|doc):[^\s]{1,200}$/),
  reason: z.string().trim().min(1, "Say why it isn't needed").max(300),
});

expectedRouter.put(
  "/set-aside",
  asyncHandler(async (req, res) => {
    const { key, reason } = setAsideInput.parse(req.body);
    const row = await prisma.expectationDismissal.upsert({ where: { key }, update: { reason }, create: { key, reason } });
    await logAudit("EXPECTATION_SET_ASIDE", { targetType: "ExpectationDismissal", targetId: row.id, data: { key, reason } });
    res.json(row);
  })
);

expectedRouter.delete(
  "/set-aside",
  asyncHandler(async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    await prisma.expectationDismissal.deleteMany({ where: { key } });
    await logAudit("EXPECTATION_RESTORED", { targetType: "ExpectationDismissal", data: { key } });
    res.status(204).end();
  })
);
