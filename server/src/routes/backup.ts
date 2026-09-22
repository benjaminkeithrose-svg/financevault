import { Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive, ArchiverError } from "archiver";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const backupRouter = Router();

// A full, restorable snapshot: the database plus every original document.
// The database file is copied via SQLite's own VACUUM INTO rather than
// zipped directly, so a backup taken while the app is in use is always a
// consistent point-in-time copy, never a half-written file. Documents are
// added by each one's own recorded filePath rather than a directory-level
// zip — correct even if the storage location was changed partway through
// the vault's life, since older documents keep their original filePath.
backupRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const tmpDbPath = path.join(os.tmpdir(), `financevault-backup-${Date.now()}.db`);
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tmpDbPath}'`);

    const dateLabel = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="financevault-backup-${dateLabel}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: ArchiverError) => {
      throw err;
    });
    archive.pipe(res);

    archive.file(tmpDbPath, { name: "database/financevault.db" });

    const documents = await prisma.document.findMany({ select: { filePath: true, storedFilename: true } });
    for (const doc of documents) {
      if (fs.existsSync(doc.filePath)) {
        archive.file(doc.filePath, { name: `documents/${doc.storedFilename}` });
      }
    }

    await archive.finalize();
    fs.unlink(tmpDbPath, () => {});
  })
);
