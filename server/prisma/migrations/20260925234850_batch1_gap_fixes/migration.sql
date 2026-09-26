-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "capitalWorksClaimed" REAL;

-- AlterTable
ALTER TABLE "Liability" ADD COLUMN "startDate" DATETIME;

-- AlterTable
ALTER TABLE "PayPeriodEntry" ADD COLUMN "superPaid" BOOLEAN;

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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanProperty_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanProperty_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanProperty" ("acquisitionYearNumber", "commercialPropertyId", "createdAt", "id", "initialLvr", "initialRent", "name", "notes", "planId", "purchasePrice") SELECT "acquisitionYearNumber", "commercialPropertyId", "createdAt", "id", "initialLvr", "initialRent", "name", "notes", "planId", "purchasePrice" FROM "PlanProperty";
DROP TABLE "PlanProperty";
ALTER TABLE "new_PlanProperty" RENAME TO "PlanProperty";
CREATE UNIQUE INDEX "PlanProperty_commercialPropertyId_key" ON "PlanProperty"("commercialPropertyId");
CREATE INDEX "PlanProperty_planId_idx" ON "PlanProperty"("planId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
