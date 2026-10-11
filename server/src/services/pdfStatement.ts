import * as mupdf from "mupdf";

/**
 * Reading the transactions out of a bank or credit card statement saved as a
 * PDF from internet banking.
 *
 * Every bank lays its statement out differently, so nothing here is a
 * per-bank template. The reader finds the table's heading row (Date,
 * Description, Debit, Credit, Balance — in whatever words the bank uses),
 * works out where each column sits on the page, and reads the rows under it
 * by position: a date starts a transaction, numbers are placed by which
 * column they line up with, and lines with only words carry on the
 * description above.
 *
 * Then it checks itself the way a person would: the opening balance plus
 * each transaction must give every balance the statement prints, and the
 * closing balance. A statement that doesn't add up is reported with where it
 * goes wrong — it's never quietly "fixed". The one thing the balances are
 * allowed to settle is which way a figure goes (in or out) when the
 * statement itself doesn't say.
 *
 * A scanned statement (a picture, no text) can't be read this way yet.
 */

export const READER_VERSION = 1;

// ---------------------------------------------------------------------------
// Words and where they sit
// ---------------------------------------------------------------------------

export interface Tok {
  text: string;
  x0: number;
  x1: number;
  /** Baseline. */
  y: number;
  size: number;
  /** Left and right edge of each character (spaces included), to split a token that runs across two columns. */
  chars: Array<[number, number]>;
}

export interface PdfPage {
  width: number;
  height: number;
  tokens: Tok[];
}

const MAX_PAGES = 80;

/**
 * The words on each page with their positions. Characters are joined into a
 * token until there's a gap wider than about a space and a half — enough to
 * keep "EFTPOS WOOLWORTHS 1234" together and split it from the column next to it.
 */
export function pdfPages(buffer: Buffer): { pages: PdfPage[]; pageCount: number } {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  try {
    const pageCount = doc.countPages();
    const pages: PdfPage[] = [];
    for (let i = 0; i < Math.min(pageCount, MAX_PAGES); i++) {
      const page = doc.loadPage(i);
      const [bx0, by0, bx1, by1] = page.getBounds();
      const st = page.toStructuredText("preserve-whitespace");
      const tokens: Tok[] = [];
      let cur: Tok | null = null;
      let spaced = false;
      const flush = () => {
        if (cur && cur.text.trim()) tokens.push(cur);
        cur = null;
        spaced = false;
      };
      st.walk({
        beginLine: () => flush(),
        endLine: () => flush(),
        onChar: (c, origin, _font, size, quad) => {
          const x0 = Math.min(quad[0], quad[4]);
          const x1 = Math.max(quad[2], quad[6]);
          if (!c.trim()) {
            spaced = true;
            return;
          }
          const gap = cur ? x0 - cur.x1 : 0;
          if (cur && (Math.abs(origin[1] - cur.y) > size * 0.5 || gap > Math.max(size * 0.75, 4) || gap < -size)) flush();
          if (!cur) {
            cur = { text: c, x0, x1, y: origin[1], size, chars: [[x0, x1]] };
          } else {
            if (spaced || gap > size * 0.2) {
              cur.text += " ";
              cur.chars.push([cur.x1, x0]);
            }
            cur.text += c;
            cur.chars.push([x0, x1]);
            cur.x1 = Math.max(cur.x1, x1);
          }
          spaced = false;
        },
      });
      flush();
      pages.push({ width: bx1 - bx0, height: by1 - by0, tokens });
    }
    return { pages, pageCount };
  } finally {
    doc.destroy();
  }
}

/** Tokens grouped into lines, top to bottom, each left to right. */
export function rowsOf(tokens: Tok[]): Tok[][] {
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const rows: Tok[][] = [];
  for (const t of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - t.y) <= Math.max(2, t.size * 0.35)) row.push(t);
    else rows.push([t]);
  }
  return rows.map((r) => r.sort((a, b) => a.x0 - b.x0));
}

/** Part of a token, from character `from` up to (not including) `to`. */
export function slice(t: Tok, from: number, to: number): Tok {
  while (from < to && t.text[from] === " ") from++;
  while (to > from && t.text[to - 1] === " ") to--;
  return { ...t, text: t.text.slice(from, to), x0: t.chars[from][0], x1: t.chars[to - 1][1], chars: t.chars.slice(from, to) };
}

/** Each word of a token, with its position. */
export function words(t: Tok): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  for (const m of t.text.matchAll(re)) out.push(slice(t, m.index!, m.index! + m[0].length));
  return out;
}

/**
 * Splits a token where columns have run together with only a space between
 * them: a date at the start, and each amount (with its CR or DR) on its own.
 * Words of a description stay together.
 */
