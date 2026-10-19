-- Layout records for every PDF that comes in, and sending them to the owner's private GitHub repository.
CREATE TABLE "LayoutRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "issuer" TEXT,
    "pages" INTEGER NOT NULL,
    "textLayer" BOOLEAN NOT NULL,
    "readerVersion" INTEGER NOT NULL,
    "result" TEXT,
    "layout" TEXT NOT NULL,
    "sentAt" DATETIME
);
CREATE UNIQUE INDEX "LayoutRecord_fileHash_key" ON "LayoutRecord"("fileHash");

ALTER TABLE "Settings" ADD COLUMN "layoutShareOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "layoutShareRepo" TEXT;
ALTER TABLE "Settings" ADD COLUMN "layoutShareToken" TEXT;
ALTER TABLE "Settings" ADD COLUMN "layoutShareLastAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "layoutShareError" TEXT;
