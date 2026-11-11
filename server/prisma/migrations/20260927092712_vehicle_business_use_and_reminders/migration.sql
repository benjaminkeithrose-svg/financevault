-- CreateTable
CREATE TABLE "VehicleLogbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "startOdometer" REAL,
    "endOdometer" REAL,
    "totalKm" REAL NOT NULL,
    "businessKm" REAL NOT NULL,
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleLogbook_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleLogbook_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "openingOdometer" REAL,
    "closingOdometer" REAL,
    "fuel" REAL,
    "registration" REAL,
    "insurance" REAL,
    "repairs" REAL,
    "interest" REAL,
    "leasePayments" REAL,
    "other" REAL,
    "declineInValue" REAL,
    "businessPercent" REAL,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleYear_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATETIME NOT NULL,
    "repeat" TEXT NOT NULL DEFAULT 'NONE',
    "targetType" TEXT,
    "targetId" TEXT,
    "completedAt" DATETIME,
    "completeNote" TEXT,
    "previousId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CalendarCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);

-- CreateIndex
CREATE INDEX "VehicleLogbook_assetId_idx" ON "VehicleLogbook"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleYear_assetId_fyLabel_key" ON "VehicleYear"("assetId", "fyLabel");

-- CreateIndex
CREATE INDEX "Reminder_dueDate_idx" ON "Reminder"("dueDate");

-- CreateIndex
CREATE INDEX "Reminder_targetType_targetId_idx" ON "Reminder"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCompletion_eventKey_key" ON "CalendarCompletion"("eventKey");
