-- CreateTable
CREATE TABLE "PortfolioPlan" (
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortfolioPlan_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PortfolioPlan_startFinancialYearId_fkey" FOREIGN KEY ("startFinancialYearId") REFERENCES "FinancialYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanProperty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acquisitionYearNumber" INTEGER NOT NULL,
    "purchasePrice" REAL NOT NULL,
    "initialLvr" REAL NOT NULL,
    "initialRent" REAL,
    "commercialPropertyId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanProperty_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanProperty_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanRefinance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planPropertyId" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "targetLvr" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanRefinance_planPropertyId_fkey" FOREIGN KEY ("planPropertyId") REFERENCES "PlanProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PortfolioPlan_entityId_idx" ON "PortfolioPlan"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanProperty_commercialPropertyId_key" ON "PlanProperty"("commercialPropertyId");

-- CreateIndex
CREATE INDEX "PlanProperty_planId_idx" ON "PlanProperty"("planId");

-- CreateIndex
CREATE INDEX "PlanRefinance_planPropertyId_idx" ON "PlanRefinance"("planPropertyId");
