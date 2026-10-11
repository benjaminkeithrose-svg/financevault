-- CreateTable
CREATE TABLE "LiabilityOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "ownerEntityId" TEXT NOT NULL,
    "ownershipPercent" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiabilityOwnership_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiabilityOwnership_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LiabilityOwnership_liabilityId_idx" ON "LiabilityOwnership"("liabilityId");

-- CreateIndex
CREATE INDEX "LiabilityOwnership_ownerEntityId_idx" ON "LiabilityOwnership"("ownerEntityId");
