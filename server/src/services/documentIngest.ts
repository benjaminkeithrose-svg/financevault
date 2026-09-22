import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { sha256 } from "./hash.js";
import { extractText } from "./ocr.js";
import { classifyDocument } from "./classification.js";
import { financialYearBounds } from "./financialYear.js";
import { logAudit } from "./audit.js";
import { getEffectiveStorageDir } from "./paths.js";
import { redactTfns } from "./tfn.js";

export async function ensureFinancialYear(label: string | null) {
  if (!label) return null;
  const { start, end } = financialYearBounds(label);
  const fy = await prisma.financialYear.upsert({
    where: { label },
    update: {},
    create: { label, startDate: start, endDate: end },
  });
  return fy.id;
}

export interface IngestInput {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  source: string;
  /** Proposed, never auto-applied — only used where the classifier found nothing. */
  suggestedDocumentType?: string | null;
  suggestedEntityId?: string | null;
  /** Folder the file came from on a bulk import; feeds classification. */
  relativePath?: string | null;
}

export type IngestResult =
  | { duplicate: true; document: Awaited<ReturnType<typeof prisma.document.findFirst>> }
  | { duplicate: false; document: Awaited<ReturnType<typeof prisma.document.create>>; classification: ReturnType<typeof classifyDocument> };

/**
 * The one path by which bytes become a Document — hash, de-dup, store, OCR,
 * classify, audit. Both manual upload and email import go through here so
 * an imported attachment is treated exactly like a file the user dragged in.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const fileHash = sha256(input.buffer);

  const existing = await prisma.document.findFirst({ where: { fileHash } });
  if (existing) return { duplicate: true, document: existing };

  const storageDir = await getEffectiveStorageDir();
  await fs.mkdir(storageDir, { recursive: true });
  const storedFilename = `${fileHash}${path.extname(input.originalFilename)}`;
  const filePath = path.join(storageDir, storedFilename);
  await fs.writeFile(filePath, input.buffer);

  const { text } = await extractText(input.buffer, input.mimeType);

  const entities = await prisma.entity.findMany({ select: { id: true, name: true } });
  const classification = classifyDocument({
    filename: input.originalFilename,
    text,
    entities,
    folderPath: input.relativePath,
  });

  const financialYearId = await ensureFinancialYear(classification.financialYearLabel);

  // A rule's suggestion only fills a gap the classifier left — it never
  // overrides something read out of the document itself.
  const documentType = classification.documentType ?? input.suggestedDocumentType ?? null;
  const entityId = classification.entityId ?? input.suggestedEntityId ?? null;

  const document = await prisma.document.create({
    data: {
      originalFilename: input.originalFilename,
      storedFilename,
      filePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      fileHash,
      documentType,
      source: input.source,
      documentDate: classification.documentDate,
      renewalDate: classification.renewalDate,
      financialYearId: financialYearId ?? undefined,
      entityId: entityId ?? undefined,
      amount: classification.amount ?? undefined,
      taxRelevance: classification.taxRelevance,
      confidenceScore: classification.confidenceScore,
      // Stored text is searchable and unencrypted, so a TFN read out of a tax
      // return is masked before it's saved. Classification above already
      // ran on the full text.
      ocrText: text ? redactTfns(text).text : null,
      reviewStatus: classification.needsReview ? "NEEDS_CONFIRMATION" : "PENDING_CLASSIFICATION",
    },
  });

  await logAudit("DOCUMENT_IMPORTED", {
    targetType: "Document",
    targetId: document.id,
    documentId: document.id,
    data: { filename: document.originalFilename, confidence: classification.confidenceScore, source: input.source },
  });

  return { duplicate: false, document, classification };
}
