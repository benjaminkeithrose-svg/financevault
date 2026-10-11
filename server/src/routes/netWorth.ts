import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { computeLiveBreakdown } from "../services/netWorth.js";

export const netWorthRouter = Router();

netWorthRouter.get(
  "/preview",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
    res.json(await computeLiveBreakdown(entityId));
  })
);

netWorthRouter.get(
  "/snapshots",
  asyncHandler(async (req, res) => {
    const entityId = req.query.entityId ? String(req.query.entityId) : null;
    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { entityId },
      include: { entity: true },
      orderBy: { asAtDate: "desc" },
    });
    res.json(snapshots);
  })
);

const snapshotInput = z.object({
  asAtDate: z.string().datetime(),
  entityId: z.string().optional().nullable(),
  cash: z.number(),
  propertyValue: z.number(),
  investmentValue: z.number(),
  superValue: z.number(),
  vehicleValue: z.number(),
  otherAssets: z.number(),
  totalAssets: z.number(),
  mortgages: z.number(),
  creditCards: z.number(),
  personalLoans: z.number(),
  vehicleLoans: z.number().optional().default(0),
  otherLiabilities: z.number(),
  totalLiabilities: z.number(),
  netPosition: z.number(),
  notes: z.string().optional().nullable(),
});

netWorthRouter.post(
  "/snapshots",
  asyncHandler(async (req, res) => {
    const parsed = snapshotInput.parse(req.body);
    const snapshot = await prisma.netWorthSnapshot.create({
      data: { ...parsed, asAtDate: new Date(parsed.asAtDate) },
      include: { entity: true },
    });
    res.status(201).json(snapshot);
  })
);

netWorthRouter.delete(
  "/snapshots/:id",
  asyncHandler(async (req, res) => {
    await prisma.netWorthSnapshot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
