-- AlterTable
ALTER TABLE "Person" ADD COLUMN "currentAddress" TEXT;
ALTER TABLE "Person" ADD COLUMN "email" TEXT;
ALTER TABLE "Person" ADD COLUMN "maritalStatus" TEXT;
ALTER TABLE "Person" ADD COLUMN "motherMaidenName" TEXT;
ALTER TABLE "Person" ADD COLUMN "nextOfKinAddress" TEXT;
ALTER TABLE "Person" ADD COLUMN "nextOfKinName" TEXT;
ALTER TABLE "Person" ADD COLUMN "nextOfKinPhone" TEXT;
ALTER TABLE "Person" ADD COLUMN "nextOfKinRelationship" TEXT;
ALTER TABLE "Person" ADD COLUMN "phone" TEXT;
ALTER TABLE "Person" ADD COLUMN "previousAddress" TEXT;

-- CreateTable
CREATE TABLE "Adviser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "firm" TEXT,
    "contactFirstName" TEXT,
    "contactSurname" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