export function separate(t: Tok): Tok[] {
  const ws = words(t);
  if (ws.length < 2) return [t];
  const out: Tok[] = [];
  let i = 0;
  // A leading date of up to three words ("12 Mar", "12 Mar 2024", "Mar 12").
  for (const n of [3, 2, 1]) {
    if (
      ws.length > n &&
      parseStatementDate(
        ws
          .slice(0, n)
          .map((w) => w.text)
          .join(" "),
      )
    ) {
      out.push(slice(t, t.chars.indexOf(ws[0].chars[0]), t.chars.indexOf(ws[n - 1].chars.at(-1)!) + 1));
      i = n;
      break;
    }
  }
  let run: Tok[] = [];
  const endRun = () => {
    if (run.length) out.push(slice(t, t.chars.indexOf(run[0].chars[0]), t.chars.indexOf(run.at(-1)!.chars.at(-1)!) + 1));
    run = [];
  };
  for (; i < ws.length; i++) {
    const w = ws[i];
    const next = ws[i + 1];
    if (parseStatementAmount(w.text)) {
      endRun();
      if (next && /^(CR|DR|Cr|Dr|cr|dr|-)$/.test(next.text)) {
        out.push(slice(t, t.chars.indexOf(w.chars[0]), t.chars.indexOf(next.chars.at(-1)!) + 1));
        i++;
      } else out.push(w);
      continue;
    }
    run.push(w);
  }
  endRun();
  return out;
}

// ---------------------------------------------------------------------------
// Dates and amounts
// ---------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (s: string) => {
  const m = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return m >= 0 && /^[a-z]+\.?$/i.test(s) && (s.length <= 4 || MONTH_NAMES.some((n) => n.startsWith(s.toLowerCase().replace(".", ""))))
    ? m
    : -1;
};
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "sept",
];
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

export interface DateParts {
  day: number;
  month: number; // 0-11
  year: number | null;
  /** The shape, for the layout record: "DD/MM/YY", "DD Mon", "Mon DD", … */
  format: string;
}

/** A date as statements print them. Day before month, as in Australia. */
export function parseStatementDate(raw: string): DateParts | null {
  const s = raw.trim().replace(/,/g, "");
  let m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const parts = {
      day: Number(m[1]),
      month: Number(m[3]) - 1,
      year: fullYear(m[4]),
      format: `DD${m[2]}MM${m[2]}${m[4].length === 2 ? "YY" : "YYYY"}`,
    };
    return valid(parts) ? parts : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const parts = { day: Number(m[3]), month: Number(m[2]) - 1, year: Number(m[1]), format: "YYYY-MM-DD" };
    return valid(parts) ? parts : null;
  }
  m = /^(\d{1,2})([ -])([A-Za-z]{3,9}\.?)(?:[ -](\d{2}|\d{4}))?$/.exec(s);
  if (m && monthOf(m[3]) >= 0) {
    const parts = {
      day: Number(m[1]),
      month: monthOf(m[3]),
      year: m[4] ? fullYear(m[4]) : null,
      format: `DD${m[2]}Mon${m[4] ? `${m[2]}${m[4].length === 2 ? "YY" : "YYYY"}` : ""}`,
    };
    return valid(parts) ? parts : null;
  }
  m = /^([A-Za-z]{3,9}\.?) (\d{1,2})(?: (\d{2}|\d{4}))?$/.exec(s);
  if (m && monthOf(m[1]) >= 0) {
    const parts = {
      day: Number(m[2]),
      month: monthOf(m[1]),
      year: m[3] ? fullYear(m[3]) : null,
      format: `Mon DD${m[3] ? (m[3].length === 2 ? " YY" : " YYYY") : ""}`,
    };
    return valid(parts) ? parts : null;
  }
  return null;
}

function valid(p: DateParts) {
  if (p.month < 0 || p.month > 11 || p.day < 1 || p.day > 31) return false;
  const d = new Date(Date.UTC(p.year ?? 2024, p.month, p.day));
  return d.getUTCMonth() === p.month;
}

/** A date at the start of a token ("02 Jan EFTPOS …" when the columns sit close): the date and the rest. */
function leadingDate(text: string): { date: DateParts; rest: string } | null {
  const words = text.split(" ");
  for (const n of [3, 2, 1]) {
    if (words.length <= n) continue;
    const d = parseStatementDate(words.slice(0, n).join(" "));
    if (d) return { date: d, rest: words.slice(n).join(" ") };
  }
  return null;
}

export interface Amount {
  value: number; // always positive
  minus: boolean; // a minus sign or brackets
  cr: boolean;
  dr: boolean;
}

const AMOUNT = /^(-|−)?\s?\$?\s?(\()?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})(\))?\s?(-|CR|DR|Cr|Dr|cr|dr)?$/;

export function parseStatementAmount(raw: string): Amount | null {
  const m = AMOUNT.exec(raw.trim());
  if (!m) return null;
  const value = Number((m[3] + m[4]).replace(/,/g, ""));
  const suffix = (m[6] ?? "").toUpperCase();
  return { value, minus: !!m[1] || (!!m[2] && !!m[5]) || suffix === "-", cr: suffix === "CR", dr: suffix === "DR" };
}

// ---------------------------------------------------------------------------
// The heading row
// ---------------------------------------------------------------------------

export type ColumnKind = "date" | "description" | "debit" | "credit" | "amount" | "balance";

