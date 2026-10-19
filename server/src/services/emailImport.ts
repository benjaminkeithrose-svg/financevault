import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../db.js";
import { ingestDocument } from "./documentIngest.js";
import { decryptField } from "./fieldCrypto.js";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;

/** Attachment types worth storing — everything else in an email is noise. */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/heic",
  "image/webp",
]);

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Matches the multer limit on manual upload, so both paths behave the same. */
export type ImportOutcome = "IMPORTED" | "DUPLICATE" | "SKIPPED_UNSUPPORTED_TYPE" | "SKIPPED_TOO_LARGE";

export interface ImportedItem {
  filename: string;
  subject: string | null;
  fromAddress: string | null;
  outcome: ImportOutcome;
  documentId: string | null;
  ruleName: string;
}

export interface SyncResult {
  imported: number;
  duplicates: number;
  skipped: number;
  items: ImportedItem[];
}

function connect(emailAddress: string, appPassword: string): ImapFlow {
  return new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: { user: emailAddress, pass: appPassword },
    logger: false,
    // Without these, an unreachable Gmail — no internet, a firewall or VPN
    // blocking port 993 — leaves the request hanging indefinitely with the
    // user staring at a spinner, rather than getting a usable error back.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 120000,
  });
}

/**
 * A failed connection is far more often "this machine can't reach Gmail"
 * than "wrong password", and telling someone to re-check a password that
 * was fine sends them down the wrong path entirely.
 */
function describeConnectionFailure(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(code)) {
    return "Couldn't reach Gmail. Check this computer is online and that nothing (a VPN, firewall or work network) is blocking port 993.";
  }
  if (/timed? ?out|failed to establish connection|required time/i.test(message)) {
    return "Timed out connecting to Gmail. Check this computer is online and that nothing (a VPN, firewall or work network) is blocking port 993.";
  }
  if (code === "AUTHENTICATIONFAILED" || /auth/i.test(message)) {
    return "Gmail rejected that address and app password. Make sure it's a 16-character app password from myaccount.google.com/apppasswords, not your normal Google password.";
  }
  return `Couldn't connect to Gmail: ${message}`;
}

/**
 * Opens a connection and closes it again, so the user can check credentials
 * before saving a rule and running a real import.
 */
export async function testConnection(emailAddress: string, appPassword: string): Promise<void> {
  const client = connect(emailAddress, appPassword);
  try {
    await client.connect();
    // Read-only: never let a connection test mark anything as seen.
    const lock = await client.getMailboxLock("[Gmail]/All Mail", { readOnly: true });
    lock.release();
  } catch (err) {
    throw new Error(describeConnectionFailure(err));
  } finally {
    await client.logout().catch(() => {});
  }
}

function firstAddress(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { value?: Array<{ address?: string }> };
  return parsed.value?.[0]?.address ?? null;
}

/**
 * Runs every enabled rule on an account and copies matching attachments in.
 *
 * Gmail's own search syntax is passed straight through via the X-GM-RAW
 * IMAP extension, so a rule is written exactly as it would be typed into
 * Gmail's search box. Mail is only ever read — never marked seen, moved,
 * or deleted.
 */
export async function runImport(emailAccountId: string): Promise<SyncResult> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    include: { rules: { where: { enabled: true } } },
  });
  if (!account) throw new Error("Email account not found");

  const result: SyncResult = { imported: 0, duplicates: 0, skipped: 0, items: [] };
  if (account.rules.length === 0) return result;

  const client = connect(account.emailAddress, decryptField(account.appPassword) ?? "");
  try {
    await client.connect();
  } catch (err) {
    throw new Error(describeConnectionFailure(err));
  }

  try {
    // "All Mail" so a rule finds messages wherever they've been filed,
    // including archived ones — matching what Gmail search itself does.
    const lock = await client.getMailboxLock("[Gmail]/All Mail", { readOnly: true });
    try {
      for (const rule of account.rules) {
        const uids = await client.search({ gmraw: rule.gmailQuery }, { uid: true });
        if (!uids || uids.length === 0) continue;

        for await (const message of client.fetch(
          uids,
          { uid: true, source: true, envelope: true },
          { uid: true }
        )) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId || `uid:${message.uid}`;

          for (const attachment of parsed.attachments || []) {
            const filename = attachment.filename;
            if (!filename) continue;

            // Already handled on a previous run — never import twice.
            const seen = await prisma.importedEmailAttachment.findUnique({
              where: {
                emailAccountId_messageId_attachmentFilename: {
                  emailAccountId: account.id,
                  messageId,
                  attachmentFilename: filename,
                },
              },
            });
            if (seen) continue;

            const subject = parsed.subject ?? null;
            const fromAddress = firstAddress(parsed.from);
            const messageDate = parsed.date ?? null;
            const mimeType = (attachment.contentType || "application/octet-stream").toLowerCase();

            let outcome: ImportOutcome;
            let documentId: string | null = null;

            if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
              outcome = "SKIPPED_UNSUPPORTED_TYPE";
            } else if (attachment.size > MAX_ATTACHMENT_BYTES) {
              outcome = "SKIPPED_TOO_LARGE";
            } else {
              const ingested = await ingestDocument({
                buffer: attachment.content,
                originalFilename: filename,
                mimeType,
                fileSize: attachment.size,
                source: "GMAIL",
                suggestedDocumentType: rule.suggestedDocumentType,
                suggestedEntityId: rule.suggestedEntityId,
              });
              documentId = ingested.document?.id ?? null;
              outcome = ingested.duplicate ? "DUPLICATE" : "IMPORTED";
            }

            await prisma.importedEmailAttachment.create({
              data: {
                emailAccountId: account.id,
                ruleId: rule.id,
                messageId,
                attachmentFilename: filename,
                subject,
                fromAddress,
                messageDate,
                documentId,
                outcome,
              },
            });

            if (outcome === "IMPORTED") result.imported += 1;
            else if (outcome === "DUPLICATE") result.duplicates += 1;
            else result.skipped += 1;

            result.items.push({ filename, subject, fromAddress, outcome, documentId, ruleName: rule.name });
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}
