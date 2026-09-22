import { prisma } from "../db.js";

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
      details: details?.data ? JSON.stringify(details.data) : undefined,
    },
  });
}
