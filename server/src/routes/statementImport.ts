import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import { commitStatements, filedStatements, readFiledStatements, readUploadedStatements } from "../services/statementImport.js";

/** PDF bank and credit card statements → transactions, on a bank account's page. Nothing is saved until "Bring them in". */
export const statementImportRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 120 } });

statementImportRouter.post(
  "/read",
  upload.array("files", 120),
  asyncHandler(async (req, res) => {
    const accountId = z.string().min(1).parse(req.body.accountId);
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).filter(
      (f) => f.mimetype === "application/pdf" || /\.pdf$/i.test(f.originalname),
    );
    res.json(await readUploadedStatements(accountId, files));
  }),
);

statementImportRouter.get(
  "/filed",
  asyncHandler(async (req, res) => {
    res.json(await filedStatements(z.string().min(1).parse(req.query.accountId)));
  }),
);

statementImportRouter.post(
  "/read-filed",
  asyncHandler(async (req, res) => {
    const { accountId, documentIds } = z
      .object({ accountId: z.string().min(1), documentIds: z.array(z.string()).min(1).max(500) })
      .parse(req.body);
    res.json(await readFiledStatements(accountId, documentIds));
  }),
);

statementImportRouter.post(
  "/commit",
  asyncHandler(async (req, res) => {
    const { batchId, keys } = z.object({ batchId: z.string().min(1), keys: z.array(z.string()).min(1).max(500) }).parse(req.body);
    res.json(await commitStatements(batchId, keys));
  }),
);
