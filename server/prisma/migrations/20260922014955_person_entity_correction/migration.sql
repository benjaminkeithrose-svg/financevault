-- AlterTable
ALTER TABLE "Entity" ADD COLUMN "establishmentDate" DATETIME;

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "tfn" TEXT,
    "contactInfo" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PersonEntityRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "ownershipPercent" REAL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonEntityRelationship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonEntityRelationship_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "ownerEntityId" TEXT NOT NULL,
    "ownershipPercent" REAL NOT NULL,
    "ownershipType" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetOwnership_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetOwnership_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "PersonEntityRelationship_personId_idx" ON "PersonEntityRelationship"("personId");

-- CreateIndex
CREATE INDEX "PersonEntityRelationship_entityId_idx" ON "PersonEntityRelationship"("entityId");

-- CreateIndex
CREATE INDEX "AssetOwnership_assetId_idx" ON "AssetOwnership"("assetId");

-- CreateIndex
CREATE INDEX "AssetOwnership_ownerEntityId_idx" ON "AssetOwnership"("ownerEntityId");
