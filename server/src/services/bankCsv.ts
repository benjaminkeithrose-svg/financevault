import { parse } from "csv-parse/sync";

/**
 * Australian bank CSV exports have no common shape. CommBank ships no header
 * row at all; Westpac splits money in and out across two columns; column
 * order and date format differ everywhere. Rather than maintain a guessed
 * profile per bank — which silently mis-imports the moment a bank changes
 * its export — the file is inspected, a mapping is proposed, and the user
 * confirms it before anything is written.
 */

export type DateFormat = "DMY" | "MDY" | "YMD";

export interface ColumnMapping {
  dateColumn: number;
  descriptionColumn: number;
  /** Single signed amount column. Mutually exclusive with debit/credit. */
  amountColumn?: number | null;
  debitColumn?: number | null;
  creditColumn?: number | null;
  dateFormat: DateFormat;
  hasHeaderRow: boolean;
  /** For the banks that export money out as a positive number. */
  invertSign?: boolean;
}

export interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
}

export interface CsvInspection {
  headers: string[] | null;
  sampleRows: string[][];
  totalRows: number;
  proposed: ColumnMapping;
}

// Ordered most specific first. NAB exports carry both a "Transaction Type"
// ("EFTPOS") and a "Transaction Details" (the actual merchant); matching the
// generic word first would file every transaction under its type.
const DATE_HINTS = ["transaction date", "date", "when", "processed"];
const DESCRIPTION_HINTS = ["description", "narrative", "details", "merchant", "memo", "reference", "transaction"];
const AMOUNT_HINTS = ["amount", "value"];
const DEBIT_HINTS = ["debit", "withdrawal", "money out", "paid out"];
const CREDIT_HINTS = ["credit", "deposit", "money in", "paid in"];

function readRows(text: string): string[][] {
  return parse(text, {
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  }) as string[][];
}

/** A header row is text in every cell and no parseable date or amount. */
function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  const anyDate = row.some((c) => parseDate(c, "DMY") || parseDate(c, "YMD"));
  const anyAmount = row.some((c) => parseAmount(c) !== null && /\d/.test(c));
  return !anyDate && !anyAmount;
}

