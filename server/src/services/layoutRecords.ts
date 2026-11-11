import { prisma } from "../db.js";
import { sha256 } from "./hash.js";
import { detectBank, findHeading, pdfPages, READER_VERSION, readStatementPages, rowsOf, type StatementReading } from "./pdfStatement.js";

/**
 * A record of how each PDF that comes in is laid out — to improve the
 * readers, bank statements especially. It never holds an amount, a
 * description, a name, an account number or a transaction date:
 *
 *  - a statement: its column headings (only words from a fixed list — any
 *    other word shows as "[other]"), where the columns sit on the page, the
 *    date and amount formats, how many rows were read, and whether it added
 *    up — or the page and line where it didn't;
 *  - any other PDF: its type, its page count, and which of a fixed list of
 *    headings appear in it.
 *
 * Kept on this computer. If the owner sets it up, they're also sent to their
 * own private GitHub repository (layoutShare.ts).
 */

/** Headings and phrases looked for in any PDF — whether each appears, never what's next to it. */
const VOCAB = [
  "statement period",
  "opening balance",
  "closing balance",
  "balance brought forward",
  "balance carried forward",
  "available balance",
  "credit limit",
  "minimum payment",
  "payment due",
  "interest rate",
  "interest charged",
  "interest paid",
  "fees charged",
  "repayment",
  "loan balance",
  "redraw",
  "offset",
  "transaction details",
  "transaction description",
  "description",
  "particulars",
  "debit",
  "credit",
  "withdrawal",
  "deposit",
  "balance",
  "amount",
  "date",
  "total",
  "notice of assessment",
  "taxable income",
  "tax withheld",
  "income statement",
  "payment summary",
  "gross pay",
  "net pay",
  "year to date",
  "pay period",
  "superannuation",
  "employer",
  "abn",
  "tax invoice",
  "gst",
  "amount due",
  "due date",
  "invoice number",
  "receipt",
  "policy number",
  "sum insured",
  "premium",
  "renewal",
  "excess",
  "rates notice",
  "land value",
  "valuation",
  "dividend",
  "franking credit",
  "distribution",
  "capital gain",
  "units",
  "contract of sale",
  "settlement",
  "purchaser",
  "vendor",
  "lease",
  "rent",
  "depreciation",
  "management fee",
];

const ISSUERS: Array<[string, RegExp]> = [
  ["Australian Taxation Office", /australian taxation office/i],
  ["Services Australia", /services australia|medicare/i],
];

function issuerOf(text: string): string | null {
  const bank = detectBank(text);
  if (bank) return bank;
  for (const [name, re] of ISSUERS) if (re.test(text)) return name;
  return null;
}

export interface LayoutInput {
  buffer: Buffer;
  mimeType: string;
  /** The document type, if known ("Bank Statement", "Payslip"…). */
  kind?: string | null;
  /** A statement already read (e.g. on the bank account page), so it isn't read twice. */
  reading?: StatementReading;
  accountType?: string | null;
}

/** Records a PDF's layout. Never throws — a layout record is never worth failing an import over. */
export async function recordLayout(input: LayoutInput): Promise<void> {
  try {
    if (input.mimeType !== "application/pdf") return;
    const fileHash = sha256(input.buffer);
    const data = layoutFor(input);
    if (!data) return;
    const existing = await prisma.layoutRecord.findUnique({ where: { fileHash } });
    if (existing) {
      // Read as a statement on an account page: that reading replaces whatever was recorded when the file came in (unless already sent).
      if (input.reading && !existing.sentAt) await prisma.layoutRecord.update({ where: { fileHash }, data });
      return;
    }
    await prisma.layoutRecord.create({ data: { fileHash, ...data } });
  } catch {
    // Best effort.
  }
}

function layoutFor(input: LayoutInput) {
  const kind = input.kind || "Unclassified PDF";
  if (input.reading) {
    const r = input.reading;
    return {
      kind,
      issuer: r.bank,
      pages: r.pageCount,
      textLayer: !r.scanned,
      readerVersion: READER_VERSION,
      result: r.status,
      layout: JSON.stringify(r.layout),
    };
  }
  const { pages, pageCount } = pdfPages(input.buffer);
  const text = pages.flatMap((p) => rowsOf(p.tokens).map((r) => r.map((t) => t.text).join(" "))).join("\n");
  const textLayer = text.replace(/\s/g, "").length >= 40;
  // Anything with a transaction table is read as a statement, whatever it was filed as.
  const hasTable = textLayer && pages.some((p) => rowsOf(p.tokens).some((r) => findHeading(r)));
  if (hasTable) {
    const r = readStatementPages(pages, pageCount, { accountType: input.accountType });
    return {
      kind,
      issuer: r.bank,
      pages: pageCount,
      textLayer,
      readerVersion: READER_VERSION,
      result: r.status,
      layout: JSON.stringify(r.layout),
    };
  }
  const lower = text.toLowerCase();
  return {
    kind,
    issuer: issuerOf(text),
    pages: pageCount,
    textLayer,
    readerVersion: READER_VERSION,
    result: null,
    layout: JSON.stringify({
      readerVersion: READER_VERSION,
      pageSize: pages[0] ? [Math.round(pages[0].width), Math.round(pages[0].height)] : null,
      headingsFound: VOCAB.filter((v) => new RegExp(`\\b${v}\\b`).test(lower)),
    }),
  };
}

/** What a record looks like when shown or sent: no file hash. */
export function publicRecord(
  r: {
    id: string;
    createdAt: Date;
    kind: string;
    issuer: string | null;
    pages: number;
    textLayer: boolean;
    readerVersion: number;
    result: string | null;
    layout: string;
    sentAt: Date | null;
  },
  appVersion: string,
) {
  let layout: unknown = null;
  try {
    layout = JSON.parse(r.layout);
  } catch {
    layout = null;
  }
  return {
    id: r.id,
    recordedOn: r.createdAt.toISOString().slice(0, 10),
    appVersion,
    kind: r.kind,
    issuer: r.issuer,
    pages: r.pages,
    textLayer: r.textLayer,
    readerVersion: r.readerVersion,
    result: r.result,
    layout,
    sentAt: r.sentAt?.toISOString() ?? null,
  };
}
