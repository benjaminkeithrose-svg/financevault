-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "allowExternalAiProcessing" BOOLEAN NOT NULL DEFAULT false,
    "defaultLandingPage" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "customStorageDir" TEXT,
    "allowPriceLookups" BOOLEAN NOT NULL DEFAULT false,
    "privacyCleanupVersion" INTEGER NOT NULL DEFAULT 0,
    "lastBackupAt" DATETIME,
    "checklistDismissed" BOOLEAN NOT NULL DEFAULT false,
    "borrowingAssumptions" TEXT,
    "featuresOff" TEXT,
    "mirrorEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mirrorDir" TEXT
);
INSERT INTO "new_Settings" ("allowExternalAiProcessing", "allowPriceLookups", "borrowingAssumptions", "checklistDismissed", "customStorageDir", "defaultLandingPage", "featuresOff", "id", "lastBackupAt", "privacyCleanupVersion") SELECT "allowExternalAiProcessing", "allowPriceLookups", "borrowingAssumptions", "checklistDismissed", "customStorageDir", "defaultLandingPage", "featuresOff", "id", "lastBackupAt", "privacyCleanupVersion" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
