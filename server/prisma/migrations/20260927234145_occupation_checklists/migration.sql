-- AlterTable
ALTER TABLE "Person" ADD COLUMN "occupationGuide" TEXT;

-- AlterTable
ALTER TABLE "WorkDeduction" ADD COLUMN "checklistItem" TEXT;

-- CreateTable
CREATE TABLE "OccupationItemChoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OccupationItemChoice_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OccupationItemChoice_personId_itemKey_key" ON "OccupationItemChoice"("personId", "itemKey");
