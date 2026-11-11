-- Getting started: "What do you have?" and skipped steps.
ALTER TABLE "Settings" ADD COLUMN "setupHaveDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "setupSkipped" TEXT;

-- A vault that already has records has been set up: don't bring the
-- checklist back for the new steps.
UPDATE "Settings" SET "setupHaveDone" = true WHERE EXISTS (SELECT 1 FROM "Asset");
UPDATE "Settings" SET "setupSkipped" = '["reports"]' WHERE EXISTS (SELECT 1 FROM "Asset") AND EXISTS (SELECT 1 FROM "Liability");
