-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "identifier" TEXT;
ALTER TABLE "Asset" ADD COLUMN "make" TEXT;
ALTER TABLE "Asset" ADD COLUMN "model" TEXT;
ALTER TABLE "Asset" ADD COLUMN "registration" TEXT;
ALTER TABLE "Asset" ADD COLUMN "registrationExpiry" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "vehicleType" TEXT;
ALTER TABLE "Asset" ADD COLUMN "year" INTEGER;

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
    CONSTRAINT "Liability_securityAssetId_fkey" FOREIGN KEY ("securityAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Liability" ("createdAt", "currentBalance", "entityId", "establishmentFees", "fixedPeriodEnds", "id", "interestOnly", "interestRate", "lender", "liabilityType", "loanFees", "loanTermYears", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "repaymentFrequency", "securityCommercialPropertyId", "securityPropertyId", "updatedAt", "valuationFees") SELECT "createdAt", "currentBalance", "entityId", "establishmentFees", "fixedPeriodEnds", "id", "interestOnly", "interestRate", "lender", "liabilityType", "loanFees", "loanTermYears", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "repaymentFrequency", "securityCommercialPropertyId", "securityPropertyId", "updatedAt", "valuationFees" FROM "Liability";
DROP TABLE "Liability";
ALTER TABLE "new_Liability" RENAME TO "Liability";
CREATE INDEX "Liability_entityId_idx" ON "Liability"("entityId");
CREATE INDEX "Liability_securityAssetId_idx" ON "Liability"("securityAssetId");
CREATE INDEX "Liability_securityCommercialPropertyId_idx" ON "Liability"("securityCommercialPropertyId");
CREATE TABLE "new_NetWorthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asAtDate" DATETIME NOT NULL,
    "entityId" TEXT,
    "cash" REAL NOT NULL,
    "propertyValue" REAL NOT NULL,
    "investmentValue" REAL NOT NULL,
    "superValue" REAL NOT NULL,
    "vehicleValue" REAL NOT NULL,
    "otherAssets" REAL NOT NULL,
    "totalAssets" REAL NOT NULL,
    "mortgages" REAL NOT NULL,
    "creditCards" REAL NOT NULL,
    "personalLoans" REAL NOT NULL,
    "vehicleLoans" REAL NOT NULL DEFAULT 0,
    "otherLiabilities" REAL NOT NULL,
    "totalLiabilities" REAL NOT NULL,
    "netPosition" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetWorthSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NetWorthSnapshot" ("asAtDate", "cash", "createdAt", "creditCards", "entityId", "id", "investmentValue", "mortgages", "netPosition", "notes", "otherAssets", "otherLiabilities", "personalLoans", "propertyValue", "superValue", "totalAssets", "totalLiabilities", "vehicleValue") SELECT "asAtDate", "cash", "createdAt", "creditCards", "entityId", "id", "investmentValue", "mortgages", "netPosition", "notes", "otherAssets", "otherLiabilities", "personalLoans", "propertyValue", "superValue", "totalAssets", "totalLiabilities", "vehicleValue" FROM "NetWorthSnapshot";
DROP TABLE "NetWorthSnapshot";
ALTER TABLE "new_NetWorthSnapshot" RENAME TO "NetWorthSnapshot";
CREATE INDEX "NetWorthSnapshot_entityId_idx" ON "NetWorthSnapshot"("entityId");
CREATE INDEX "NetWorthSnapshot_asAtDate_idx" ON "NetWorthSnapshot"("asAtDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
