import { prisma } from "../db.js";

/**
 * Keys whose values never belong in the audit log. Routes log the fields
 * that changed, and a change to a tax file number or password is still worth
 * recording — but the audit log is stored unencrypted, so writing the value
 * itself would undo the encryption on the field. Scrubbing here rather than
 * at each call site means a new route can't reintroduce the leak.
 */
const SECRET_KEYS = new Set([
  "tfn",
  "apppassword",
  "passcode",
  "newpasscode",
  "currentpasscode",
  "recoverykey",
  "mothermaidenname",
  "accountnumber",
  "policynumber",
  "number",
  "referencenumber",
]);

export function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(key.toLowerCase())) {
        out[key] = v === null || v === undefined || v === "" ? v : "[changed — value not logged]";
      } else {
        out[key] = scrubSecrets(v);
      }
    }
    return out;
  }
  return value;
}

export async function logAudit(action: string, details?: {
  targetType?: string;
  targetId?: string;
  documentId?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      targetType: details?.targetType,
      targetId: details?.targetId,
      documentId: details?.documentId,
      details: details?.data ? JSON.stringify(scrubSecrets(details.data)) : undefined,
    },
  });
}
