-- CreateTable
CREATE TABLE "PersonRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonRelationship_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonRelationship_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdentityRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "issuer" TEXT,
    "number" TEXT,
    "referenceNumber" TEXT,
    "issueDate" DATETIME,
    "expiryDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IdentityRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" REAL,
    "provider" TEXT,
    "nextDueDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "acquisitionDate" DATETIME,
    "acquisitionCost" REAL,
    "currentValue" REAL,
    "valuationDate" DATETIME,
    "disposalDate" DATETIME,
    "disposalValue" REAL,
    "depreciationInfo" TEXT,
    "notes" TEXT,
    "vehicleType" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "registration" TEXT,
    "registrationExpiry" DATETIME,
    "identifier" TEXT,
    "parentAssetId" TEXT,
    "itemCategory" TEXT,
    "warrantyExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("acquisitionCost", "acquisitionDate", "assetType", "createdAt", "currentValue", "depreciationInfo", "disposalDate", "disposalValue", "entityId", "id", "identifier", "make", "model", "name", "notes", "registration", "registrationExpiry", "updatedAt", "valuationDate", "vehicleType", "year") SELECT "acquisitionCost", "acquisitionDate", "assetType", "createdAt", "currentValue", "depreciationInfo", "disposalDate", "disposalValue", "entityId", "id", "identifier", "make", "model", "name", "notes", "registration", "registrationExpiry", "updatedAt", "valuationDate", "vehicleType", "year" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_entityId_idx" ON "Asset"("entityId");
CREATE INDEX "Asset_assetType_idx" ON "Asset"("assetType");
CREATE INDEX "Asset_parentAssetId_idx" ON "Asset"("parentAssetId");
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "tfn" TEXT,
    "contactInfo" TEXT,
    "notes" TEXT,
    "payFrequency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "entityId" TEXT,
    CONSTRAINT "Person_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("contactInfo", "createdAt", "dateOfBirth", "id", "name", "notes", "payFrequency", "tfn", "updatedAt") SELECT "contactInfo", "createdAt", "dateOfBirth", "id", "name", "notes", "payFrequency", "tfn", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE UNIQUE INDEX "Person_entityId_key" ON "Person"("entityId");
CREATE INDEX "Person_name_idx" ON "Person"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PersonRelationship_toPersonId_idx" ON "PersonRelationship"("toPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelationship_fromPersonId_toPersonId_relationshipType_key" ON "PersonRelationship"("fromPersonId", "toPersonId", "relationshipType");

-- CreateIndex
CREATE INDEX "IdentityRecord_personId_idx" ON "IdentityRecord"("personId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_assetId_idx" ON "MaintenanceRecord"("assetId");
