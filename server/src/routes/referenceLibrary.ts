import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { libraryStatus, loadLibrary } from "../services/referenceLibrary.js";
import { checkForNewVersions, fileLibraryFolders, linkLibraryCopies, readLinkPack, referenceChecks } from "../services/referenceUpdates.js";
import { figures } from "../services/figures.js";
import { downloadProgress, lastDownload, startDownload, ZIP_FEATURE, zipLibraryNow } from "../services/referenceDownload.js";
import { featureOn } from "./settings.js";

export const referenceLibraryRouter = Router();

referenceLibraryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await libraryStatus());
  })
);

referenceLibraryRouter.post(
  "/load",
  asyncHandler(async (_req, res) => {
    const result = await loadLibrary();
    // Each copy's place in the library's folders, and its publisher's date.
    await linkLibraryCopies();
    await fileLibraryFolders(await readLinkPack());
    await logAudit("REFERENCE_LIBRARY_LOADED", { data: { ...result } });
    res.json(result);
  })
);

// "Check for new versions": the one time the library goes online, and only when asked.
referenceLibraryRouter.get(
  "/checks",
  asyncHandler(async (_req, res) => {
    res.json(await referenceChecks());
  })
);

referenceLibraryRouter.post(
  "/check",
  asyncHandler(async (_req, res) => {
    const summary = await checkForNewVersions();
    await logAudit("REFERENCE_LIBRARY_CHECKED", { data: { ...summary } });
    res.json(summary);
  })
);

referenceLibraryRouter.get(
  "/figures",
  asyncHandler(async (_req, res) => {
    res.json(await figures());
  })
);

// "Download everything for Claude": every official source and every ATO
// occupation guide into a dated folder and a ZIP, in the background.
referenceLibraryRouter.get(
  "/download",
  asyncHandler(async (_req, res) => {
    res.json({ running: downloadProgress(), last: await lastDownload() });
  })
);

referenceLibraryRouter.post(
  "/download",
  asyncHandler(async (_req, res) => {
    const started = startDownload();
    if (started) await logAudit("REFERENCE_DOWNLOAD_STARTED");
    res.status(started ? 202 : 200).json({ running: downloadProgress(), last: await lastDownload() });
  })
);

referenceLibraryRouter.get(
  "/download/zip",
  asyncHandler(async (_req, res) => {
    if (!(await featureOn(ZIP_FEATURE))) {
      res.status(403).json({ error: "Saving the ZIP is switched off (Settings → Features)." });
      return;
    }
    const last = await lastDownload();
    if (!last) {
      res.status(404).json({ error: "Nothing downloaded yet." });
      return;
    }
    // Switched on after the last download: make it from the folders now.
    res.download(last.zip ?? (await zipLibraryNow()));
  })
);
