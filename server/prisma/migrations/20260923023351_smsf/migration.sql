-- AlterTable
ALTER TABLE "Property" ADD COLUMN "weeklyRent" REAL;

-- CreateTable
CREATE TABLE "SmsfDetails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "trusteeType" TEXT,
    "corporateTrusteeId" TEXT,
    "auditorName" TEXT,
    "auditorNumber" TEXT,
    "lodgedBy" TEXT,
    "lastReturnLodged" TEXT,
    "returnDueDate" DATETIME,
    "strategyReviewedOn" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsfDetails_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmsfDetails_corporateTrusteeId_fkey" FOREIGN KEY ("corporateTrusteeId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsfMemberYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "closingBalance" REAL NOT NULL,
    "taxFreeComponent" REAL,
    "totalSuperBalance" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsfMemberYear_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SmsfMemberYear_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SuperContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "paidIntoOtherFund" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuperContribution_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SuperContribution_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsfPension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "startBalance" REAL NOT NULL,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsfPension_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SmsfPension_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsfPensionBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pensionId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "openingBalance" REAL NOT NULL,
    CONSTRAINT "SmsfPensionBalance_pensionId_fkey" FOREIGN KEY ("pensionId") REFERENCES "SmsfPension" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsfPensionPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pensionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsfPensionPayment_pensionId_fkey" FOREIGN KEY ("pensionId") REFERENCES "SmsfPension" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Liability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "liabilityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lender" TEXT,
    "originalAmount" REAL,
    "currentBalance" REAL,
    "interestRate" REAL,
    "loanType" TEXT,
    "fixedPeriodEnds" DATETIME,
    "repaymentAmount" REAL,
    "maturityDate" DATETIME,
    "securityPropertyId" TEXT,
    "securityCommercialPropertyId" TEXT,
    "securityAssetId" TEXT,
    "creditLimit" REAL,
    "holdingTrustEntityId" TEXT,
    "interestOnly" BOOLEAN,
    "loanTermYears" REAL,
    "repaymentFrequency" TEXT,
    "loanFees" REAL,
    "establishmentFees" REAL,
    "valuationFees" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liability_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Liability_securityPropertyId_fkey" FOREIGN KEY ("securityPropertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_securityCommercialPropertyId_fkey" FOREIGN KEY ("securityCommercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_securityAssetId_fkey" FOREIGN KEY ("securityAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_holdingTrustEntityId_fkey" FOREIGN KEY ("holdingTrustEntityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Liability" ("createdAt", "creditLimit", "currentBalance", "entityId", "establishmentFees", "fixedPeriodEnds", "id", "interestOnly", "interestRate", "lender", "liabilityType", "loanFees", "loanTermYears", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "repaymentFrequency", "securityAssetId", "securityCommercialPropertyId", "securityPropertyId", "updatedAt", "valuationFees") SELECT "createdAt", "creditLimit", "currentBalance", "entityId", "establishmentFees", "fixedPeriodEnds", "id", "interestOnly", "interestRate", "lender", "liabilityType", "loanFees", "loanTermYears", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "repaymentFrequency", "securityAssetId", "securityCommercialPropertyId", "securityPropertyId", "updatedAt", "valuationFees" FROM "Liability";
DROP TABLE "Liability";
ALTER TABLE "new_Liability" RENAME TO "Liability";
CREATE INDEX "Liability_entityId_idx" ON "Liability"("entityId");
CREATE INDEX "Liability_securityAssetId_idx" ON "Liability"("securityAssetId");
CREATE INDEX "Liability_securityCommercialPropertyId_idx" ON "Liability"("securityCommercialPropertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SmsfDetails_entityId_key" ON "SmsfDetails"("entityId");

-- CreateIndex
CREATE INDEX "SmsfMemberYear_personId_idx" ON "SmsfMemberYear"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsfMemberYear_fundId_personId_fyLabel_key" ON "SmsfMemberYear"("fundId", "personId", "fyLabel");

-- CreateIndex
CREATE INDEX "SuperContribution_fundId_idx" ON "SuperContribution"("fundId");

-- CreateIndex
CREATE INDEX "SuperContribution_personId_date_idx" ON "SuperContribution"("personId", "date");

-- CreateIndex
CREATE INDEX "SmsfPension_fundId_idx" ON "SmsfPension"("fundId");

-- CreateIndex
CREATE INDEX "SmsfPension_personId_idx" ON "SmsfPension"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsfPensionBalance_pensionId_fyLabel_key" ON "SmsfPensionBalance"("pensionId", "fyLabel");

-- CreateIndex
CREATE INDEX "SmsfPensionPayment_pensionId_date_idx" ON "SmsfPensionPayment"("pensionId", "date");
