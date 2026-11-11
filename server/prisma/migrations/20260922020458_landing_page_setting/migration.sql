-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "allowExternalAiProcessing" BOOLEAN NOT NULL DEFAULT false,
    "defaultLandingPage" TEXT NOT NULL DEFAULT 'DASHBOARD'
);
INSERT INTO "new_Settings" ("allowExternalAiProcessing", "id") SELECT "allowExternalAiProcessing", "id" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
