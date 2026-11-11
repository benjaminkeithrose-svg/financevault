-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "ownershipReason" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "benefits" TEXT;
ALTER TABLE "Person" ADD COLUMN "carAllowance" REAL;
ALTER TABLE "Person" ADD COLUMN "employer" TEXT;
ALTER TABLE "Person" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "Person" ADD COLUMN "occupation" TEXT;

-- CreateTable
CREATE TABLE "WorkDeduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "quantity" REAL,
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkDeduction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkDeduction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncomeStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "employer" TEXT,
    "grossPayments" REAL NOT NULL,
    "taxWithheld" REAL,
    "allowances" REAL,
    "reportableFringeBenefits" REAL,
    "reportableSuper" REAL,
    "lumpSums" REAL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomeStatement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeStatement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkDeduction_personId_fyLabel_idx" ON "WorkDeduction"("personId", "fyLabel");

-- CreateIndex
CREATE INDEX "IncomeStatement_personId_fyLabel_idx" ON "IncomeStatement"("personId", "fyLabel");
