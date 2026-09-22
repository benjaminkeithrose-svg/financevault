import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { runImport, testConnection } from "../services/emailImport.js";
import { decryptField } from "../services/fieldCrypto.js";

export const emailImportRouter = Router();

/**
 * The stored app password never leaves the server — the client only ever
 * learns whether one is set.
 */
function present<T extends { appPassword: string }>(account: T) {
  const { appPassword, ...rest } = account;
  return { ...rest, hasAppPassword: Boolean(appPassword) };
}

emailImportRouter.get(
  "/accounts",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.emailAccount.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        rules: { orderBy: { createdAt: "asc" }, include: { suggestedEntity: true } },
      },
    });
    res.json(accounts.map(present));
  })
);

const accountInput = z.object({
  emailAddress: z.string().email(),
  appPassword: z.string().min(1),
});

emailImportRouter.post(
  "/accounts",
  asyncHandler(async (req, res) => {
    const parsed = accountInput.parse(req.body);
    // Google shows app passwords in spaced groups of four; accept either form.
    const appPassword = parsed.appPassword.replace(/\s+/g, "");

    try {
      await testConnection(parsed.emailAddress, appPassword);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const account = await prisma.emailAccount.create({
      data: { emailAddress: parsed.emailAddress, appPassword },
      include: { rules: { include: { suggestedEntity: true } } },
    });
    await logAudit("EMAIL_ACCOUNT_CONNECTED", {
      targetType: "EmailAccount",
      targetId: account.id,
      data: { emailAddress: account.emailAddress },
    });
    res.status(201).json(present(account));
  })
);

const accountUpdateInput = z.object({
  appPassword: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

emailImportRouter.put(
  "/accounts/:id",
  asyncHandler(async (req, res) => {
    const parsed = accountUpdateInput.parse(req.body);
    const existing = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Email account not found" });
      return;
    }

    const data: { appPassword?: string; enabled?: boolean } = {};
    if (parsed.enabled !== undefined) data.enabled = parsed.enabled;

    if (parsed.appPassword) {
      const appPassword = parsed.appPassword.replace(/\s+/g, "");
      try {
        await testConnection(existing.emailAddress, appPassword);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      data.appPassword = appPassword;
    }

    const account = await prisma.emailAccount.update({
      where: { id: req.params.id },
      data,
      include: { rules: { include: { suggestedEntity: true } } },
    });
    res.json(present(account));
  })
);

emailImportRouter.post(
  "/accounts/:id/test",
  asyncHandler(async (req, res) => {
    const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
    if (!account) {
      res.status(404).json({ error: "Email account not found" });
      return;
    }
    try {
      await testConnection(account.emailAddress, decryptField(account.appPassword) ?? "");
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })
);

emailImportRouter.delete(
  "/accounts/:id",
  asyncHandler(async (req, res) => {
    await prisma.emailAccount.delete({ where: { id: req.params.id } });
    await logAudit("EMAIL_ACCOUNT_DISCONNECTED", { targetType: "EmailAccount", targetId: req.params.id });
    res.status(204).send();
  })
);

const ruleInput = z.object({
  name: z.string().min(1),
  gmailQuery: z.string().min(1),
  suggestedDocumentType: z.string().optional().nullable(),
  suggestedEntityId: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

emailImportRouter.post(
  "/accounts/:id/rules",
  asyncHandler(async (req, res) => {
    const parsed = ruleInput.parse(req.body);
    const rule = await prisma.emailImportRule.create({
      data: { emailAccountId: req.params.id, ...parsed },
      include: { suggestedEntity: true },
    });
    res.status(201).json(rule);
  })
);

emailImportRouter.put(
  "/rules/:ruleId",
  asyncHandler(async (req, res) => {
    const parsed = ruleInput.partial().parse(req.body);
    const rule = await prisma.emailImportRule.update({
      where: { id: req.params.ruleId },
      data: parsed,
      include: { suggestedEntity: true },
    });
    res.json(rule);
  })
);

emailImportRouter.delete(
  "/rules/:ruleId",
  asyncHandler(async (req, res) => {
    await prisma.emailImportRule.delete({ where: { id: req.params.ruleId } });
    res.status(204).send();
  })
);

/**
 * Runs on demand only — nothing polls Gmail in the background, so an import
 * never happens without the user asking for it.
 */
emailImportRouter.post(
  "/accounts/:id/sync",
  asyncHandler(async (req, res) => {
    const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
    if (!account) {
      res.status(404).json({ error: "Email account not found" });
      return;
    }

    try {
      const result = await runImport(account.id);
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: "SUCCESS", lastSyncError: null },
      });
      await logAudit("EMAIL_IMPORT_RUN", {
        targetType: "EmailAccount",
        targetId: account.id,
        data: { imported: result.imported, duplicates: result.duplicates, skipped: result.skipped },
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: "ERROR", lastSyncError: message },
      });
      res.status(400).json({ error: message });
    }
  })
);

emailImportRouter.get(
  "/accounts/:id/history",
  asyncHandler(async (req, res) => {
    const history = await prisma.importedEmailAttachment.findMany({
      where: { emailAccountId: req.params.id },
      orderBy: { importedAt: "desc" },
      take: 100,
      include: { rule: { select: { name: true } } },
    });
    res.json(history);
  })
);