export interface Column {
  kind: ColumnKind;
  x0: number;
  x1: number;
  /** The heading as printed — kept on this computer only; the layout record uses headingWords. */
  label: string;
}

export function headingKind(text: string): ColumnKind | null {
  const t = text
    .toLowerCase()
    .replace(/\(\$\)|\$|\(aud\)|:/g, "")
    .trim();
  if (!t || t.length > 40 || /\d{2}/.test(t)) return null;
  if (/\bdate\b|^posted$|^processed$|^when$/.test(t) && !/balance/.test(t)) return "date";
  if (/balance/.test(t)) return "balance";
  const credit = /(credit|deposit|money in|paid in|receipt|incoming)/.test(t);
  const debit = /(debit|withdrawal|money out|paid out|payments? out|outgoing|spent|charges?\b)/.test(t);
  if (credit && debit) return "amount";
  if (credit) return "credit";
  if (debit) return "debit";
  if (/^(transaction )?(amount|value)\b/.test(t)) return "amount";
  if (/(description|details|transaction|particulars|narrative|narration|reference|merchant)/.test(t)) return "description";
  return null;
}

/** A heading row: a date column, somewhere for the money (debit and credit, an amount, or a balance), and at least three in all. */
export function findHeading(row: Tok[]): Column[] | null {
  const cols: Column[] = [];
  const pieces: Tok[] = [];
  for (const t of row) {
    const whole = headingKind(t.text);
    const ws = words(t);
    const kinds = ws.map((w) => headingKind(w.text));
    const distinct = new Set(kinds.filter((k) => k));
    // "Transaction date" and "Transaction details" are one heading; "CREDIT BALANCE" with only a space between is two.
    if (ws.length > 1 && distinct.size > 1 && whole !== "date" && whole !== "description") {
      let run: Tok[] = [];
      let kind: ColumnKind | null = null;
      const end = () => {
        if (run.length) pieces.push(slice(t, t.chars.indexOf(run[0].chars[0]), t.chars.indexOf(run.at(-1)!.chars.at(-1)!) + 1));
        run = [];
      };
      ws.forEach((w, i) => {
        if (kinds[i] && kind && kinds[i] !== kind) end();
        if (kinds[i]) kind = kinds[i];
        run.push(w);
      });
      end();
    } else pieces.push(t);
  }
  for (const t of pieces) {
    const kind = headingKind(t.text);
    if (!kind) continue;
    if (cols.some((c) => c.kind === kind)) continue;
    cols.push({ kind, x0: t.x0, x1: t.x1, label: t.text });
  }
  const has = (k: ColumnKind) => cols.some((c) => c.kind === k);
  const money = has("amount") || (has("debit") && has("credit")) || has("balance");
  if (!has("date") || !money || cols.length < 3) return null;
  // The words that aren't headings must be few — a sentence that happens to say "date" and "balance" isn't a heading.
  if (pieces.length > cols.length + 2) return null;
  return cols.sort((a, b) => a.x0 - b.x0);
}

// ---------------------------------------------------------------------------
// Reading the statement
// ---------------------------------------------------------------------------

export interface ReadTransaction {
  date: Date;
  description: string;
  /** Money in positive, money out negative — the app's convention, credit cards included. */
  amount: number;
  /** The balance printed beside it, if any (in the statement's own sense). */
  balance: number | null;
  page: number;
  /** Which way it went came from the balances, not the statement's columns. */
  signFromBalance?: boolean;
}

export type CheckStatus = "ADDS_UP" | "DOESNT_ADD_UP" | "NOTHING_TO_CHECK" | "NOT_READ";

export interface Problem {
  page: number;
  /** Line on the page, counting from the top. */
  line: number;
  kind: "BALANCE_MISMATCH" | "CLOSING_MISMATCH" | "NO_YEAR" | "UNREAD_LINE";
  /** For the person: e.g. "the balance printed is $1,234.00 but the transactions give $1,224.00". Never in the layout record. */
  detail?: string;
}

export interface StatementReading {
  bank: string | null;
  scanned: boolean;
  pageCount: number;
  period: { from: Date; to: Date } | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ReadTransaction[];
  status: CheckStatus;
  /** Plain-English summary of the check. */
  message: string;
  problems: Problem[];
  /** "bank": balance goes up with money in; "owing": a card's balance owing, which goes up with spending. */
  balanceSense: "bank" | "owing" | null;
  /** The last four digits of any account or card numbers printed — to warn if it's another account's statement. Never leaves this computer. */
  accountEndings: string[];
  layout: StatementLayout;
}

/** How the statement is laid out — no amounts, descriptions, names, account numbers or transaction dates. */
export interface StatementLayout {
  readerVersion: number;
  pageSize: [number, number] | null;
  headings: Array<{ kind: ColumnKind; words: string; x0: number; x1: number }>;
  dateFormats: string[];
  amountStyle: { thousandsCommas: boolean; suffixes: string[]; minusSign: boolean; brackets: boolean; dollarSign: boolean };
  balanceSense: "bank" | "owing" | null;
  datesOnEveryRow: boolean;
  balanceOnEveryRow: boolean;
  wrappedDescriptions: boolean;
  periodFound: boolean;
  openingFound: boolean;
  closingFound: boolean;
  rowsRead: number;
  pagesWithHeading: number;
  problems: Array<{ page: number; line: number; kind: Problem["kind"] }>;
  /** Lines in the table that weren't understood, as shapes: "DATE TEXT AMOUNT". */
  unreadShapes: string[];
}

