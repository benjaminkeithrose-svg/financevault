import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { ensureFinancialYear, ingestDocument } from "../services/documentIngest.js";

export const importBatchesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Collapses the varying part of a filename so a run of same-shaped names is
 * recognisable as one set: "Statement_2024_05.pdf" -> "Statement_#_#.pdf".
 */
function filenameTemplate(filename: string): string {
  return filename.replace(/\d+/g, "#");
}

/** The folder a file sat in, used both as a signal and as a grouping key. */
function folderOf(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  const dir = path.posix.dirname(relativePath.replace(/\\/g, "/"));
  return dir === "." || dir === "/" ? null : dir;
}

importBatchesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "Bulk import";
    const batch = await prisma.importBatch.create({ data: { name } });
    res.status(201).json(batch);
  })
);

/**
 * One file per request. The browser drives the queue a few at a time, which
 * keeps server memory bounded no matter how many files were picked and makes
 * progress reportable per file rather than as one opaque wait.
 *
 * A file that can't be read is recorded as FAILED and still returns 200 — a
 * single unreadable PDF must never abandon the other 99.
 */
importBatchesRouter.post(
  "/:id/files",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const batch = await prisma.importBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) {
      res.status(404).json({ error: "Import batch not found" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const relativePath = typeof req.body?.relativePath === "string" ? req.body.relativePath : null;
    const base = {
      batchId: batch.id,
      originalFilename: req.file.originalname,
      relativePath,
      filenameTemplate: filenameTemplate(req.file.originalname),
    };

    try {
      const result = await ingestDocument({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        source: "BULK_IMPORT",
        relativePath,
      });

      const file = await prisma.importBatchFile.create({
        data: {
          ...base,
          status: result.duplicate ? "DUPLICATE" : "IMPORTED",
          documentId: result.document?.id ?? null,
          proposedDocumentType: result.document?.documentType ?? null,
          confidenceScore: result.duplicate ? null : result.classification.confidenceScore,
        },
      });
      res.status(201).json(file);
    } catch (err) {
      const file = await prisma.importBatchFile.create({
        data: {
          ...base,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      res.status(201).json(file);
    }
  })
);

importBatchesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const batches = await prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { files: true } } },
    });
    res.json(batches);
  })
);

/**
 * The review payload: files clustered by what they look like, so one decision
 * can settle a whole run of statements instead of a hundred separate ones.
 */
importBatchesRouter.get(
  "/:id/groups",
  asyncHandler(async (req, res) => {
    const batch = await prisma.importBatch.findUnique({
      where: { id: req.params.id },
      include: {
        files: {
          orderBy: { createdAt: "asc" },
          include: { document: { include: { entity: true, financialYear: true } } },
        },
      },
    });
    if (!batch) {
      res.status(404).json({ error: "Import batch not found" });
      return;
    }

    const groups = new Map<
      string,
      {
        key: string;
        documentType: string | null;
        folder: string | null;
        filenameTemplates: Set<string>;
        fileIds: string[];
        documentIds: string[];
        averageConfidence: number;
        confidenceSum: number;
        confidenceCount: number;
        sampleFilenames: string[];
        financialYearLabels: Set<string>;
      }
    >();

    for (const file of batch.files) {
      if (file.status !== "IMPORTED") continue;
      const folder = folderOf(file.relativePath);
      const key = `${file.proposedDocumentType ?? ""}|${folder ?? ""}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          documentType: file.proposedDocumentType,
          folder,
          filenameTemplates: new Set(),
          fileIds: [],
          documentIds: [],
          averageConfidence: 0,
          confidenceSum: 0,
          confidenceCount: 0,
          sampleFilenames: [],
          financialYearLabels: new Set(),
        };
        groups.set(key, group);
      }

      group.fileIds.push(file.id);
      if (file.documentId) group.documentIds.push(file.documentId);
      if (file.filenameTemplate) group.filenameTemplates.add(file.filenameTemplate);
      if (file.confidenceScore !== null) {
        group.confidenceSum += file.confidenceScore;
        group.confidenceCount += 1;
      }
      if (group.sampleFilenames.length < 3) group.sampleFilenames.push(file.originalFilename);
      if (file.document?.financialYear?.label) group.financialYearLabels.add(file.document.financialYear.label);
    }

    const serialised = Array.from(groups.values())
      .map((g) => ({
        key: g.key,
        documentType: g.documentType,
        folder: g.folder,
        count: g.fileIds.length,
        fileIds: g.fileIds,
        documentIds: g.documentIds,
        sampleFilenames: g.sampleFilenames,
        filenameTemplates: Array.from(g.filenameTemplates).slice(0, 3),
        financialYearLabels: Array.from(g.financialYearLabels).sort(),
        averageConfidence: g.confidenceCount > 0 ? g.confidenceSum / g.confidenceCount : null,
      }))
      // Least confident first: the groups needing a human are the ones worth
      // showing at the top, not the ones already classified well.
      .sort((a, b) => (a.averageConfidence ?? 0) - (b.averageConfidence ?? 0));

    const failed = batch.files.filter((f) => f.status === "FAILED");
    const duplicates = batch.files.filter((f) => f.status === "DUPLICATE");

    res.json({
      batch: { id: batch.id, name: batch.name, status: batch.status, createdAt: batch.createdAt },
      totals: {
        imported: batch.files.filter((f) => f.status === "IMPORTED").length,
        duplicates: duplicates.length,
        failed: failed.length,
      },
      groups: serialised,
      failed: failed.map((f) => ({ id: f.id, originalFilename: f.originalFilename, errorMessage: f.errorMessage })),
      duplicates: duplicates.map((f) => ({ id: f.id, originalFilename: f.originalFilename })),
    });
  })
);

const applyInput = z.object({
  documentIds: z.array(z.string()).min(1),
  documentType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  financialYearLabel: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  taxRelevance: z.enum(["UNKNOWN", "NOT_RELEVANT", "POSSIBLE", "CONFIRMED"]).optional(),
  confirm: z.boolean().optional(),
});

/**
 * Applies one decision to a whole group. Only fields actually supplied are
 * written, so setting an entity for a group never blanks the per-document
 * types the classifier got right.
 */
importBatchesRouter.post(
  "/:id/apply",
  asyncHandler(async (req, res) => {
    const parsed = applyInput.parse(req.body);

    const data: Record<string, unknown> = {};
    if (parsed.documentType !== undefined) data.documentType = parsed.documentType;
    if (parsed.entityId !== undefined) data.entityId = parsed.entityId;
    if (parsed.taxRelevance !== undefined) data.taxRelevance = parsed.taxRelevance;
    if (parsed.financialYearLabel !== undefined) {
      data.financialYearId = await ensureFinancialYear(parsed.financialYearLabel);
    }
    if (parsed.confirm) data.reviewStatus = "CONFIRMED";

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to apply" });
      return;
    }

    const result = await prisma.document.updateMany({
      where: { id: { in: parsed.documentIds } },
      data,
    });

    await logAudit("BULK_CLASSIFICATION_APPLIED", {
      targetType: "ImportBatch",
      targetId: req.params.id,
      data: { count: result.count, ...data },
    });

    res.json({ updated: result.count });
  })
);

importBatchesRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const batch = await prisma.importBatch.update({
      where: { id: req.params.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    res.json(batch);
  })
);

importBatchesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Removes the batch's record of the run only — the imported Documents
    // themselves are deliberately left alone.
    await prisma.importBatch.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
