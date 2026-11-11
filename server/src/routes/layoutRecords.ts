import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { programVersion } from "../services/appInfo.js";
import { logAudit } from "../services/audit.js";
import { publicRecord } from "../services/layoutRecords.js";
import { checkShare, saveShare, sendLayouts, shareStatus } from "../services/layoutShare.js";

/** Layout records (how each PDF is laid out, never its contents) and sending them to the owner's private GitHub repository. */
export const layoutRecordsRouter = Router();

layoutRecordsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const records = await prisma.layoutRecord.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const version = programVersion();
    res.json({ records: records.map((r) => publicRecord(r, version)), share: await shareStatus() });
  }),
);

layoutRecordsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await prisma.layoutRecord.findUnique({ where: { id: req.params.id } });
    if (!r) throw new HttpError(404, "Not found");
    res.json(publicRecord(r, programVersion()));
  }),
);

layoutRecordsRouter.put(
  "/share",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        on: z.boolean().optional(),
        repo: z.string().max(200).nullable().optional(),
        token: z.string().max(400).nullable().optional(),
      })
      .parse(req.body);
    const status = await saveShare(input);
    await logAudit("LAYOUT_SHARE_CHANGED", { data: { on: status.on, repo: status.repo, keyChanged: input.token !== undefined } });
    res.json(status);
  }),
);

layoutRecordsRouter.post(
  "/share/check",
  asyncHandler(async (_req, res) => {
    res.json(await checkShare());
  }),
);

layoutRecordsRouter.post(
  "/share/send",
  asyncHandler(async (_req, res) => {
    const result = await sendLayouts();
    await logAudit("LAYOUT_RECORDS_SENT", { data: { sent: result.sent } });
    res.json({ ...result, share: await shareStatus() });
  }),
);
