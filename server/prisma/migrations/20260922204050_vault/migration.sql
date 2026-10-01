-- CreateTable
CREATE TABLE "Vault" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "kdfN" INTEGER NOT NULL,
    "kdfR" INTEGER NOT NULL,
    "kdfP" INTEGER NOT NULL,
    "passcodeSalt" TEXT NOT NULL,
    "keyWrappedByPasscode" TEXT NOT NULL,
    "recoverySalt" TEXT NOT NULL,
    "keyWrappedByRecovery" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
