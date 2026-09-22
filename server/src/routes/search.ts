import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const searchRouter = Router();

// Stage 1 search: keyword matching across document metadata/OCR text, entity
// names and notes. Natural-language query parsing (financial year mentions,
// "insurance for investment properties" style queries) is layered on top of
// this in later stages once more structured data exists to reason over.
searchRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) {
      res.json({ documents: [], entities: [] });
      return;
    }

    const [documents, entities] = await Promise.all([
      prisma.document.findMany({
        where: {
          OR: [
            { originalFilename: { contains: q } },
            { ocrText: { contains: q } },
            { notes: { contains: q } },
            { supplier: { contains: q } },
            { documentType: { contains: q } },
            { tags: { contains: q } },
            { aiSummary: { contains: q } },
          ],
        },
        include: { entity: true, financialYear: true },
        orderBy: { uploadDate: "desc" },
        take: 50,
      }),
      prisma.entity.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { notes: { contains: q } },
            { abn: { contains: q } },
          ],
        },
        take: 20,
      }),
    ]);

    res.json({ documents, entities });
  })
);
