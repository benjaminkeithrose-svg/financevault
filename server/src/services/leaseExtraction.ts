import { extractAllDates, extractAmounts } from "./classification.js";

// Heuristic only, same spirit as the general document classifier: propose
// values from a keyword window in the OCR text for the user to review and
// apply — never silently written to the Tenancy record.
export interface LeaseExtractionResult {
  rentPerAnnum: number | null;
  leaseCommencement: Date | null;
  leaseExpiry: Date | null;
  reviewMechanism: string | null; // FIXED_PERCENT | CPI | MARKET | HYBRID | FIXED
  confidence: "LOW" | "MEDIUM";
}

function findDateNear(text: string, keywords: string[]): Date | null {
  const lower = text.toLowerCase();
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;
    const dates = extractAllDates(text.slice(idx, idx + 150));
    if (dates.length > 0) return dates[0];
  }
  return null;
}

function findAmountNear(text: string, keywords: string[]): number | null {
  const lower = text.toLowerCase();
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;
    const amounts = extractAmounts(text.slice(idx, idx + 150));
    if (amounts.length > 0) return Math.max(...amounts);
  }
  return null;
}

const REVIEW_MECHANISM_PATTERNS: Array<{ pattern: RegExp; mechanism: string }> = [
  { pattern: /\bcpi\b/i, mechanism: "CPI" },
  { pattern: /market review|market rent/i, mechanism: "MARKET" },
  { pattern: /fixed (percentage|%|increase)/i, mechanism: "FIXED_PERCENT" },
  { pattern: /\bhybrid\b/i, mechanism: "HYBRID" },
];

export function extractLeaseTerms(text: string): LeaseExtractionResult {
  const leaseCommencement = findDateNear(text, ["commencement date", "lease commencement", "term commencing", "commencing"]);
  const leaseExpiry = findDateNear(text, ["expiry date", "lease expiry", "term expiring", "expiring"]);
  const rentPerAnnum = findAmountNear(text, ["rent per annum", "annual rent", "base rent", "rent:"]);

  let reviewMechanism: string | null = null;
  for (const { pattern, mechanism } of REVIEW_MECHANISM_PATTERNS) {
    if (pattern.test(text)) {
      reviewMechanism = mechanism;
      break;
    }
  }

  const foundCount = [leaseCommencement, leaseExpiry, rentPerAnnum, reviewMechanism].filter((v) => v !== null).length;

  return {
    rentPerAnnum,
    leaseCommencement,
    leaseExpiry,
    reviewMechanism,
    confidence: foundCount >= 3 ? "MEDIUM" : "LOW",
  };
}
