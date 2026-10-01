-- CreateTable
CREATE TABLE "CommercialProperty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT,
    "postcode" TEXT,
    "propertyTypes" TEXT NOT NULL,
    "ownershipPercent" REAL,
    "purchaseDate" DATETIME,
    "settlementDate" DATETIME,
    "purchasePrice" REAL,
    "valuationDate" DATETIME,
    "valuer" TEXT,
    "buildingArea" REAL,
    "landArea" REAL,
    "areaUnit" TEXT,
    "numberOfTenancies" INTEGER,
    "numberOfBuildings" INTEGER,
    "carSpaces" INTEGER,
    "zoning" TEXT,
    "constructionType" TEXT,
    "yearBuilt" INTEGER,
    "refurbishmentDate" DATETIME,
    "nla" REAL,
    "gla" REAL,
    "siteArea" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommercialProperty_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommercialProperty_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialPropertyId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantLegalName" TEXT,
    "tradingName" TEXT,
    "contactDetails" TEXT,
    "leaseCommencement" DATETIME,
    "leaseExpiry" DATETIME,
    "optionPeriods" TEXT,
    "rentCommencement" DATETIME,
    "currentBaseRent" REAL,
    "rentFrequency" TEXT,
    "rentPerAnnum" REAL,
    "rentPerSqm" REAL,
    "nlaOccupied" REAL,
    "securityDeposit" REAL,
    "bankGuarantee" REAL,
    "bond" REAL,
    "incentives" TEXT,
    "rentFreeMonths" REAL,
    "reviewMechanism" TEXT,
    "reviewPercentage" REAL,
    "nextRentReview" DATETIME,
    "cpiLinked" BOOLEAN,
    "outgoingsArrangement" TEXT,
    "gstTreatment" TEXT,
    "leaseStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tenancy_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RentReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenancyId" TEXT NOT NULL,
    "reviewDate" DATETIME NOT NULL,
    "reviewMechanism" TEXT,
    "previousRent" REAL,
    "newRent" REAL,
    "actualVsExpected" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RentReview_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutgoingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialPropertyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "supplier" TEXT,
    "amount" REAL NOT NULL,
    "gst" REAL,
    "tenancyId" TEXT,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "recoveryPercent" REAL,
    "recoveredAmount" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutgoingRecord_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutgoingRecord_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalExpenditureItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialPropertyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "gst" REAL,
    "usefulLifeYears" REAL,
    "depreciationInfo" TEXT,
    "taxTreatmentStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapitalExpenditureItem_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OccupancySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialPropertyId" TEXT NOT NULL,
    "asAtDate" DATETIME NOT NULL,
    "totalNla" REAL NOT NULL,
    "occupiedNla" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OccupancySnapshot_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnnualPropertySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialPropertyId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "propertyValue" REAL,
    "debt" REAL,
    "equity" REAL,
    "rent" REAL,
    "recoveries" REAL,
    "operatingExpenses" REAL,
    "noi" REAL,
    "interest" REAL,
    "principal" REAL,
    "cashFlow" REAL,
    "capRate" REAL,
    "grossYield" REAL,
    "netYield" REAL,
    "lvr" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTUAL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnnualPropertySnapshot_commercialPropertyId_fkey" FOREIGN KEY ("commercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnualPropertySnapshot_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    CONSTRAINT "Liability_securityCommercialPropertyId_fkey" FOREIGN KEY ("securityCommercialPropertyId") REFERENCES "CommercialProperty" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Liability" ("createdAt", "currentBalance", "entityId", "fixedPeriodEnds", "id", "interestRate", "lender", "liabilityType", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "securityPropertyId", "updatedAt") SELECT "createdAt", "currentBalance", "entityId", "fixedPeriodEnds", "id", "interestRate", "lender", "liabilityType", "loanType", "maturityDate", "name", "notes", "originalAmount", "repaymentAmount", "securityPropertyId", "updatedAt" FROM "Liability";
DROP TABLE "Liability";
ALTER TABLE "new_Liability" RENAME TO "Liability";
CREATE INDEX "Liability_entityId_idx" ON "Liability"("entityId");
CREATE INDEX "Liability_securityCommercialPropertyId_idx" ON "Liability"("securityCommercialPropertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CommercialProperty_assetId_key" ON "CommercialProperty"("assetId");

-- CreateIndex
CREATE INDEX "CommercialProperty_entityId_idx" ON "CommercialProperty"("entityId");

-- CreateIndex
CREATE INDEX "Tenancy_commercialPropertyId_idx" ON "Tenancy"("commercialPropertyId");

-- CreateIndex
CREATE INDEX "RentReview_tenancyId_idx" ON "RentReview"("tenancyId");

-- CreateIndex
CREATE INDEX "OutgoingRecord_commercialPropertyId_idx" ON "OutgoingRecord"("commercialPropertyId");

-- CreateIndex
CREATE INDEX "OutgoingRecord_tenancyId_idx" ON "OutgoingRecord"("tenancyId");

-- CreateIndex
CREATE INDEX "CapitalExpenditureItem_commercialPropertyId_idx" ON "CapitalExpenditureItem"("commercialPropertyId");

-- CreateIndex
CREATE INDEX "OccupancySnapshot_commercialPropertyId_idx" ON "OccupancySnapshot"("commercialPropertyId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualPropertySnapshot_commercialPropertyId_financialYearId_key" ON "AnnualPropertySnapshot"("commercialPropertyId", "financialYearId");
