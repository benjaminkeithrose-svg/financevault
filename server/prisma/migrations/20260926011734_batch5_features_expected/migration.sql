-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "featuresOff" TEXT;

-- CreateTable
CREATE TABLE "ExpectationDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpectationDismissal_key_key" ON "ExpectationDismissal"("key");
