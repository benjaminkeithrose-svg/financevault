-- CreateTable
CREATE TABLE "DueDiligenceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHECK',
    "group" TEXT,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "findings" TEXT,
    "cost" REAL,
    "who" TEXT,
    "dueDate" DATETIME,
    "reminderId" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "problem" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DueDiligenceCheck_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DueDiligenceCheck_assetId_key_key" ON "DueDiligenceCheck"("assetId", "key");

