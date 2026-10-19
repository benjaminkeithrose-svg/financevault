-- AlterTable
ALTER TABLE "Document" ADD COLUMN "referenceFolder" TEXT;
ALTER TABLE "Document" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- "Save the ZIP for Claude" starts switched off, in every copy: add it to
-- the switched-off features where a list has been saved (a copy with no
-- list yet counts it as off already).
UPDATE "Settings" SET "featuresOff" = json_insert("featuresOff", '$[#]', 'reference-zip')
WHERE "featuresOff" IS NOT NULL AND json_valid("featuresOff") AND "featuresOff" NOT LIKE '%reference-zip%';
