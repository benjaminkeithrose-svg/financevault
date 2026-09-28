-- CreateTable
CREATE TABLE "PlanHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanHolding_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanHolding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanProperty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acquisitionYearNumber" INTEGER NOT NULL,
    "purchasePrice" REAL NOT NULL,
    "initialLvr" REAL NOT NULL,
    "initialRent" REAL,
    "transferDuty" REAL,
    "otherBuyingCosts" REAL,
    "gstPayable" BOOLEAN NOT NULL DEFAULT false,
    "commercialPropertyId" TEXT,
    "assetId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanProperty_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanProperty_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanProperty_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanProperty" ("acquisitionYearNumber", "commercialPropertyId", "createdAt", "gstPayable", "id", "initialLvr", "initialRent", "name", "notes", "otherBuyingCosts", "planId", "purchasePrice", "transferDuty") SELECT "acquisitionYearNumber", "commercialPropertyId", "createdAt", "gstPayable", "id", "initialLvr", "initialRent", "name", "notes", "otherBuyingCosts", "planId", "purchasePrice", "transferDuty" FROM "PlanProperty";
DROP TABLE "PlanProperty";
ALTER TABLE "new_PlanProperty" RENAME TO "PlanProperty";
CREATE UNIQUE INDEX "PlanProperty_commercialPropertyId_key" ON "PlanProperty"("commercialPropertyId");
CREATE INDEX "PlanProperty_planId_idx" ON "PlanProperty"("planId");
CREATE TABLE "new_PortfolioPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "startFinancialYearId" TEXT NOT NULL,
    "projectionYears" INTEGER NOT NULL DEFAULT 10,
    "interestRate" REAL NOT NULL,
    "rentalGrowthRate" REAL NOT NULL,
    "capRate" REAL NOT NULL,
    "annualContribution" REAL NOT NULL DEFAULT 0,
    "refinanceLvrTarget" REAL NOT NULL,
    "depositPercent" REAL NOT NULL DEFAULT 0.3,
    "startingCash" REAL NOT NULL DEFAULT 0,
    "basePlanId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortfolioPlan_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PortfolioPlan_startFinancialYearId_fkey" FOREIGN KEY ("startFinancialYearId") REFERENCES "FinancialYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PortfolioPlan_basePlanId_fkey" FOREIGN KEY ("basePlanId") REFERENCES "PortfolioPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PortfolioPlan" ("annualContribution", "capRate", "createdAt", "depositPercent", "entityId", "id", "interestRate", "name", "notes", "projectionYears", "refinanceLvrTarget", "rentalGrowthRate", "startFinancialYearId", "updatedAt") SELECT "annualContribution", "capRate", "createdAt", "depositPercent", "entityId", "id", "interestRate", "name", "notes", "projectionYears", "refinanceLvrTarget", "rentalGrowthRate", "startFinancialYearId", "updatedAt" FROM "PortfolioPlan";
DROP TABLE "PortfolioPlan";
ALTER TABLE "new_PortfolioPlan" RENAME TO "PortfolioPlan";
CREATE INDEX "PortfolioPlan_entityId_idx" ON "PortfolioPlan"("entityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlanHolding_assetId_idx" ON "PlanHolding"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanHolding_planId_assetId_key" ON "PlanHolding"("planId", "assetId");

-- Purchases already linked to a commercial property: link them to its asset too.
UPDATE "PlanProperty"
SET "assetId" = (SELECT "assetId" FROM "CommercialProperty" WHERE "CommercialProperty"."id" = "PlanProperty"."commercialPropertyId")
WHERE "commercialPropertyId" IS NOT NULL;
