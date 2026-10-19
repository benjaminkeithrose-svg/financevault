-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "lenderMaxLvr" REAL;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "referenceCheckBy" DATETIME;
ALTER TABLE "Document" ADD COLUMN "referenceCode" TEXT;

-- AlterTable
ALTER TABLE "Liability" ADD COLUMN "facility" TEXT;

-- CreateTable
CREATE TABLE "LoanPurpose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "date" DATETIME,
    "amount" REAL NOT NULL,
    "use" TEXT NOT NULL,
    "deductible" BOOLEAN NOT NULL,
    "assetId" TEXT,
    "description" TEXT NOT NULL,
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanPurpose_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanPurpose_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LoanPurpose_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanInterestYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "interestCharged" REAL NOT NULL,
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanInterestYear_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanInterestYear_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceDocumentId" TEXT,
    "referencePinpoint" TEXT,
    "accountantNote" TEXT,
    "accountantAgreedOn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimNote_referenceDocumentId_fkey" FOREIGN KEY ("referenceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LoanPurpose_liabilityId_idx" ON "LoanPurpose"("liabilityId");

-- CreateIndex
CREATE INDEX "LoanPurpose_assetId_idx" ON "LoanPurpose"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInterestYear_liabilityId_fyLabel_key" ON "LoanInterestYear"("liabilityId", "fyLabel");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimNote_targetType_targetId_key" ON "ClaimNote"("targetType", "targetId");
