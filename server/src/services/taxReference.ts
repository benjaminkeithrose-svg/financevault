/**
 * Tax reference documents: ATO rulings and guides, Revenue NSW pages, APRA
 * and ASIC guides — the rules, not anyone's own paperwork. They're kept out
 * of every document pack and aren't tied to a person or entity. Each one
 * records its code (e.g. "TR 2000/2") and a date to check it's still current:
 * 31 July, after the new financial year's guides are out.
 */
export const TAX_REFERENCE_TYPE = "Tax Reference";

export function isTaxReference(documentType: string | null | undefined): boolean {
  return documentType === TAX_REFERENCE_TYPE;
}

// TR 2000/2, TR 95/25, TD 2012/1, PCG 2016/5, LCR 2021/2, GSTR 2002/5,
// SMSFR 2012/1, TA 2020/1, PS LA 2011/1 — and APRA / ASIC guide numbers.
const CODE_PATTERN = /\b(TR|TD|PCG|LCR|GSTR|GSTD|SMSFR|SMSFD|TA|PS LA|MT|CR|PR)\s?(\d{2}|\d{4})\/(\d{1,3})\b|\b(APG|APS|RG)\s?(\d{2,3})\b/g;

/** How far into the text the title runs — codes quoted further in are citations. */
const HEADING_LENGTH = 1500;

/**
 * The code the document is about, from its heading: the one mentioned most
 * there, ties to the first. A printed guide section that only quotes rulings
 * further down has no code of its own.
 */
export function detectReferenceCode(text: string): string | null {
  const counts = new Map<string, number>();
  for (const m of text.slice(0, HEADING_LENGTH).matchAll(CODE_PATTERN)) {
    const code = m[1] ? `${m[1]} ${m[2]}/${m[3]}` : `${m[4]} ${m[5]}`;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [code, n] of counts) if (best === null || n > counts.get(best)!) best = code;
  return best;
}

/** The next 31 July after `from` — when the new year's guides and rates are out. */
export function nextReferenceCheck(from = new Date()): Date {
  const y = from.getUTCFullYear();
  const thisYear = new Date(Date.UTC(y, 6, 31));
  return from < thisYear ? thisYear : new Date(Date.UTC(y + 1, 6, 31));
}
