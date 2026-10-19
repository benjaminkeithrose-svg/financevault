-- AlterTable
ALTER TABLE "Property" ADD COLUMN "use" TEXT;

-- Properties already marked as the family home become "HOME".
UPDATE "Property" SET "use" = 'HOME' WHERE "assetId" IN (SELECT "id" FROM "Asset" WHERE "mainResidence" = 'FULL');
