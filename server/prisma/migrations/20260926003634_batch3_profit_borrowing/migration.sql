-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "capitalWorksPerYear" REAL;
ALTER TABLE "Asset" ADD COLUMN "depreciationPerYear" REAL;
ALTER TABLE "Asset" ADD COLUMN "landTaxPerYear" REAL;
ALTER TABLE "Asset" ADD COLUMN "landValue" REAL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "grossSalary" REAL;
ALTER TABLE "Person" ADD COLUMN "variableIncome" REAL;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "councilRates" REAL;
ALTER TABLE "Property" ADD COLUMN "managementPercent" REAL;
ALTER TABLE "Property" ADD COLUMN "otherCostsPerYear" REAL;
ALTER TABLE "Property" ADD COLUMN "repairsPerYear" REAL;
ALTER TABLE "Property" ADD COLUMN "strataFees" REAL;
ALTER TABLE "Property" ADD COLUMN "waterRates" REAL;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "borrowingAssumptions" TEXT;
