-- Moves the old flat InvestmentHolding rows into the parcel model before the
-- table is dropped, so nothing already recorded is lost.
--
-- Each holding becomes a Security (one per code, shared) plus one parcel. A
-- holding that also carried disposal details becomes a disposal fully
-- allocated against that parcel, which is exactly what the old single-row
-- shape could represent.

-- 1. One Security per distinct code, classified from its account's type.
INSERT INTO "Security" ("id", "code", "assetClass", "priceSource", "currency", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  h."code",
  CASE ia."accountType"
    WHEN 'SHARES' THEN 'SHARE'
    WHEN 'ETF' THEN 'ETF'
    WHEN 'MANAGED_FUND' THEN 'MANAGED_FUND'
    WHEN 'BOND' THEN 'BOND'
    ELSE 'OTHER'
  END,
  'MANUAL',
  'AUD',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "code", "investmentAccountId" FROM "InvestmentHolding") h
JOIN "InvestmentAccount" ia ON ia."id" = h."investmentAccountId"
WHERE NOT EXISTS (SELECT 1 FROM "Security" s WHERE s."code" = h."code");

-- 2. One parcel per holding. Where a total cost base was recorded it is
-- preserved exactly by deriving the unit price back out of it, rather than
-- trusting purchasePrice and silently changing the recorded cost base.
INSERT INTO "InvestmentParcel" (
  "id", "investmentAccountId", "securityId", "acquisitionDate", "quantity",
  "unitPrice", "brokerage", "acquisitionType", "notes", "createdAt", "updatedAt"
)
SELECT
  'parcel_' || h."id",
  h."investmentAccountId",
  s."id",
  COALESCE(h."acquisitionDate", 0),
  COALESCE(h."quantity", 0),
  CASE
    WHEN h."costBase" IS NOT NULL AND COALESCE(h."quantity", 0) > 0
      THEN (h."costBase" - COALESCE(h."brokerage", 0)) / h."quantity"
    ELSE COALESCE(h."purchasePrice", 0)
  END,
  COALESCE(h."brokerage", 0),
  'PURCHASE',
  TRIM(
    COALESCE(h."notes", '') ||
    CASE WHEN h."acquisitionDate" IS NULL THEN ' [Imported from the earlier holdings model with no acquisition date — please set it, as the CGT discount depends on it.]' ELSE '' END ||
    CASE WHEN h."quantity" IS NULL THEN ' [Imported with no quantity recorded — please set it.]' ELSE '' END
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InvestmentHolding" h
JOIN "Security" s ON s."code" = h."code";

-- 3. Holdings that recorded a sale become a disposal against that parcel.
-- salePrice is read as a per-unit price, matching purchasePrice beside it.
INSERT INTO "InvestmentDisposal" (
  "id", "investmentAccountId", "securityId", "disposalDate", "quantity",
  "unitPrice", "brokerage", "method", "notes", "createdAt", "updatedAt"
)
SELECT
  'disposal_' || h."id",
  h."investmentAccountId",
  s."id",
  h."disposalDate",
  COALESCE(h."quantity", 0),
  COALESCE(h."salePrice", 0),
  0,
  'SPECIFIC',
  '[Imported from the earlier holdings model. The old model did not say whether the sale price was per unit or a total; it has been read as per unit — please check it.]',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InvestmentHolding" h
JOIN "Security" s ON s."code" = h."code"
WHERE h."disposalDate" IS NOT NULL;

-- 4. Each imported disposal draws its full quantity from its own parcel.
INSERT INTO "DisposalAllocation" ("id", "disposalId", "parcelId", "quantity")
SELECT
  'alloc_' || h."id",
  'disposal_' || h."id",
  'parcel_' || h."id",
  COALESCE(h."quantity", 0)
FROM "InvestmentHolding" h
WHERE h."disposalDate" IS NOT NULL;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "InvestmentHolding";
PRAGMA foreign_keys=on;
