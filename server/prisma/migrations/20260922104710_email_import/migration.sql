-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAddress" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GMAIL',
    "appPassword" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailImportRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gmailQuery" TEXT NOT NULL,
    "suggestedDocumentType" TEXT,
    "suggestedEntityId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailImportRule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailImportRule_suggestedEntityId_fkey" FOREIGN KEY ("suggestedEntityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportedEmailAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAccountId" TEXT NOT NULL,
    "ruleId" TEXT,
    "messageId" TEXT NOT NULL,
    "attachmentFilename" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddress" TEXT,
    "messageDate" DATETIME,
    "documentId" TEXT,
    "outcome" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportedEmailAttachment_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportedEmailAttachment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EmailImportRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_emailAddress_key" ON "EmailAccount"("emailAddress");

-- CreateIndex
CREATE INDEX "EmailImportRule_emailAccountId_idx" ON "EmailImportRule"("emailAccountId");

-- CreateIndex
CREATE INDEX "ImportedEmailAttachment_emailAccountId_idx" ON "ImportedEmailAttachment"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedEmailAttachment_emailAccountId_messageId_attachmentFilename_key" ON "ImportedEmailAttachment"("emailAccountId", "messageId", "attachmentFilename");
