-- AlterTable
ALTER TABLE "Document" ADD COLUMN "referenceLinkId" TEXT;
ALTER TABLE "Document" ADD COLUMN "retrievedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Document" ADD COLUMN "supersededAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "withdrawnNote" TEXT;

-- CreateTable
CREATE TABLE "ReferenceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "contentHash" TEXT,
    "latestYear" INTEGER,
    "documentId" TEXT,
    "url" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceCheck_linkId_key" ON "ReferenceCheck"("linkId");
