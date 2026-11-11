import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { getEffectiveStorageDir, relinkMovedDocuments } from "../src/services/paths.js";

// Updating to a new version: the data is copied into the new program folder,
// but each document still records the old folder's location.

describe("documents after the program folder moves", () => {
  it("finds a document in the new storage folder and links it up", async () => {
    const dir = await getEffectiveStorageDir();
    fs.mkdirSync(dir, { recursive: true });
    const name = `moved-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(dir, name), "%PDF-1.4");
    const doc = await prisma.document.create({
      data: {
        originalFilename: "rates.pdf",
        storedFilename: name,
        filePath: path.join("/old/copy/of/financevault/server/storage/documents", name),
        mimeType: "application/pdf",
        fileSize: 8,
        fileHash: `moved-${Date.now()}-${Math.random()}`,
      },
    });
    expect(await relinkMovedDocuments()).toBeGreaterThanOrEqual(1);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).filePath).toBe(path.join(dir, name));
    // Nothing more to do the second time.
    const again = await relinkMovedDocuments();
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).filePath).toBe(path.join(dir, name));
    expect(again).toBe(0);
    await prisma.document.delete({ where: { id: doc.id } });
  });

  it("leaves a document alone when its file can't be found anywhere", async () => {
    const doc = await prisma.document.create({
      data: {
        originalFilename: "lost.pdf",
        storedFilename: `lost-${Date.now()}.pdf`,
        filePath: "/nowhere/lost.pdf",
        mimeType: "application/pdf",
        fileSize: 1,
        fileHash: `lost-${Date.now()}-${Math.random()}`,
      },
    });
    await relinkMovedDocuments();
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).filePath).toBe("/nowhere/lost.pdf");
    await prisma.document.delete({ where: { id: doc.id } });
  });
});
