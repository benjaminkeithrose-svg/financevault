-- CreateTable
CREATE TABLE "PropertyProfitYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "rent" REAL NOT NULL,
    "costs" REAL NOT NULL,
    "interest" REAL NOT NULL,
    "depreciation" REAL NOT NULL DEFAULT 0,
    "taxResult" REAL NOT NULL,
    "cashBeforeTax" REAL NOT NULL,
    "cashAfterTax" REAL,
    "value" REAL,
    "source" TEXT NOT NULL,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyProfitYear_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyProfitYear_assetId_fyLabel_key" ON "PropertyProfitYear"("assetId", "fyLabel");
