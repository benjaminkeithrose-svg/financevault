import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { libraryStatus, loadLibrary } from "../services/referenceLibrary.js";

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
