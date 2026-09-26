import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { libraryStatus, loadLibrary } from "../services/referenceLibrary.js";
import { checkForNewVersions, referenceChecks } from "../services/referenceUpdates.js";
import { figures } from "../services/figures.js";

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
