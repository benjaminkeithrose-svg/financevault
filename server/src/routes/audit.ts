import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const auditRouter = Router();

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const documentId = req.query.documentId ? String(req.query.documentId) : undefined;
    const logs = await prisma.auditLog.findMany({
      where: documentId ? { documentId } : undefined,
      orderBy: { timestamp: "desc" },
      take: 200,
    });
    res.json(logs);
  })
);
