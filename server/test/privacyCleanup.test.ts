import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { runPrivacyCleanup } from "../src/services/privacyCleanup.js";

beforeAll(async () => {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { privacyCleanupVersion: 0 },
    create: { id: 1, privacyCleanupVersion: 0 },
  });
  await prisma.document.create({
    data: {
      id: "old-return",
      originalFilename: "tax_return.pdf",
      storedFilename: "x.pdf",
      filePath: "/nonexistent/x.pdf",
      mimeType: "application/pdf",
      fileSize: 1,
      fileHash: "cleanup-test",
      ocrText: "Tax file number: 123 456 782\nInvoice no. 876543210",
    },
  });
  // Written the way older versions logged a change, before scrubbing existed.
  await prisma.auditLog.create({
    data: { action: "PERSON_CHANGED", targetId: "someone", details: JSON.stringify({ tfn: "123 456 782" }) },
  });
});

describe("one-off cleanup of data stored before TFNs were protected", () => {
  it("masks TFNs in stored document text but leaves other numbers", async () => {
    const result = await runPrivacyCleanup();
    expect(result).toEqual({ documents: 1, auditEntries: 1 });
    const doc = await prisma.document.findUnique({ where: { id: "old-return" } });
    expect(doc!.ocrText).toBe("Tax file number: [TFN ••• ••• 782]\nInvoice no. 876543210");
  });

  it("scrubs TFNs out of old audit entries", async () => {
    const entry = await prisma.auditLog.findFirst({ where: { targetId: "someone" } });
    expect(entry!.details).not.toContain("123");
  });

  it("only runs once", async () => {
    expect(await runPrivacyCleanup()).toBeNull();
  });
});
