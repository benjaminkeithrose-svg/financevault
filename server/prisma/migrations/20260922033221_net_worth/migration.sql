-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
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
    "otherLiabilities" REAL NOT NULL,
    "totalLiabilities" REAL NOT NULL,
    "netPosition" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetWorthSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_entityId_idx" ON "NetWorthSnapshot"("entityId");

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_asAtDate_idx" ON "NetWorthSnapshot"("asAtDate");
