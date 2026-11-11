import fs from "node:fs/promises";
import { prisma } from "../db.js";
import { hasDataKey, isSealedFile, openFile, sealFile } from "./fieldCrypto.js";

/**
 * Stored document files are encrypted with the vault's key, so the files
 * in the documents folder — or a synced copy of it, or a backup — can't be
 * opened without Financial Vault and the passcode. Everything that reads a
 * document's contents goes through readDocumentFile.
 */

export async function writeDocumentFile(filePath: string, plaintext: Buffer): Promise<void> {
  // Saved while locked (a background import finishing after the idle lock):
  // stored as-is and sealed at the next unlock.
  await fs.writeFile(filePath, sealFile(plaintext) ?? plaintext);
}

export async function readDocumentFile(filePath: string): Promise<Buffer> {
  const bytes = await fs.readFile(filePath);
  try {
    return openFile(bytes);
  } catch (err) {
    if ((err as { status?: number }).status) throw err; // locked
    // Sealed under a different key: only after a passcode reset without the
    // recovery key, which can't bring the old key back.
    throw Object.assign(new Error("This file was encrypted under a passcode that has since been reset, so it can't be opened."), { status: 410 });
  }
}

let running: Promise<number> | null = null;

/**
 * Seals every stored file that isn't sealed yet — documents from before
 * this version, or saved while locked. Written to a side file and swapped
 * in, so a file is never left half-written. Runs in the background after
 * unlocking; safe to call again while it's running.
 */
export function encryptStoredDocuments(): Promise<number> {
  if (!running) {
    running = sealAll().finally(() => {
      running = null;
    });
  }
  return running;
}

async function sealAll(): Promise<number> {
  const documents = await prisma.document.findMany({ select: { filePath: true } });
  let sealed = 0;
  for (const filePath of new Set(documents.map((d) => d.filePath))) {
    if (!hasDataKey()) break; // locked part-way: carry on next time
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(filePath);
    } catch {
      continue; // missing file: shown as missing on its page, nothing to seal
    }
    if (isSealedFile(bytes)) continue;
    const out = sealFile(bytes);
    if (!out) break;
    const temp = `${filePath}.sealing`;
    await fs.writeFile(temp, out);
    await fs.rename(temp, filePath);
    sealed += 1;
  }
  return sealed;
}
