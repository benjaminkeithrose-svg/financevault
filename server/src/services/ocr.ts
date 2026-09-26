import { createWorker } from "tesseract.js";
// pdf-parse ships as CommonJS; default import works under esModuleInterop.
import pdfParse from "pdf-parse";
import * as mupdf from "mupdf";
import fs from "node:fs";
import path from "node:path";
import { SERVER_ROOT } from "./paths.js";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);

export interface ExtractionResult {
  text: string;
  method: "pdf-text" | "pdf-ocr" | "ocr" | "none";
  lowConfidence: boolean;
}

/**
 * A scanned page has to be rendered to an image before it can be OCR'd, and
 * that is slow — a few seconds per page. Older statements and tax returns run
 * to many pages, but the first few carry the identifying details and the
 * figures that matter for classification, so the rest aren't worth the wait.
 */
const MAX_OCR_PAGES = 10;

/** PDFs are 72 DPI by default; 3x lands near 216 DPI, enough for clean OCR. */
const RASTER_SCALE = 3;

/**
 * Where tesseract's language data lives.
 *
 * It is ~11MB and is otherwise fetched from a CDN on first use and cached
 * relative to the current working directory — which differs between `npm run
 * dev` and the double-click launcher, so it could be downloaded twice and
 * lost. Pinning it here means one download ever, after which OCR works with
 * no network at all. Dropping `eng.traineddata.gz` into this folder by hand
 * skips the download entirely, for a fully offline install.
 */
const TESSDATA_DIR = path.join(SERVER_ROOT, "storage", "tessdata");

/**
 * Whether the language data could be loaded, resolved once per process.
 *
 * Without this, a machine that can't reach the CDN pays the full OCR timeout
 * on every single scanned file — during a bulk import of a hundred documents
 * that is many minutes of waiting for something already known to fail.
 */
let ocrAvailable: Promise<boolean> | null = null;

async function createOcrWorker() {
  fs.mkdirSync(TESSDATA_DIR, { recursive: true });
  return createWorker("eng", undefined, {
    langPath: TESSDATA_DIR,
    cachePath: TESSDATA_DIR,
    errorHandler: () => {},
  });
}

/**
 * A blank 64x64 PNG used only to prove the OCR pipeline actually runs.
 * Creating a worker succeeds even when the language data is missing —
 * the failure only surfaces on the first real recognition — so the check
 * has to recognise something to mean anything.
 */
const PREFLIGHT_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsPInvYLYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQHKU9LC7/CP1AAAAABJRU5ErkJggg==";

function checkOcrAvailable(): Promise<boolean> {
  ocrAvailable ??= (async () => {
    try {
      // Generous, because this may include the one-off ~11MB download.
      const worker = await withTimeout(
        (async () => {
          const w = await createOcrWorker();
          await w.recognize(Buffer.from(PREFLIGHT_PNG, "base64"));
          return w;
        })(),
        90_000
      );
      await worker.terminate();
      return true;
    } catch {
      console.warn(
        "[ocr] Language data unavailable — scanned documents will be stored without text extraction. " +
          `Place eng.traineddata.gz in ${TESSDATA_DIR} to enable OCR offline.`
      );
      return false;
    }
  })();
  return ocrAvailable;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OCR timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runImageOcr(buffer: Buffer): Promise<ExtractionResult> {
  // tesseract.js rethrows worker errors synchronously in addition to
  // rejecting the promise unless an errorHandler is supplied — without
  // this, a network failure fetching language data crashes the process.
  const worker = await createOcrWorker();
  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(buffer);
    return { text: text.trim(), method: "ocr", lowConfidence: confidence < 60 };
  } finally {
    await worker.terminate();
  }
}

/** Second opinion on the text layer — mupdf reads some PDFs pdf-parse can't. */
function extractPdfTextLayer(buffer: Buffer): string {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  try {
    const parts: string[] = [];
    const pageCount = doc.countPages();
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      parts.push(page.toStructuredText("preserve-whitespace").asText());
    }
    return parts.join("\n").trim();
  } finally {
    doc.destroy();
  }
}

/**
 * Renders each page to an image and OCRs it — the only way to read a PDF that
 * is a photograph of paper rather than text, which most older statements and
 * tax returns are.
 *
 * One tesseract worker is reused across pages (starting one costs more than
 * the recognition itself), and each rendered page is freed immediately so a
 * long document doesn't accumulate in WASM memory during a bulk import.
 */
async function runPdfPageOcr(buffer: Buffer): Promise<ExtractionResult> {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const worker = await createOcrWorker();
  try {
    const pageCount = Math.min(doc.countPages(), MAX_OCR_PAGES);
    const parts: string[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(RASTER_SCALE, RASTER_SCALE),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      );
      try {
        const png = Buffer.from(pixmap.asPNG());
        const {
          data: { text, confidence },
        } = await worker.recognize(png);
        if (text.trim()) {
          parts.push(text.trim());
          confidenceSum += confidence;
          confidenceCount += 1;
        }
      } finally {
        pixmap.destroy();
      }
    }

    const averageConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
    return {
      text: parts.join("\n\n"),
      method: "pdf-ocr",
      lowConfidence: averageConfidence < 60,
    };
  } finally {
    await worker.terminate();
    doc.destroy();
  }
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") {
    let embedded = "";
    try {
      const parsed = await pdfParse(buffer);
      embedded = (parsed.text || "").trim();
    } catch {
      // Falls through to the other two strategies below.
    }

    if (embedded.length > 40) {
      return { text: embedded, method: "pdf-text", lowConfidence: false };
    }

    // Cheap before expensive: try the other text-layer reader before
    // rendering and OCR'ing every page.
    try {
      const viaMupdf = extractPdfTextLayer(buffer);
      if (viaMupdf.length > 40) {
        return { text: viaMupdf, method: "pdf-text", lowConfidence: false };
      }
    } catch {
      // Not readable as a text layer — fall through to OCR.
    }

    // No usable text layer, so this is a scan. 45s covers the page cap above
    // on typical hardware; past that the document is still stored and can be
    // classified by hand.
    if (await checkOcrAvailable()) {
      try {
        const ocred = await withTimeout(runPdfPageOcr(buffer), 45_000);
        if (ocred.text.trim()) return ocred;
      } catch {
        // Best-effort, same as image OCR below.
      }
    }

    return { text: embedded, method: "none", lowConfidence: true };
  }

  if (IMAGE_MIME_TYPES.has(mimeType)) {
    if (!(await checkOcrAvailable())) {
      return { text: "", method: "none", lowConfidence: true };
    }
    try {
      return await withTimeout(runImageOcr(buffer), 20_000);
    } catch {
      // OCR is best-effort: the document is still stored and can be
      // classified manually if text extraction fails or times out (e.g. no
      // network access to fetch language data on first use).
      return { text: "", method: "none", lowConfidence: true };
    }
  }

  // A plain text file (a saved web page, say) is its own text.
  if (mimeType === "text/plain") {
    return { text: buffer.toString("utf8"), method: "pdf-text", lowConfidence: false };
  }

  return { text: "", method: "none", lowConfidence: true };
}
