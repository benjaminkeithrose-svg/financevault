import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { sha256 } from "../services/hash.js";
import { extractText } from "../services/ocr.js";
import { classifyDocument } from "../services/classification.js";
import { financialYearBounds } from "../services/financialYear.js";
import { logAudit } from "../services/audit.js";

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage/documents";

export const documentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function ensureFinancialYear(label: string | null) {
  if (!label) return null;
  const { start, end } = financialYearBounds(label);
  const fy = await prisma.financialYear.upsert({
    where: { label },
    update: {},
    create: { label, startDate: start, endDate: end },
  });
  return fy.id;
}

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { reviewStatus, entityId, financialYearId, q } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (reviewStatus) where.reviewStatus = reviewStatus;
    if (entityId) where.entityId = entityId;
    if (financialYearId) where.financialYearId = financialYearId;
    if (q) {
      where.OR = [
        { originalFilename: { contains: q } },
        { ocrText: { contains: q } },
        { notes: { contains: q } },
        { supplier: { contains: q } },
        { documentType: { contains: q } },
        { tags: { contains: q } },
      ];
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { uploadDate: "desc" },
      include: { entity: true, financialYear: true, taxCategory: true },
    });
    res.json(documents);
  })
);

// Registered before "/:id" so the literal path isn't swallowed by the param route.
documentsRouter.get(
  "/by-target",
  asyncHandler(async (req, res) => {
    const targetType = String(req.query.targetType || "");
    const targetId = String(req.query.targetId || "");
    if (!targetType || !targetId) {
      res.status(400).json({ error: "targetType and targetId are required" });
      return;
    }
    const links = await prisma.documentLink.findMany({
      where: { targetType, targetId },
      include: { document: { include: { entity: true, financialYear: true, taxCategory: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(links);
  })
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { entity: true, financialYear: true, taxCategory: true, links: true },
    });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  })
);

documentsRouter.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.originalFilename}"`);
    res.sendFile(path.resolve(doc.filePath));
  })
);

documentsRouter.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const fileHash = sha256(req.file.buffer);

    const existing = await prisma.document.findFirst({ where: { fileHash } });
    if (existing) {
      res.status(200).json({ duplicate: true, document: existing });
      return;
    }

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const storedFilename = `${fileHash}${path.extname(req.file.originalname)}`;
    const filePath = path.join(STORAGE_DIR, storedFilename);
    await fs.writeFile(filePath, req.file.buffer);

    const { text } = await extractText(req.file.buffer, req.file.mimetype);

    const entities = await prisma.entity.findMany({ select: { id: true, name: true } });
    const classification = classifyDocument({ filename: req.file.originalname, text, entities });

    const financialYearId = await ensureFinancialYear(classification.financialYearLabel);

    const doc = await prisma.document.create({
      data: {
        originalFilename: req.file.originalname,
        storedFilename,
        filePath,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        fileHash,
        documentType: classification.documentType,
        source: "MANUAL_UPLOAD",
        documentDate: classification.documentDate,
        renewalDate: classification.renewalDate,
        financialYearId: financialYearId ?? undefined,
        entityId: classification.entityId ?? undefined,
        amount: classification.amount ?? undefined,
        taxRelevance: classification.taxRelevance,
        confidenceScore: classification.confidenceScore,
        ocrText: text || null,
        reviewStatus: classification.needsReview ? "NEEDS_CONFIRMATION" : "PENDING_CLASSIFICATION",
      },
    });

    await logAudit("DOCUMENT_IMPORTED", {
      targetType: "Document",
      targetId: doc.id,
      documentId: doc.id,
      data: { filename: doc.originalFilename, confidence: classification.confidenceScore },
    });

    res.status(201).json({ duplicate: false, document: doc, proposed: classification });
  })
);

const updateInput = z.object({
  documentType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  financialYearLabel: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  amount: z.number().optional().nullable(),
  supplier: z.string().optional().nullable(),
  taxCategoryId: z.string().optional().nullable(),
  taxRelevance: z.enum(["UNKNOWN", "NOT_RELEVANT", "POSSIBLE", "CONFIRMED"]).optional(),
  notes: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  documentDate: z.string().datetime().optional().nullable(),
  renewalDate: z.string().datetime().optional().nullable(),
  reviewStatus: z
    .enum(["PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"])
    .optional(),
});

documentsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateInput.parse(req.body);
    const { financialYearLabel, ...rest } = parsed;

    const data: Record<string, unknown> = { ...rest };
    if (parsed.documentDate !== undefined) data.documentDate = parsed.documentDate ? new Date(parsed.documentDate) : null;
    if (parsed.renewalDate !== undefined) data.renewalDate = parsed.renewalDate ? new Date(parsed.renewalDate) : null;
    if (financialYearLabel !== undefined) {
      data.financialYearId = await ensureFinancialYear(financialYearLabel);
    }

    const doc = await prisma.document.update({ where: { id: req.params.id }, data });
    await logAudit("DOCUMENT_CLASSIFIED", { targetType: "Document", targetId: doc.id, documentId: doc.id, data });
    res.json(doc);
  })
);

documentsRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.update({
      where: { id: req.params.id },
      data: { reviewStatus: "CONFIRMED" },
    });
    await logAudit("USER_CONFIRMATION", { targetType: "Document", targetId: doc.id, documentId: doc.id });
    res.json(doc);
  })
);

const linkInput = z.object({
  targetType: z.enum([
    "ENTITY",
    "ASSET",
    "LIABILITY",
    "ACCOUNT",
    "PROPERTY",
    "INVESTMENT_ACCOUNT",
    "TRANSACTION",
    "TAX_RECORD",
  ]),
  targetId: z.string(),
  label: z.string().optional().nullable(),
});

documentsRouter.post(
  "/:id/links",
  asyncHandler(async (req, res) => {
    const parsed = linkInput.parse(req.body);
    const link = await prisma.documentLink.create({
      data: { documentId: req.params.id, ...parsed },
    });
    await logAudit("DOCUMENT_LINK_ADDED", { targetType: "Document", targetId: req.params.id, documentId: req.params.id });
    res.status(201).json(link);
  })
);

documentsRouter.delete(
  "/:id/links/:linkId",
  asyncHandler(async (req, res) => {
    await prisma.documentLink.delete({ where: { id: req.params.linkId } });
    res.status(204).send();
  })
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.document.update({ where: { id: req.params.id }, data: { reviewStatus: "ARCHIVED" } });
    await logAudit("DOCUMENT_DELETED", { targetType: "Document", targetId: req.params.id, documentId: req.params.id });
    res.status(204).send();
  })
);
