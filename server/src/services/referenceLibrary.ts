import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { sha256 } from "./hash.js";
import { ingestDocument } from "./documentIngest.js";
import { SERVER_ROOT } from "./paths.js";
import { detectReferenceCode, nextReferenceCheck, TAX_REFERENCE_TYPE } from "./taxReference.js";

/**
 * The official reference library that ships with the program, in the
 * `reference` folder: the link pack (link-pack.json) and the saved copies of
 * its documents (sources/, listed in sources/index.json). Loading it adds
 * each saved copy as a Tax reference document, so the rules the app relies on
 * are on this computer, searchable and usable offline. Loading again only
 * adds what's missing.
 */
export const REFERENCE_ROOT = path.join(SERVER_ROOT, "..", "reference");

interface LinkEntry {
  id: string;
  title: string;
  publisher: string;
  url: string;
}
interface SourceEntry {
  file: string;
  covers: string[];
  note?: string;
}

export interface LibraryItem {
  file: string;
  title: string;
  referenceCode: string | null;
  url: string | null;
  documentId: string | null;
}

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".txt": "text/plain" };

async function readLibrary(root: string) {
  const [pack, index] = await Promise.all([
    fs.readFile(path.join(root, "link-pack.json"), "utf8").then((t) => JSON.parse(t) as { links: LinkEntry[] }),
    fs.readFile(path.join(root, "sources", "index.json"), "utf8").then((t) => JSON.parse(t) as { files: SourceEntry[] }),
  ]);
  const links = new Map(pack.links.map((l) => [l.id, l]));
  return index.files.map((f) => {
    const covered = f.covers.map((id) => links.get(id)).filter((l): l is LinkEntry => !!l);
    const main = covered[0] ?? null;
    return {
      file: f.file,
      title: main ? main.title : f.file,
      // "TR 2000/2 — interest on redraws…" → "TR 2000/2"
      referenceCode: main ? detectReferenceCode(main.title) : null,
      url: main?.url ?? null,
      note: [covered.map((l) => `${l.title} (${l.publisher}): ${l.url}`).join("\n"), f.note].filter(Boolean).join("\n"),
    };
  });
}

/** What's in the library, and which of it is already in Financial Vault. */
export async function libraryStatus(root = REFERENCE_ROOT): Promise<{ available: boolean; items: LibraryItem[] }> {
  let entries: Awaited<ReturnType<typeof readLibrary>>;
  try {
    entries = await readLibrary(root);
  } catch {
    return { available: false, items: [] };
  }
  const items: LibraryItem[] = [];
  for (const e of entries) {
    let documentId: string | null = null;
    try {
      const hash = sha256(await fs.readFile(path.join(root, "sources", e.file)));
      documentId = (await prisma.document.findFirst({ where: { fileHash: hash }, select: { id: true } }))?.id ?? null;
    } catch {
      continue; // listed but not shipped — left out
    }
    items.push({ file: e.file, title: e.title, referenceCode: e.referenceCode, url: e.url, documentId });
  }
  return { available: true, items };
}

/** Adds every library document not already here. */
export async function loadLibrary(root = REFERENCE_ROOT): Promise<{ added: number; alreadyHere: number; missing: string[] }> {
  const entries = await readLibrary(root);
  let added = 0;
  let alreadyHere = 0;
  const missing: string[] = [];
  for (const e of entries) {
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(path.join(root, "sources", e.file));
    } catch {
      missing.push(e.file);
      continue;
    }
    const result = await ingestDocument({
      buffer,
      originalFilename: e.file,
      mimeType: MIME[path.extname(e.file)] ?? "application/octet-stream",
      fileSize: buffer.length,
      source: "REFERENCE_LIBRARY",
      suggestedDocumentType: TAX_REFERENCE_TYPE,
      referenceCode: e.referenceCode,
    });
    if (result.duplicate) alreadyHere++;
    else added++;
    // The library knows what each file is, whatever the classifier guessed —
    // and a copy uploaded earlier under another type is re-filed.
    const doc = result.document;
    if (!doc) continue;
    if (doc.documentType !== TAX_REFERENCE_TYPE || !doc.referenceCode || !doc.notes || doc.reviewStatus !== "CONFIRMED") {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          documentType: TAX_REFERENCE_TYPE,
          entityId: null,
          taxRelevance: "NOT_RELEVANT",
          referenceCode: doc.referenceCode ?? e.referenceCode,
          referenceCheckBy: doc.referenceCheckBy ?? nextReferenceCheck(),
          notes: doc.notes ?? e.note,
          // Nothing to check: the library says exactly what it is.
          reviewStatus: "CONFIRMED",
        },
      });
    }
  }
  return { added, alreadyHere, missing };
}
