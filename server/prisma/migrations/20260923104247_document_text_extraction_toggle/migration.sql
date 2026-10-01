-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "documentType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentDate" DATETIME,
    "financialYearId" TEXT,
    "entityId" TEXT,
    "amount" REAL,
    "supplier" TEXT,
    "taxCategoryId" TEXT,
    "taxRelevance" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "confidenceScore" REAL,
    "ocrText" TEXT,
    "textExtractionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiSummary" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "retentionDate" DATETIME,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING_CLASSIFICATION',
    "renewalDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("aiSummary", "amount", "confidenceScore", "createdAt", "documentDate", "documentType", "entityId", "fileHash", "filePath", "fileSize", "financialYearId", "id", "mimeType", "notes", "ocrText", "originalFilename", "renewalDate", "retentionDate", "reviewStatus", "source", "storedFilename", "supplier", "tags", "taxCategoryId", "taxRelevance", "updatedAt", "uploadDate", "version") SELECT "aiSummary", "amount", "confidenceScore", "createdAt", "documentDate", "documentType", "entityId", "fileHash", "filePath", "fileSize", "financialYearId", "id", "mimeType", "notes", "ocrText", "originalFilename", "renewalDate", "retentionDate", "reviewStatus", "source", "storedFilename", "supplier", "tags", "taxCategoryId", "taxRelevance", "updatedAt", "uploadDate", "version" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_fileHash_key" ON "Document"("fileHash");
CREATE INDEX "Document_reviewStatus_idx" ON "Document"("reviewStatus");
CREATE INDEX "Document_financialYearId_idx" ON "Document"("financialYearId");
CREATE INDEX "Document_entityId_idx" ON "Document"("entityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
