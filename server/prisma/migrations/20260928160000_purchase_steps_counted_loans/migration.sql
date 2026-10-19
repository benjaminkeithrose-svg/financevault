-- Buying a considered property, step by step.
CREATE TABLE "PurchaseStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneAt" DATETIME,
    "amount" REAL,
    "date" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseStep_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseStep_assetId_key_key" ON "PurchaseStep"("assetId", "key");

-- Loans approved for a property still being bought aren't counted until
-- settlement. Every existing loan is counted.
ALTER TABLE "Liability" ADD COLUMN "counted" BOOLEAN NOT NULL DEFAULT true;
