-- AlterTable
ALTER TABLE "Liability" ADD COLUMN "balanceAsAt" DATETIME;

-- CreateTable
CREATE TABLE "LoanReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "asAt" DATETIME NOT NULL,
    "interestRate" REAL,
    "balance" REAL,
    "repayment" REAL,
    "repaymentFrequency" TEXT,
    "source" TEXT NOT NULL,
    "documentId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanReading_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanReading_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LoanReading_liabilityId_asAt_idx" ON "LoanReading"("liabilityId", "asAt");
