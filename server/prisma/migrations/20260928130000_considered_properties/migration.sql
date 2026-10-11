-- Properties being considered or passed on: every existing asset is owned.
ALTER TABLE "Asset" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OWNED';
ALTER TABLE "Asset" ADD COLUMN "pipelineStage" TEXT;
ALTER TABLE "Asset" ADD COLUMN "askingPrice" REAL;
ALTER TABLE "Asset" ADD COLUMN "passedOnAt" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "passedOnReason" TEXT;
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- Suburb, kind and title type (for the due diligence checklist).
ALTER TABLE "Property" ADD COLUMN "suburb" TEXT;
ALTER TABLE "Property" ADD COLUMN "kind" TEXT;
ALTER TABLE "Property" ADD COLUMN "titleType" TEXT;
ALTER TABLE "CommercialProperty" ADD COLUMN "suburb" TEXT;
ALTER TABLE "CommercialProperty" ADD COLUMN "titleType" TEXT;
