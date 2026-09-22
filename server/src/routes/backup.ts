import { Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive, ArchiverError } from "archiver";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { resolveStorageDir } from "../services/paths.js";

export const backupRouter = Router();

// A full, restorable snapshot: the database plus every original document.
// The database file is copied via SQLite's own VACUUM INTO rather than
// zipped directly, so a backup taken while the app is in use is always a
// consistent point-in-time copy, never a half-written file.
backupRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const storageDir = resolveStorageDir();
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
    if (fs.existsSync(storageDir)) {
      archive.directory(storageDir, "documents");
    }

    await archive.finalize();
    fs.unlink(tmpDbPath, () => {});
  })
);
