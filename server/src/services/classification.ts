import { findDocumentTypeByKeyword } from "./documentTypes.js";
import { financialYearLabelForDate } from "./financialYear.js";

export interface EntityCandidate {
  id: string;
  name: string;
}

export interface ClassificationInput {
  filename: string;
  text: string;
  entities: EntityCandidate[];
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

export function classifyDocument(input: ClassificationInput): ClassificationResult {
  const { filename, text, entities } = input;
  const haystack = `${filename}\n${text}`;
  let signals = 0;

  const typeDef = findDocumentTypeByKeyword(haystack);
  if (typeDef) signals++;

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

  const financialYearLabel = documentDate ? financialYearLabelForDate(documentDate) : null;

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