const BANKS: Array<[string, RegExp]> = [
  ["St.George", /st\.?\s?george/i],
  ["Bank of Melbourne", /bank of melbourne/i],
  ["BankSA", /\bbank ?sa\b/i],
  ["Westpac", /westpac/i],
  ["Macquarie", /macquarie/i],
  ["CommBank", /commonwealth bank|commbank/i],
  ["NAB", /national australia bank|\bnab\b/i],
  ["ANZ", /\banz\b/i],
  ["ING", /\bing\b(?: bank| direct)?/i],
  ["Bendigo Bank", /bendigo/i],
  ["Bank of Queensland", /bank of queensland|\bboq\b/i],
  ["Suncorp", /suncorp/i],
  ["Bankwest", /bankwest/i],
  ["HSBC", /\bhsbc\b/i],
  ["Citibank", /citibank|\bciti\b/i],
  ["American Express", /american express|\bamex\b/i],
  ["ME Bank", /\bme bank\b|members equity/i],
  ["Great Southern Bank", /great southern bank|\bcua\b/i],
  ["Heritage", /heritage bank|heritage and people/i],
  ["Newcastle Permanent", /newcastle permanent/i],
  ["Greater Bank", /greater bank/i],
  ["Beyond Bank", /beyond bank/i],
  ["Teachers Mutual", /teachers mutual/i],
  ["Police Bank", /police bank/i],
  ["IMB", /\bimb\b/i],
  ["People's Choice", /people'?s choice/i],
  ["Bank Australia", /bank australia/i],
  ["Defence Bank", /defence bank/i],
  ["MyState", /mystate/i],
  ["Auswide", /auswide/i],
  ["RACQ Bank", /racq/i],
  ["UBank", /\bubank\b/i],
  ["Up", /\bup bank\b/i],
  ["AMP", /\bamp bank\b/i],
  ["Rabobank", /rabobank/i],
  ["Judo Bank", /judo bank/i],
  ["Latitude", /latitude/i],
  ["Coles Financial Services", /coles (credit card|financial)/i],
  ["Virgin Money", /virgin money/i],
];

export function detectBank(text: string): string | null {
  for (const [name, re] of BANKS) if (re.test(text)) return name;
  return null;
}

const SPECIAL = {
  opening: /\b(opening balance|balance brought forward|brought forward|balance b\/?f|opening)\b/i,
  closing: /\b(closing balance)\b/i,
  carried: /\b(balance carried forward|carried forward|balance c\/?f)\b/i,
  total: /^(totals?|sub ?total|total debits|total credits)\b/i,
};

interface Row {
  page: number;
  line: number;
  y: number;
  toks: Tok[];
}

/** The statement period: two dates with years on a line that says "period" (or "from … to …"). */
function findPeriod(lines: string[]): { from: Date; to: Date } | null {
  const DATE_IN_TEXT =
    /(\d{1,2}(?:st|nd|rd|th)?[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[ -](?:\d{4}|\d{2})|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))/gi;
  const toDate = (s: string) => {
    const p = parseStatementDate(
      s
        .replace(/(\d)(st|nd|rd|th)/i, "$1")
        .replace(/-/g, s.includes("/") ? "-" : " ")
        .replace(/\s+/g, " "),
    );
    return p && p.year ? new Date(Date.UTC(p.year, p.month, p.day)) : null;
  };
  const candidates: Array<{ from: Date; to: Date; score: number }> = [];
  for (const line of lines) {
    const found = [...line.matchAll(DATE_IN_TEXT)].map((m) => toDate(m[0])).filter((d): d is Date => !!d);
    if (found.length < 2) continue;
    const [from, to] = found;
    if (to <= from || to.getTime() - from.getTime() > 400 * 86_400_000) continue;
    const score = /period/i.test(line) ? 3 : /statement|from|to|–|-/i.test(line) ? 1 : 0;
    candidates.push({ from, to, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? { from: candidates[0].from, to: candidates[0].to } : null;
}

/** "Opening balance $1,234.56" in a summary box above the table. */
function summaryAmount(lines: string[], which: RegExp): Amount | null {
  for (const line of lines) {
    const m = which.exec(line);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length);
    const a = /(-|−)?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\s?(CR|DR|Cr|Dr)?/.exec(after);
    if (a) return parseStatementAmount(a[0].replace(/\s+(?=CR|DR|Cr|Dr)/, " "));
  }
  return null;
}

/** The last four digits of account and card numbers printed above the table (a BSB isn't one). */
function accountEndings(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    if (!/(account|acc no|acct|card)\b.{0,20}(no\.?|number|#)?/i.test(line)) continue;
    const clean = line.replace(/\bBSB:?\s*\d{3}[- ]?\d{3}/gi, "");
    for (const m of clean.matchAll(/(?:account|acc no|acct|card)[^\d]{0,24}((?:[\dxX*•]{2,6}[ -]?){2,6})/gi)) {
      const digits = m[1].replace(/[^\d]/g, "");
      if (digits.length >= 4) out.add(digits.slice(-4));
    }
  }
  return [...out];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Reads a statement. `accountType` is the app's account type — a credit
 * card's plain amounts are spending (money out).
 */
export function readStatement(buffer: Buffer, opts: { accountType?: string | null } = {}): StatementReading {
  const { pages, pageCount } = pdfPages(buffer);
  return readStatementPages(pages, pageCount, opts);
}

export function readStatementPages(pages: PdfPage[], pageCount: number, opts: { accountType?: string | null } = {}): StatementReading {
  const card = opts.accountType === "CREDIT_CARD";
  const allRows: Row[] = [];
  pages.forEach((p, pi) =>
    rowsOf(p.tokens).forEach((toks, li) => allRows.push({ page: pi + 1, line: li + 1, y: toks[0].y, toks: toks.flatMap(separate) })),
  );
  const lines = allRows.map((r) => r.toks.map((t) => t.text).join("  "));
  const text = lines.join("\n");
  const scanned = text.replace(/\s/g, "").length < 40;

  const layout: StatementLayout = {
    readerVersion: READER_VERSION,
    pageSize: pages[0] ? [Math.round(pages[0].width), Math.round(pages[0].height)] : null,
    headings: [],
    dateFormats: [],
    amountStyle: { thousandsCommas: false, suffixes: [], minusSign: false, brackets: false, dollarSign: false },
    balanceSense: null,
    datesOnEveryRow: true,
    balanceOnEveryRow: true,
    wrappedDescriptions: false,
    periodFound: false,
    openingFound: false,
    closingFound: false,
    rowsRead: 0,
    pagesWithHeading: 0,
    problems: [],
    unreadShapes: [],
  };
  const base = {
    bank: detectBank(lines.slice(0, 40).join("\n")) ?? detectBank(text),
    scanned,
    pageCount,
    accountEndings: accountEndings(
      lines.slice(
        0,
        Math.max(
          1,
          allRows.findIndex((r) => findHeading(r.toks)),
        ),
      ),
    ),
    layout,
  };
  if (scanned) {
    return {
      ...base,
      period: null,
      openingBalance: null,
      closingBalance: null,
      transactions: [],
      status: "NOT_READ",
      message: "This looks like a scan (a picture of the page), so there's no text to read the transactions from.",
      problems: [],
      balanceSense: null,
    };
  }

  const period = findPeriod(lines);
  layout.periodFound = !!period;
  const dateFormats = new Set<string>();
  const suffixes = new Set<string>();

  // --- Rows under each heading --------------------------------------------
  type Item =
    | {
        type: "txn";
        date: DateParts;
        desc: string[];
        debit?: Amount;
        credit?: Amount;
        amount?: Amount;
        balance?: Amount;
        page: number;
        line: number;
        lastY: number;
        lineHeight: number;
      }
    | { type: "check"; kind: "opening" | "carried" | "closing"; balance: Amount; page: number; line: number };
  const items: Item[] = [];
  let columns: Column[] | null = null;
  let headingPage = 0;
  let lastDate: DateParts | null = null;
  let pending: (Item & { type: "txn" }) | null = null;
  let finished = false;
  const problems: Problem[] = [];

  const noteAmount = (raw: string) => {
    if (/,\d{3}/.test(raw)) layout.amountStyle.thousandsCommas = true;
    if (/^-|^−|-$/.test(raw.trim())) layout.amountStyle.minusSign = true;
    if (/\(/.test(raw)) layout.amountStyle.brackets = true;
    if (/\$/.test(raw)) layout.amountStyle.dollarSign = true;
    const s = /(CR|DR)$/i.exec(raw.trim());
    if (s) suffixes.add(s[1].toUpperCase());
  };
  const shape = (toks: Tok[]) =>
    toks
      .map((t) =>
        parseStatementDate(t.text) ? "DATE" : parseStatementAmount(t.text) ? "AMOUNT" : /^[-–—]$/.test(t.text) ? "DASH" : "TEXT",
      )
      .join(" ");

  const headingY = new Map<number, number>();
  for (const r of allRows) if (!headingY.has(r.page) && findHeading(r.toks)) headingY.set(r.page, r.y);

  const consumed = new Set<Tok>();
  for (let ri = 0; ri < allRows.length; ri++) {
    const row = allRows[ri];
    if (finished) break;
    const heading = findHeading(row.toks);
    if (heading) {
      if (!columns || row.page !== headingPage) layout.pagesWithHeading += 1;
      columns = heading;
      headingPage = row.page;
      if (!layout.headings.length) {
        layout.headings = heading.map((c) => ({ kind: c.kind, words: headingWords(c.label), x0: Math.round(c.x0), x1: Math.round(c.x1) }));
      }
      continue;
    }
    if (!columns) continue;
    // A page without its own heading uses the last one; rows above a page's own heading are its letterhead.
    const pageHeadingY = headingY.get(row.page);
    if (pageHeadingY !== undefined && row.y < pageHeadingY) continue;

    const money = columns.filter((c) => ["debit", "credit", "amount", "balance"].includes(c.kind));
    const moneyStart = Math.min(...money.map((c) => c.x0)) - 2;
    const descCol = columns.find((c) => c.kind === "description");
    const dateEdge = descCol ? descCol.x0 - 2 : moneyStart;

    const toks: Tok[] = row.toks.filter((t) => !consumed.has(t));
    if (!toks.length) continue;
    // The second line of a heading: "($)", "(AUD)".
    if (toks.every((t) => /^\(?(\$|aud)\)?$/i.test(t.text))) continue;
    let date: DateParts | null = null;
    const desc: string[] = [];
    const amounts: Array<{ col: Column; amount: Amount }> = [];
    let other = false;
    let absorbed = 0;
    for (const t of toks) {
      if (!date && t.x0 < dateEdge) {
        const d = parseStatementDate(t.text);
        if (d) {
          date = d;
          continue;
        }
        const lead = leadingDate(t.text);
        if (lead) {
          date = lead.date;
          desc.push(lead.rest);
          continue;
        }
        // A date wrapped onto two lines in a narrow column ("15" over "Dec", "03-Feb-" over "24").
        const below = allRows[ri + 1];
        if (below && below.page === row.page && below.y - row.y < t.size * 1.8) {
          const n = below.toks.find((b) => b.x0 < dateEdge && !consumed.has(b));
          const joined = n && (parseStatementDate(`${t.text} ${n.text}`) ?? parseStatementDate(`${t.text}${n.text}`));
          if (n && joined) {
            date = joined;
            consumed.add(n);
            continue;
          }
        }
      }
      const a = t.x0 >= moneyStart - 6 ? parseStatementAmount(t.text) : null;
      if (a) {
        const col = money
          .map((c) => ({ c, d: Math.min(Math.abs(t.x1 - c.x1), Math.abs((t.x0 + t.x1) / 2 - (c.x0 + c.x1) / 2)) }))
          .sort((p, q) => p.d - q.d)[0].c;
        if (!amounts.some((x) => x.col === col)) {
          amounts.push({ col, amount: a });
          noteAmount(t.text);
          continue;
        }
      }
      if (/^[-–—]$/.test(t.text) && t.x0 >= moneyStart - 6) continue; // a dash for "nothing"
      // "CR" or "DR" wrapped onto the line below its amount in a narrow column.
      if (/^(CR|DR)$/i.test(t.text) && t.x0 >= moneyStart - 6 && !amounts.length) {
        const above = pending ?? items.at(-1);
        const target = above && above.page === row.page ? (above.balance ?? (above.type === "txn" ? above.amount : undefined)) : undefined;
        if (target && !target.cr && !target.dr) {
          if (t.text.toUpperCase() === "CR") target.cr = true;
          else target.dr = true;
          suffixes.add(t.text.toUpperCase());
          absorbed++;
          continue;
        }
      }
      if (t.x0 < moneyStart) desc.push(t.text);
      else other = true;
    }
    const words = desc.join(" ").replace(/\s+/g, " ").trim();
    if (absorbed && !words && !amounts.length && !date && !other) continue;
    const get = (k: ColumnKind) => amounts.find((x) => x.col.kind === k)?.amount;
    const bal = get("balance");
    const anyMoney = !!(get("debit") || get("credit") || get("amount"));

    // Headings and totals.
    if (SPECIAL.total.test(words)) continue;
    const special = SPECIAL.closing.test(words)
      ? "closing"
      : SPECIAL.carried.test(words)
        ? "carried"
        : SPECIAL.opening.test(words) && !anyMoney
          ? "opening"
          : null;
    if (special) {
      const b = bal ?? (amounts.length === 1 ? amounts[0].amount : undefined);
      if (b) items.push({ type: "check", kind: special, balance: b, page: row.page, line: row.line });
      if (special === "closing") finished = true;
      pending = null;
      continue;
    }

    if (date) {
      dateFormats.add(date.format);
      lastDate = date;
      if (!anyMoney) {
        // The money may be on the description's last line.
        pending = {
          type: "txn",
          date,
          desc: words ? [words] : [],
          balance: bal,
          page: row.page,
          line: row.line,
          lastY: row.y,
          lineHeight: row.toks[0].size * 1.3,
        };
        continue;
      }
      pending = null;
      items.push({
        type: "txn",
        date,
        desc: words ? [words] : [],
        debit: get("debit"),
        credit: get("credit"),
        amount: get("amount"),
        balance: bal,
        page: row.page,
        line: row.line,
        lastY: row.y,
        lineHeight: row.toks[0].size * 1.3,
      });
      continue;
    }
    if (anyMoney) {
      if (pending) {
        const p: Item & { type: "txn" } = pending;
        items.push({
          ...p,
          desc: words ? [...p.desc, words] : p.desc,
          debit: get("debit"),
          credit: get("credit"),
          amount: get("amount"),
          balance: bal ?? p.balance,
          lastY: row.y,
        });
        layout.wrappedDescriptions = true;
        pending = null;
        continue;
      }
      if (lastDate) {
        // A bank that prints the date only on the first transaction of the day.
        layout.datesOnEveryRow = false;
        items.push({
          type: "txn",
          date: lastDate,
          desc: words ? [words] : [],
          debit: get("debit"),
          credit: get("credit"),
          amount: get("amount"),
          balance: bal,
          page: row.page,
          line: row.line,
          lastY: row.y,
          lineHeight: row.toks[0].size * 1.3,
        });
        continue;
      }
    }
    // Words only: more of the description above, if it's close underneath it.
    const last = items.at(-1);
    if (words && !other && !amounts.length) {
      const target = pending ?? (last?.type === "txn" && last.page === row.page ? last : null);
      if (target && row.y - target.lastY <= target.lineHeight * 1.9) {
        target.desc.push(words);
        target.lastY = row.y;
        layout.wrappedDescriptions = true;
        continue;
      }
      continue; // page footers, notes and the like
    }
    if (bal && !anyMoney && !date && last?.type === "txn" && last.balance === undefined && last.page === row.page) {
      last.balance = bal;
      continue;
    }
    if (toks.length) layout.unreadShapes.length < 20 && layout.unreadShapes.push(shape(toks));
    problems.push({ page: row.page, line: row.line, kind: "UNREAD_LINE" });
  }
  layout.dateFormats = [...dateFormats];
  layout.amountStyle.suffixes = [...suffixes];

  // --- Years ---------------------------------------------------------------
  const toDate = (d: DateParts): Date | null => {
    if (d.year) return new Date(Date.UTC(d.year, d.month, d.day));
    if (!period) return null;
    for (const y of [period.from.getUTCFullYear(), period.to.getUTCFullYear()]) {
      const t = Date.UTC(y, d.month, d.day);
      if (t >= period.from.getTime() - 10 * 86_400_000 && t <= period.to.getTime() + 10 * 86_400_000) return new Date(t);
    }
    return new Date(Date.UTC(period.from.getUTCFullYear(), d.month, d.day));
  };

  // --- Opening and closing from a summary box, when the table has none ---
  const summaryOpening = summaryAmount(lines, /opening balance|previous balance|balance last statement/i);
  const summaryClosing = summaryAmount(lines, /closing balance|new balance|balance this statement/i);

  // --- Signs and the balance check, both ways round ----------------------
  const signed = (it: Item & { type: "txn" }): { amount: number; ambiguous: boolean } => {
    if (it.debit && !it.credit) return { amount: -it.debit.value, ambiguous: false };
    if (it.credit && !it.debit) return { amount: it.credit.value, ambiguous: false };
    if (it.debit && it.credit) return { amount: round2(it.credit.value - it.debit.value), ambiguous: false };
    const a = it.amount!;
    if (a.cr) return { amount: a.value, ambiguous: false };
    if (a.dr) return { amount: -a.value, ambiguous: false };
    if (a.minus) return { amount: card ? a.value : -a.value, ambiguous: false };
    return { amount: card ? -a.value : a.value, ambiguous: true };
  };
  const balanceIn = (a: Amount, sense: "bank" | "owing") =>
    sense === "bank" ? (a.dr || a.minus ? -a.value : a.value) : a.cr || a.minus ? -a.value : a.value;

  const attempt = (sense: "bank" | "owing") => {
    const d = sense === "bank" ? 1 : -1;
    const out: ReadTransaction[] = [];
    const found: Problem[] = [];
    let running: number | null = null;
    let opening: number | null = null;
    let closing: number | null = null;
    let checked = 0;
    let noYear = false;
    // After a balance that didn't match: what the transactions said it should have been.
    let computed: number | null = null;
    const firstCheck = items.find((i) => i.type === "check" && i.kind === "opening");
    if (firstCheck && firstCheck.type === "check") opening = balanceIn(firstCheck.balance, sense);
    else if (summaryOpening) opening = balanceIn(summaryOpening, sense);
    running = opening;
    for (const it of items) {
      if (it.type === "check") {
        const b = balanceIn(it.balance, sense);
        if (it.kind === "closing") closing = b;
        if (it === firstCheck) continue;
        if (running !== null) {
          checked++;
          if (!near(running, b))
            found.push({
              page: it.page,
              line: it.line,
              kind: it.kind === "closing" ? "CLOSING_MISMATCH" : "BALANCE_MISMATCH",
              detail: `the statement says ${money(b)} but the transactions give ${money(running)}`,
            });
        }
        running = b;
        continue;
      }
      const date = toDate(it.date);
      if (!date) noYear = true;
      let { amount, ambiguous } = signed(it);
      let signFromBalance = false;
      const b = it.balance ? balanceIn(it.balance, sense) : null;
      if (running !== null && b !== null) {
        const expected = round2(running + d * amount);
        const viaComputed = computed !== null ? round2(computed + d * amount) : null;
        computed = null;
        if (!near(expected, b) && viaComputed !== null && near(viaComputed, b)) {
          // The balance printed on the line before was the one that was wrong; this one agrees with the transactions.
          running = b;
          checked++;
          out.push({
            date: date ?? new Date(0),
            description: it.desc.join(" ").replace(/\s+/g, " ").trim(),
            amount: round2(amount),
            balance: b,
            page: it.page,
          });
          continue;
        }
        if (!near(expected, b)) {
          // The statement didn't say which way it went (or put it in the wrong column): the balance settles it.
          const flipped = round2(running - d * amount);
          if (near(flipped, b) && (ambiguous || !(it.debit || it.credit))) {
            amount = -amount;
            signFromBalance = true;
          } else {
            found.push({
              page: it.page,
              line: it.line,
              kind: "BALANCE_MISMATCH",
              detail: `the balance printed is ${money(b)} but the transactions give ${money(expected)}`,
            });
            computed = expected;
          }
        } else checked++;
        running = b;
      } else if (running !== null) {
        running = round2(running + d * amount);
      } else if (b !== null) {
        // No opening balance: start from the first balance printed.
        opening = round2(b - d * amount);
        running = b;
      }
      out.push({
        date: date ?? new Date(0),
        description: it.desc.join(" ").replace(/\s+/g, " ").trim(),
        amount: round2(amount),
        balance: b,
        page: it.page,
        ...(signFromBalance ? { signFromBalance } : {}),
      });
    }
    if (closing === null && summaryClosing) {
      closing = balanceIn(summaryClosing, sense);
      if (running !== null) {
        checked++;
        if (!near(running, closing))
          found.push({
            page: 1,
            line: 0,
            kind: "CLOSING_MISMATCH",
            detail: `the closing balance is ${money(closing)} but the transactions give ${money(running)}`,
          });
      }
    }
    if (noYear) found.push({ page: 1, line: 0, kind: "NO_YEAR" });
    return { sense, out, found, opening, closing, checked };
  };
  const a = attempt(card ? "owing" : "bank");
  const b = attempt(card ? "bank" : "owing");
  const best = b.found.length < a.found.length || (b.found.length === a.found.length && b.checked > a.checked) ? b : a;
  problems.push(...best.found);
  const txns = best.out;

  layout.balanceSense = items.some((i) => i.type === "check" || (i.type === "txn" && i.balance)) || summaryClosing ? best.sense : null;
  layout.balanceOnEveryRow = items.every((i) => i.type !== "txn" || !!i.balance);
  layout.openingFound = best.opening !== null;
  layout.closingFound = best.closing !== null;
  layout.rowsRead = txns.length;
  layout.problems = problems.map(({ page, line, kind }) => ({ page, line, kind }));

  const mismatches = best.found.filter((p) => p.kind !== "NO_YEAR");
  let status: CheckStatus;
  let message: string;
  if (!columns) {
    status = "NOT_READ";
    message = "Couldn't find the table of transactions (a heading row with Date and the amounts).";
  } else if (!txns.length) {
    status = "NOT_READ";
    message = "Found the table but no transactions in it.";
  } else if (best.found.some((p) => p.kind === "NO_YEAR")) {
    status = "DOESNT_ADD_UP";
    message = "Couldn't tell which year the transactions are in — the statement period wasn't found.";
  } else if (mismatches.length) {
    status = "DOESNT_ADD_UP";
    const first = mismatches[0];
    message = `Doesn't add up — first on page ${first.page}${first.line ? `, line ${first.line}` : ""}: ${first.detail}.`;
  } else if (best.checked === 0) {
    status = "NOTHING_TO_CHECK";
    message = "Read, but the statement prints no balances to check the transactions against.";
  } else {
    status = "ADDS_UP";
    message = `Adds up: ${txns.length} transactions, checked against ${best.checked} balance${best.checked === 1 ? "" : "s"} printed on the statement.`;
  }
  const unread = problems.filter((p) => p.kind === "UNREAD_LINE").length;
  if (unread && status !== "NOT_READ") message += ` ${unread} line${unread === 1 ? "" : "s"} in the table weren't understood.`;

  return {
    ...base,
    period: period ?? (txns.length ? { from: txns[0].date, to: txns.at(-1)!.date } : null),
    openingBalance: best.opening,
    closingBalance:
      best.closing ??
      (txns.length && best.opening !== null
        ? txns.reduce((s, t) => round2(s + (best.sense === "bank" ? 1 : -1) * t.amount), best.opening)
        : null),
    transactions: txns,
    status,
    message,
    problems,
    balanceSense: layout.balanceSense,
  };
}

const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Heading words for the layout record: only words statements use for headings; anything else is "[other]". */
const HEADING_VOCAB = new Set(
  "date transaction transactions description details debit debits credit credits withdrawal withdrawals deposit deposits balance amount value money in out paid particulars narrative narration reference merchant posted processed when effective of the and value $ ($) (aud) aud".split(
    " ",
  ),
);
export function headingWords(label: string): string {
  return label
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (HEADING_VOCAB.has(w) ? w : "[other]"))
    .join(" ");
}
