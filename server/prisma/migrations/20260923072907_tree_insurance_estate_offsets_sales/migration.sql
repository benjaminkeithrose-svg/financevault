-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "buyingCosts" REAL;
ALTER TABLE "Asset" ADD COLUMN "improvementsCost" REAL;
ALTER TABLE "Asset" ADD COLUMN "mainResidence" TEXT;
ALTER TABLE "Asset" ADD COLUMN "mainResidencePercent" REAL;
ALTER TABLE "Asset" ADD COLUMN "sellingCosts" REAL;

-- CreateTable
CREATE TABLE "AccountOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "ownerEntityId" TEXT NOT NULL,
    "ownershipPercent" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountOwnership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountOwnership_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentAccountOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentAccountId" TEXT NOT NULL,
    "ownerEntityId" TEXT NOT NULL,
    "ownershipPercent" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentAccountOwnership_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "InvestmentAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentAccountOwnership_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "insurer" TEXT,
    "policyNumber" TEXT,
    "coverAmount" REAL,
    "premium" REAL,
    "premiumFrequency" TEXT,
    "renewalDate" DATETIME,
    "assetId" TEXT,
    "personId" TEXT,
    "entityId" TEXT,
    "heldInSuper" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsurancePolicy_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InsurancePolicy_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InsurancePolicy_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstateDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "signedDate" DATETIME,
    "expiryDate" DATETIME,
    "reviewDate" DATETIME,
    "heldBy" TEXT,
    "fundEntityId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EstateDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstateDocument_fundEntityId_fkey" FOREIGN KEY ("fundEntityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institution" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "bsb" TEXT,
    "entityId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "openingBalance" REAL,
    "currentBalance" REAL,
    "offsetForLiabilityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Account_offsetForLiabilityId_fkey" FOREIGN KEY ("offsetForLiabilityId") REFERENCES "Liability" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accountName", "accountNumber", "accountType", "bsb", "createdAt", "currency", "currentBalance", "entityId", "id", "institution", "openingBalance", "updatedAt") SELECT "accountName", "accountNumber", "accountType", "bsb", "createdAt", "currency", "currentBalance", "entityId", "id", "institution", "openingBalance", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_entityId_idx" ON "Account"("entityId");
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "allowExternalAiProcessing" BOOLEAN NOT NULL DEFAULT false,
    "defaultLandingPage" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "customStorageDir" TEXT,
    "allowPriceLookups" BOOLEAN NOT NULL DEFAULT false,
    "privacyCleanupVersion" INTEGER NOT NULL DEFAULT 0,
    "lastBackupAt" DATETIME,
    "checklistDismissed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Settings" ("allowExternalAiProcessing", "allowPriceLookups", "customStorageDir", "defaultLandingPage", "id", "privacyCleanupVersion") SELECT "allowExternalAiProcessing", "allowPriceLookups", "customStorageDir", "defaultLandingPage", "id", "privacyCleanupVersion" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AccountOwnership_accountId_idx" ON "AccountOwnership"("accountId");

-- CreateIndex
CREATE INDEX "AccountOwnership_ownerEntityId_idx" ON "AccountOwnership"("ownerEntityId");

-- CreateIndex
CREATE INDEX "InvestmentAccountOwnership_investmentAccountId_idx" ON "InvestmentAccountOwnership"("investmentAccountId");

-- CreateIndex
CREATE INDEX "InvestmentAccountOwnership_ownerEntityId_idx" ON "InvestmentAccountOwnership"("ownerEntityId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_assetId_idx" ON "InsurancePolicy"("assetId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_personId_idx" ON "InsurancePolicy"("personId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_entityId_idx" ON "InsurancePolicy"("entityId");

-- CreateIndex
CREATE INDEX "EstateDocument_personId_idx" ON "EstateDocument"("personId");
