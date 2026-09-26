import { findDocumentTypeByKeyword } from "./documentTypes.js";
import { financialYearLabelForDate } from "./financialYear.js";
import { detectReferenceCode, isTaxReference } from "./taxReference.js";

export interface EntityCandidate {
  id: string;
  name: string;
}

export interface ClassificationInput {
  filename: string;
  text: string;
  entities: EntityCandidate[];
  /**
   * Folder the file came from on a bulk import, relative to the folder the
   * user picked. Their own filing ("Tax Returns/2023") is a deliberate,
   * free signal, so it's matched alongside the filename and contents.
   */
  folderPath?: string | null;
}

export interface ClassificationResult {
  documentType: string | null;
  entityId: string | null;
  entityName: string | null;
  financialYearLabel: string | null;
  amount: number | null;
  documentDate: Date | null;
  renewalDate: Date | null;
  taxRelevance: "UNKNOWN" | "POSSIBLE";
  confidenceScore: number;
  needsReview: boolean;
  /** Tax reference documents only: the ruling or guide code found in it. */
  referenceCode?: string | null;
}

const AMOUNT_PATTERN = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;

const DATE_PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => Date | null }> = [
  {
    // 14/10/2027 or 14-10-2027
    regex: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
    parse: (m) => {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return new Date(Date.UTC(year, month - 1, day));
    },
  },
  {
    // 14 October 2027
    regex: /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    parse: (m) => {
      const day = Number(m[1]);
      const month = MONTHS.indexOf(m[2].toLowerCase());
      const year = Number(m[3]);
      if (month < 0) return null;
      return new Date(Date.UTC(year, month, day));
    },
  },
];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function extractAllDates(text: string): Date[] {
  const dates: Date[] = [];
  for (const { regex, parse } of DATE_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const parsed = parse(match);
      if (parsed && !Number.isNaN(parsed.getTime())) dates.push(parsed);
    }
  }
  return dates;
}

export function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isNaN(value)) amounts.push(value);
  }
  return amounts;
}

function findRenewalDate(text: string): Date | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf("renewal");
  if (idx === -1) return null;
  const window = text.slice(idx, idx + 120);
  const dates = extractAllDates(window);
  return dates[0] ?? null;
}

/**
 * Pulls an explicit Australian financial year out of a folder or filename,
 * e.g. "2023-24", "2023-2024", "FY24", "FY2024".
 *
 * A bare year is deliberately NOT matched: "2023" could mean either
 * 2022-23 or 2023-24, and guessing would silently file documents into the
 * wrong year — worse than leaving it for the user to set.
 */
export function financialYearLabelFromText(text: string): string | null {
  const rangeMatch = text.match(/\b(20\d{2})\s*[-\/]\s*(\d{2}|20\d{2})\b/);
  if (rangeMatch) {
    const startYear = Number(rangeMatch[1]);
    const rawEnd = rangeMatch[2];
    const endYear = rawEnd.length === 4 ? Number(rawEnd) : 2000 + Number(rawEnd);
    if (endYear === startYear + 1) return `${startYear}-${String(endYear).slice(2)}`;
    return null;
  }

  const fyMatch = text.match(/\bFY\s*(20\d{2}|\d{2})\b/i);
  if (fyMatch) {
    const raw = fyMatch[1];
    // "FY24" means the year ENDING June 2024, so the label is 2023-24.
    const endYear = raw.length === 4 ? Number(raw) : 2000 + Number(raw);
    return `${endYear - 1}-${String(endYear).slice(2)}`;
  }

  return null;
}

export function classifyDocument(input: ClassificationInput): ClassificationResult {
  const { filename, text, entities, folderPath } = input;
  // Real filenames separate words with underscores and hyphens
  // ("CommBank_Statement_2024_01.pdf"), so matching them raw would miss every
  // multi-word keyword. Separators are normalised to spaces for matching
  // only — the stored filename is untouched.
  const normalisePath = (value: string) => value.replace(/[\/_\-.]+/g, " ");
  const haystack = `${folderPath ? normalisePath(folderPath) + "\n" : ""}${normalisePath(filename)}\n${text}`;
  let signals = 0;

  const typeDef = findDocumentTypeByKeyword(haystack);
  if (typeDef) signals++;

  // A ruling or guide is general — no owner, no amount, not a claim.
  if (typeDef && isTaxReference(typeDef.name)) {
    const referenceCode = detectReferenceCode(`${normalisePath(filename)}\n${text}`);
    return {
      documentType: typeDef.name,
      entityId: null,
      entityName: null,
      financialYearLabel: financialYearLabelFromText(`${folderPath ?? ""} ${filename}`),
      amount: null,
      documentDate: null,
      renewalDate: null,
      taxRelevance: "UNKNOWN",
      // A printed guide section has no code of its own, and that's fine.
      confidenceScore: referenceCode ? 0.86 : 0.78,
      needsReview: false,
      referenceCode,
    };
  }

  let matchedEntity: EntityCandidate | null = null;
  for (const entity of entities) {
    if (entity.name.length >= 3 && haystack.toLowerCase().includes(entity.name.toLowerCase())) {
      matchedEntity = entity;
      break;
    }
  }
  if (matchedEntity) signals++;

  const amounts = extractAmounts(text);
  const amount = amounts.length > 0 ? Math.max(...amounts) : null;
  if (amount !== null) signals++;

  const dates = extractAllDates(text);
  const documentDate = dates.length > 0 ? dates.sort((a, b) => a.getTime() - b.getTime())[0] : null;
  if (documentDate) signals++;

  const renewalDate = findRenewalDate(text);

  // An explicitly-labelled folder or filename beats a date guessed out of the
  // page: "Tax Returns/2023-24" is the user's own filing decision, whereas the
  // earliest date in a tax return is often a prior-year comparative figure.
  const labelFromPath = financialYearLabelFromText(`${folderPath ?? ""} ${filename}`);
  const financialYearLabel = labelFromPath ?? (documentDate ? financialYearLabelForDate(documentDate) : null);
  if (labelFromPath) signals++;

  const taxRelevance: "UNKNOWN" | "POSSIBLE" =
    typeDef && ["Tax", "Property", "Investment"].includes(typeDef.category) ? "POSSIBLE" : "UNKNOWN";

  const confidenceScore = Math.min(0.35 + signals * 0.15, 0.96);
  const needsReview = confidenceScore < 0.7 || !typeDef;

  return {
    documentType: typeDef?.name ?? null,
    entityId: matchedEntity?.id ?? null,
    entityName: matchedEntity?.name ?? null,
    financialYearLabel,
    amount,
    documentDate,
    renewalDate,
    taxRelevance,
    confidenceScore,
    needsReview,
  };
}
