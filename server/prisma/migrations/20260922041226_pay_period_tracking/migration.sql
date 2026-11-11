-- AlterTable
ALTER TABLE "Person" ADD COLUMN "payFrequency" TEXT;

-- CreateTable
CREATE TABLE "PayPeriodEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "documentId" TEXT,
    "amount" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayPeriodEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayPeriodEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayPeriodEntry_personId_idx" ON "PayPeriodEntry"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriodEntry_personId_periodStart_key" ON "PayPeriodEntry"("personId", "periodStart");
