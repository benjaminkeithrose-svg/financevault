-- CreateTable
CREATE TABLE "PlanEquityDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planPropertyId" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "interestRate" REAL,
    "sourceCommercialPropertyId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanEquityDraw_planPropertyId_fkey" FOREIGN KEY ("planPropertyId") REFERENCES "PlanProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEquityDraw_sourceCommercialPropertyId_fkey" FOREIGN KEY ("sourceCommercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlanEquityDraw_planPropertyId_idx" ON "PlanEquityDraw"("planPropertyId");
