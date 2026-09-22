import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import path from "node:path";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { ensureFinancialYear, ingestDocument } from "../services/documentIngest.js";

export const documentsRouter = Router();

// SVG is deliberately absent: it's an image format that can contain script.
const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
]);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
    const safeName = doc.originalFilename.replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", doc.mimeType);

    // Uploaded files are served from the app's own origin, so an HTML or SVG
    // file shown inline would run its scripts with full access to the app.
    // Only types that can't carry script are displayed inline (and may be
    // framed by the app's own preview); anything else is downloaded instead,
    // with a sandbox policy in case a browser opens it anyway.
    if (INLINE_SAFE_TYPES.has(doc.mimeType.toLowerCase())) {
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Content-Security-Policy", "sandbox; frame-ancestors 'none'");
    }
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

    const result = await ingestDocument({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      source: "MANUAL_UPLOAD",
    });

    if (result.duplicate) {
      res.status(200).json({ duplicate: true, document: result.document });
      return;
    }

    res.status(201).json({ duplicate: false, document: result.document, proposed: result.classification });
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
    "PERSON",
    "ENTITY",
    "ASSET",
    "LIABILITY",
    "ACCOUNT",
    "PROPERTY",
    "COMMERCIAL_PROPERTY",
    "TENANCY",
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
