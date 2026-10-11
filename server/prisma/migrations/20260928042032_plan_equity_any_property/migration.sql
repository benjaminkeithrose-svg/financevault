-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanEquityDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planPropertyId" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "interestRate" REAL,
    "sourceAssetId" TEXT,
    "sourceCommercialPropertyId" TEXT,
    "liabilityId" TEXT,
    "drawnDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanEquityDraw_planPropertyId_fkey" FOREIGN KEY ("planPropertyId") REFERENCES "PlanProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEquityDraw_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanEquityDraw_sourceCommercialPropertyId_fkey" FOREIGN KEY ("sourceCommercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanEquityDraw_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanEquityDraw" ("amount", "createdAt", "drawnDate", "id", "interestRate", "liabilityId", "notes", "planPropertyId", "sourceCommercialPropertyId", "yearNumber") SELECT "amount", "createdAt", "drawnDate", "id", "interestRate", "liabilityId", "notes", "planPropertyId", "sourceCommercialPropertyId", "yearNumber" FROM "PlanEquityDraw";
DROP TABLE "PlanEquityDraw";
ALTER TABLE "new_PlanEquityDraw" RENAME TO "PlanEquityDraw";
CREATE INDEX "PlanEquityDraw_planPropertyId_idx" ON "PlanEquityDraw"("planPropertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Existing draws from a commercial property: point them at its asset.
UPDATE "PlanEquityDraw"
SET "sourceAssetId" = (SELECT "assetId" FROM "CommercialProperty" WHERE "CommercialProperty"."id" = "PlanEquityDraw"."sourceCommercialPropertyId")
WHERE "sourceCommercialPropertyId" IS NOT NULL;
