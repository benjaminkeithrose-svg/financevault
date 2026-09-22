import { createWorker } from "tesseract.js";
// pdf-parse ships as CommonJS; default import works under esModuleInterop.
import pdfParse from "pdf-parse";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);

export interface ExtractionResult {
  text: string;
  method: "pdf-text" | "ocr" | "none";
  lowConfidence: boolean;
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
  const worker = await createWorker("eng", undefined, { errorHandler: () => {} });
  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(buffer);
    return { text: text.trim(), method: "ocr", lowConfidence: confidence < 60 };
  } finally {
    await worker.terminate();
  }
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") {
    try {
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text.length > 40) {
        return { text, method: "pdf-text", lowConfidence: false };
      }
      // Scanned PDF with little/no extractable text — full page-image OCR of
      // PDFs is out of scope for stage 1; flag it for manual review instead.
      return { text, method: "none", lowConfidence: true };
    } catch {
      return { text: "", method: "none", lowConfidence: true };
    }
  }

  if (IMAGE_MIME_TYPES.has(mimeType)) {
    try {
      return await withTimeout(runImageOcr(buffer), 20_000);
    } catch {
      // OCR is best-effort: the document is still stored and can be
      // classified manually if text extraction fails or times out (e.g. no
      // network access to fetch language data on first use).
      return { text: "", method: "none", lowConfidence: true };
    }
  }

  return { text: "", method: "none", lowConfidence: true };
}
