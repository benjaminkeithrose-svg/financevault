-- CreateTable
CREATE TABLE "PropertyAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "price" REAL,
    "lvrPercent" REAL,
    "stampDuty" REAL,
    "otherCosts" REAL,
    "repaymentType" TEXT NOT NULL DEFAULT 'IO',
    "loanTermYears" INTEGER,
    "advertisedYieldPercent" REAL,
    "expectedVacancyWeeks" REAL,
    "expectedRatePercent" REAL,
    "conservativeRent" REAL,
    "conservativeVacancyWeeks" REAL,
    "conservativeCosts" REAL,
    "conservativeRatePercent" REAL,
    "badRent" REAL,
    "badVacancyWeeks" REAL,
    "badCosts" REAL,
    "badRatePercent" REAL,
    "frozenAt" DATETIME,
    "snapshot" TEXT,
    "corrections" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyAssessment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PropertyAssessment_assetId_idx" ON "PropertyAssessment"("assetId");

