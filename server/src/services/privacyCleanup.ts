import { prisma } from "../db.js";
import { scrubSecrets } from "./audit.js";
import { redactTfns } from "./tfn.js";

const CURRENT_VERSION = 1;

/**
 * One-off pass over data stored before TFNs were protected everywhere:
 * masks TFNs in document text, and scrubs secret values out of audit entries
 * written before the audit log started doing that itself. Neither needs the
 * vault key, so it runs at startup rather than waiting for an unlock.
 */
export async function runPrivacyCleanup(): Promise<{ documents: number; auditEntries: number } | null> {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if (settings.privacyCleanupVersion >= CURRENT_VERSION) return null;

  let documents = 0;
  const docs = await prisma.document.findMany({
    where: { ocrText: { not: null } },
    select: { id: true, ocrText: true },
  });
  for (const doc of docs) {
    const { text, count } = redactTfns(doc.ocrText!);
    if (count > 0) {
      await prisma.document.update({ where: { id: doc.id }, data: { ocrText: text } });
      documents += 1;
    }
  }

  let auditEntries = 0;
  const entries = await prisma.auditLog.findMany({ where: { details: { not: null } }, select: { id: true, details: true } });
  for (const entry of entries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.details!);
    } catch {
      continue;
    }
    const scrubbed = JSON.stringify(scrubSecrets(parsed));
    if (scrubbed !== entry.details) {
      await prisma.auditLog.update({ where: { id: entry.id }, data: { details: scrubbed } });
      auditEntries += 1;
    }
  }

  await prisma.settings.update({ where: { id: 1 }, data: { privacyCleanupVersion: CURRENT_VERSION } });
  return { documents, auditEntries };
}
