import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteWithLinks, refuseIfInUse } from "../services/deletion.js";
import { logAudit } from "../services/audit.js";

export const taxRouter = Router();

taxRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityId, financialYearId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;
    if (financialYearId) where.financialYearId = financialYearId;
    const records = await prisma.taxRecord.findMany({
      where,
      include: { entity: true, financialYear: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(records);
  })
);

const taxRecordInput = z.object({
  financialYearId: z.string(),
  entityId: z.string(),
  recordType: z.enum(["INCOME", "EXPENSE", "CAPITAL_GAIN", "CAPITAL_LOSS"]),
  description: z.string().min(1),
  amount: z.number().optional().nullable(),
  status: z.enum(["RECORDED", "ESTIMATED", "NEEDS_REVIEW", "ACCOUNTANT_CONFIRMED"]).optional(),
  notes: z.string().optional().nullable(),
});

taxRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = taxRecordInput.parse(req.body);
    const record = await prisma.taxRecord.create({ data: parsed, include: { entity: true, financialYear: true } });
    await logAudit("TAX_RECORD_CREATED", { targetType: "TaxRecord", targetId: record.id });
    res.status(201).json(record);
  })
);

taxRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = taxRecordInput.partial().parse(req.body);
    const record = await prisma.taxRecord.update({
      where: { id: req.params.id },
      data: parsed,
      include: { entity: true, financialYear: true },
    });
    await logAudit("TAX_RECORD_CHANGED", { targetType: "TaxRecord", targetId: record.id, data: parsed });
    res.json(record);
  })
);

taxRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "TAX_RECORD", id: req.params.id }], (tx) => tx.taxRecord.delete({ where: { id: req.params.id } }));
    await logAudit("TAX_RECORD_DELETED", { targetType: "TaxRecord", targetId: req.params.id });
    res.status(204).send();
  })
);