export function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = raw.trim().replace(/[$\s,]/g, "");
  if (!cleaned) return null;
  // Accounting style: (123.45) means negative.
  const negatedByParens = /^\((.*)\)$/.exec(cleaned);
  const body = negatedByParens ? negatedByParens[1] : cleaned;
  // CommBank writes credits with an explicit leading "+".
  if (!/^[-+]?\d*\.?\d+$/.test(body)) return null;
  const value = Number(body);
  if (Number.isNaN(value)) return null;
  return negatedByParens ? -value : value;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export function parseDate(raw: string | undefined, format: DateFormat): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // 14 Oct 2024 / 14-Oct-2024 — unambiguous, so the format hint isn't needed.
  const named = /^(\d{1,2})[\s\-\/]*([A-Za-z]{3,})[\s\-\/]*(\d{2,4})$/.exec(value);
  if (named) {
    const month = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month >= 0) {
      const year = normaliseYear(Number(named[3]));
      const date = new Date(Date.UTC(year, month, Number(named[1])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const numeric = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/.exec(value);
  if (!numeric) return null;
  const [, a, b, c] = numeric;

  let day: number;
  let month: number;
  let year: number;
  if (format === "YMD") {
    year = Number(a); month = Number(b); day = Number(c);
  } else if (format === "MDY") {
    month = Number(a); day = Number(b); year = Number(c);
  } else {
    day = Number(a); month = Number(b); year = Number(c);
  }

  year = normaliseYear(year);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects things like 31/02 that roll over into the next month.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function normaliseYear(year: number): number {
  if (year >= 1000) return year;
  // A two-digit year in a bank statement is this century, not the 1900s.
  return year < 70 ? 2000 + year : 1900 + year;
}

/** Hints are tried in order, so a more specific one always wins. */
function findColumn(headers: string[] | null, hints: string[]): number | null {
  if (!headers) return null;
  const normalised = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const index = normalised.findIndex((h) => h.includes(hint));
    if (index >= 0) return index;
  }
  return null;
}

/**
 * Works out the likely shape of the file. Everything here is a proposal the
 * user confirms — nothing is imported on the strength of these guesses.
 */
export function inspectCsv(text: string): CsvInspection {
  const rows = readRows(text);
  if (rows.length === 0) {
    throw new Error("That file has no rows in it.");
  }

  const hasHeaderRow = looksLikeHeader(rows[0]);
  const headers = hasHeaderRow ? rows[0] : null;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  if (dataRows.length === 0) {
    throw new Error("That file has a header but no transactions in it.");
  }

  let dateColumn = findColumn(headers, DATE_HINTS);
  let descriptionColumn = findColumn(headers, DESCRIPTION_HINTS);
  let amountColumn = findColumn(headers, AMOUNT_HINTS);
  const debitColumn = findColumn(headers, DEBIT_HINTS);
  const creditColumn = findColumn(headers, CREDIT_HINTS);

  // Split debit/credit columns take precedence — a file with both plus an
  // "amount" column (Westpac-style) would otherwise double-count.
  const usesSplitColumns = debitColumn !== null && creditColumn !== null;
  if (usesSplitColumns) amountColumn = null;

  const sample = dataRows.slice(0, 20);
  const columnCount = Math.max(...dataRows.map((r) => r.length));

  // Without headers (CommBank), fall back to what the data itself looks like.
  const dateFormat = detectDateFormat(sample, dateColumn ?? guessDateColumn(sample, columnCount) ?? 0);
  if (dateColumn === null) dateColumn = guessDateColumn(sample, columnCount) ?? 0;
  if (amountColumn === null && !usesSplitColumns) {
    amountColumn = guessAmountColumn(sample, columnCount, dateColumn);
  }
  if (descriptionColumn === null) {
    descriptionColumn = guessDescriptionColumn(sample, columnCount, dateColumn, amountColumn);
  }

  return {
    headers,
    sampleRows: dataRows.slice(0, 5),
    totalRows: dataRows.length,
    proposed: {
      dateColumn,
      descriptionColumn,
      amountColumn: usesSplitColumns ? null : amountColumn ?? 1,
      debitColumn: usesSplitColumns ? debitColumn : null,
      creditColumn: usesSplitColumns ? creditColumn : null,
      dateFormat,
      hasHeaderRow,
      invertSign: false,
    },
  };
}

function guessDateColumn(rows: string[][], columnCount: number): number | null {
  let best: { index: number; hits: number } | null = null;
  for (let i = 0; i < columnCount; i++) {
    const hits = rows.filter((r) => parseDate(r[i], "DMY") || parseDate(r[i], "YMD")).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { index: i, hits };
  }
  return best?.index ?? null;
}

/** The amount is the numeric column with the most decimal values. */
function guessAmountColumn(rows: string[][], columnCount: number, dateColumn: number): number | null {
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i < columnCount; i++) {
    if (i === dateColumn) continue;
    const decimals = rows.filter((r) => {
      const v = parseAmount(r[i]);
      return v !== null && /[.,]\d{2}\b/.test((r[i] ?? "").trim());
    }).length;
    if (decimals > 0 && (!best || decimals > best.score)) best = { index: i, score: decimals };
  }
  return best?.index ?? null;
}

/** The description is the longest consistently non-numeric column. */
function guessDescriptionColumn(
  rows: string[][],
  columnCount: number,
  dateColumn: number,
  amountColumn: number | null
): number {
  let best: { index: number; length: number } | null = null;
  for (let i = 0; i < columnCount; i++) {
    if (i === dateColumn || i === amountColumn) continue;
    const textRows = rows.filter((r) => (r[i] ?? "").trim() && parseAmount(r[i]) === null);
    if (textRows.length === 0) continue;
    const avgLength = textRows.reduce((s, r) => s + r[i].trim().length, 0) / textRows.length;
    if (!best || avgLength > best.length) best = { index: i, length: avgLength };
  }
  return best?.index ?? 0;
}

function detectDateFormat(rows: string[][], dateColumn: number): DateFormat {
  let dmyOnly = 0;
  let mdyOnly = 0;
  let ymd = 0;
  for (const row of rows) {
    const raw = (row[dateColumn] ?? "").trim();
    const numeric = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/.exec(raw);
    if (!numeric) continue;
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    if (numeric[1].length === 4) ymd++;
    else if (a > 12 && b <= 12) dmyOnly++;
    else if (b > 12 && a <= 12) mdyOnly++;
  }
  if (ymd > dmyOnly && ymd > mdyOnly) return "YMD";
  if (mdyOnly > dmyOnly) return "MDY";
  // Australian exports are day-first, and it's the safer default when every
  // date in the sample is ambiguous (e.g. all days <= 12).
  return "DMY";
}

export interface ConversionResult {
  rows: ParsedRow[];
  skipped: Array<{ line: number; reason: string; raw: string[] }>;
}

export function convertRows(text: string, mapping: ColumnMapping): ConversionResult {
  const all = readRows(text);
  const dataRows = mapping.hasHeaderRow ? all.slice(1) : all;
  const rows: ParsedRow[] = [];
  const skipped: ConversionResult["skipped"] = [];

  dataRows.forEach((raw, index) => {
    const line = index + (mapping.hasHeaderRow ? 2 : 1);
    const date = parseDate(raw[mapping.dateColumn], mapping.dateFormat);
    if (!date) {
      skipped.push({ line, reason: "Couldn't read a date", raw });
      return;
    }

    let amount: number | null = null;
    if (mapping.debitColumn !== null && mapping.debitColumn !== undefined && mapping.creditColumn !== null && mapping.creditColumn !== undefined) {
      const debit = parseAmount(raw[mapping.debitColumn]);
      const credit = parseAmount(raw[mapping.creditColumn]);
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    } else if (mapping.amountColumn !== null && mapping.amountColumn !== undefined) {
      amount = parseAmount(raw[mapping.amountColumn]);
    }

    if (amount === null) {
      skipped.push({ line, reason: "Couldn't read an amount", raw });
      return;
    }
    if (mapping.invertSign) amount = -amount;

    const description = (raw[mapping.descriptionColumn] ?? "").trim() || "(no description)";
    rows.push({ date, description, amount });
  });

  return { rows, skipped };
}
