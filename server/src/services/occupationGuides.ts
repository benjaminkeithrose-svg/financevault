import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db.js";
import { REFERENCE_ROOT } from "./referenceLibrary.js";
import { TAX_REFERENCE_TYPE } from "./taxReference.js";

/**
 * The ATO's occupation guides, as deduction checklists (IDEAS.md idea 10).
 *
 * Each guide's "Deductions for work expenses" pages list expenses from A to
 * W: a heading ("Laundry and maintenance"), then what you can and can't
 * claim, with worked examples. The guides are read from the text the
 * reference downloader saves — a guide's pages joined, each starting with
 * its title and address — and turned into items: the expense, whether it's
 * generally claimable, and the ATO's words (examples left out).
 *
 * A copy read from the downloads of September 2026 ships with the app
 * (reference/occupation-guides.json); a newer copy in the person's own
 * reference library is used in its place.
 */

export interface GuideItem {
  key: string;
  name: string;
  /** CAN: generally claimable; CANT: generally not; DEPENDS: it depends. */
  verdict: "CAN" | "CANT" | "DEPENDS";
  can: string[];
  cant: string[];
  /** The ATO's words, examples left out. */
  text: string;
  /** Which of the app's kinds of claim it's recorded as. */
  category: string;
}

export interface Guide {
  key: string;
  title: string;
  url: string | null;
  updated: string | null;
  items: GuideItem[];
}

export const PAGE_BREAK = "\n----------\n";

const clean = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&times;/g, "×")
    .replace(/&amp;/g, "&")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export const guideKey = (url: string) =>
  new URL(url).pathname
    .replace(/\/+$/, "")
    .split("/")
    .pop()!
    .toLowerCase();

const itemKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** "Nurses and midwives – income and work-related deductions" → "Nurses and midwives". */
export function shortTitle(title: string): string {
  return clean(title)
    .replace(/\s*[–-]\s*income and work-?\s*related deductions$/i, "")
    .trim();
}

interface Page {
  title: string;
  url: string | null;
  lines: string[];
}

/** A guide's saved text, split back into its pages. */
function pages(text: string): Page[] {
  const out: Page[] = [];
  for (const block of text.split(PAGE_BREAK)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Each page starts with its title and address (the file's own header, when present, comes first).
    const at = lines.findIndex((l, i) => i > 0 && /^https?:\/\//.test(l) && !/^Source:/.test(lines[i - 1]));
    if (at < 1) continue;
    out.push({ title: clean(lines[at - 1]), url: lines[at], lines: lines.slice(at + 1).map(clean) });
  }
  return out;
}

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/working from home|home office/i, "WORK_FROM_HOME"],
  [/travel|taxi|ride-share|public transport|parking|tolls|accommodation|fares/i, "TRAVEL"],
  [/\bcar\b|vehicle|motor ?cycle/i, "CAR"],
  [/cloth|uniform|laundry|footwear|protective|dry-clean|sun(glasses|hats|screen)/i, "CLOTHING"],
  [/self-education|seminar|conference|training|course|first aid|study/i, "SELF_EDUCATION"],
  [/phone|internet|\bdata\b/i, "PHONE_INTERNET"],
  [/union|association|membership|practi[cs]ing certificate|registration|accreditation|subscription/i, "MEMBERSHIPS"],
  [/tool|equipment|computer|laptop|software|instrument|device|kit|bag|briefcase/i, "TOOLS"],
];

export function categoryFor(name: string): string {
  return CATEGORY_WORDS.find(([re]) => re.test(name))?.[1] ?? "OTHER";
}

const isCan = (l: string) => /^You (can|may be able to|are able to)( also)? claim\b/i.test(l);
const isCant = (l: string) => /^You (can't|cannot|can not|are not able to|aren't able to)( generally)? claim\b/i.test(l) || /^You can't\b/.test(l);
const isReference = (l: string) => /^(PS LA|TR|TD|PCG|LCR|IT|MT|TA)\s*\d/.test(l);
const isNavigation = (l: string) =>
  /\bexpenses\s+[A-Z]\s*[–-]\s*[A-Z]$/.test(l) || /^For more .* expenses,? see:?$/i.test(l) || /^Find out (more )?about\b/i.test(l) || /^QC \d+/.test(l);

/** Could this line be an expense's heading? */
function headingLike(l: string): boolean {
  return (
    /^[A-Z]/.test(l) &&
    l.length <= 100 &&
    !/[.:;,]$/.test(l) &&
    !/^(You|If|For example|This|These|To |Find|See |Example|End of example|Last updated|Print or Download|Note)\b/.test(l) &&
    !isReference(l)
  );
}

/** One "expenses A–F" page's items. */
function pageItems(page: Page): Array<{ name: string; lines: string[] }> {
  const range = page.title.match(/([A-Z])\s*[–-]\s*([A-Z])$/);
  const inRange = (name: string) => !range || (name[0].toUpperCase() >= range[1] && name[0].toUpperCase() <= range[2]);
  const start = page.lines.indexOf("Print or Download");
  const body = page.lines.slice(start + 1);
  const end = body.findIndex(isNavigation);
  const lines = end === -1 ? body : body.slice(0, end);

  const items: Array<{ name: string; lines: string[] }> = [];
  let example = false;
  let previous = "";
  lines.forEach((l, i) => {
    if (/^Example\b/.test(l)) example = true;
    if (example) {
      if (/^End of example/.test(l)) example = false;
      return;
    }
    const next = lines[i + 1] ?? "";
    const before = lines[i - 1] ?? "";
    // A heading is followed by words about it — not by another heading, and
    // not the end of a list of links or loan schemes.
    const heading =
      headingLike(l) &&
      (!headingLike(next) || /^Example\b/.test(next)) &&
      !(i > 0 && headingLike(before)) &&
      inRange(l) &&
      l.localeCompare(previous, "en", { sensitivity: "base" }) >= 0;
    if (heading) {
      items.push({ name: l, lines: [] });
      previous = l;
    } else if (items.length) {
      items[items.length - 1].lines.push(l);
    }
  });
  return items.filter((it) => it.lines.length > 0);
}

/** A guide's checklist, from its saved text. */
export function parseGuide(text: string, fallbackTitle?: string): Guide | null {
  const all = pages(text);
  if (all.length === 0) return null;
  const top = all[0];
  const updated = text.match(/Last updated (\d{1,2} [A-Z][a-z]+ \d{4})/)?.[1] ?? null;
  const isExpensePage = (p: Page) => /\bexpenses\s+[A-Z]\s*[–-]\s*[A-Z]$/.test(p.title);
  const deductionsPage = all.find((p) => /^Deductions for work expenses$/i.test(p.title));
  // Expense pages when the guide has them; otherwise the deductions page itself.
  const sources = all.some(isExpensePage) ? all.filter(isExpensePage) : deductionsPage ? [deductionsPage] : [];

  const items: GuideItem[] = [];
  const keys = new Set<string>();
  for (const p of sources) {
    for (const it of pageItems(p)) {
      const can = it.lines.filter(isCan);
      const cant = it.lines.filter(isCant);
      let key = itemKey(it.name) || "item";
      for (let n = 2; keys.has(key); n++) key = `${itemKey(it.name)}-${n}`;
      keys.add(key);
      items.push({
        key,
        name: it.name,
        // Claimable when that's the first thing said; not when nothing says it is.
        verdict: isCan(it.lines[0]) ? "CAN" : can.length === 0 && cant.length > 0 ? "CANT" : "DEPENDS",
        can,
        cant,
        text: it.lines.join("\n").slice(0, 6000),
        category: categoryFor(it.name),
      });
    }
  }
  const guidePage = /income and work-?\s*related deductions/i.test(top.title) ? top : null;
  const title = shortTitle(guidePage?.title ?? fallbackTitle ?? top.title);
  const url = guidePage?.url ?? (top.url ? top.url.replace(/\/(deductions-for-work-expenses|income-and-allowances|record-keeping-for-work-expenses|who-this-guide-applies-to)(\/.*)?$/, "") : null);
  return { key: url ? guideKey(url) : itemKey(title), title, url, updated, items };
}

// ---------------------------------------------------------------------------
// The shipped copy, and choosing a guide for a job.

export const SHIPPED_FILE = path.join(REFERENCE_ROOT, "occupation-guides.json");
let shipped: { builtFrom: string; guides: Guide[] } | null = null;

export function shippedGuides(): Guide[] {
  if (!shipped) {
    try {
      shipped = JSON.parse(fs.readFileSync(SHIPPED_FILE, "utf8"));
    } catch {
      shipped = { builtFrom: "", guides: [] };
    }
  }
  return shipped!.guides;
}

const STOP = new Set(["and", "or", "the", "of", "other", "industry", "employees", "employee", "workers", "worker", "professionals", "professional", "members", "income", "work", "related", "deductions"]);
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);

/** The guide that best fits a job title ("Registered nurse" → Nurses and midwives), or null. */
export function suggestGuide(occupation: string | null | undefined, guides: Array<{ key: string; title: string }>): string | null {
  if (!occupation?.trim()) return null;
  const want = new Set(words(occupation));
  let best: { key: string; score: number } | null = null;
  for (const g of guides) {
    const have = words(g.title);
    const score = have.filter((w) => want.has(w) || [...want].some((x) => x.length > 4 && (w.startsWith(x) || x.startsWith(w)))).length;
    if (score > 0 && (!best || score > best.score)) best = { key: g.key, score };
  }
  return best?.key ?? null;
}

// ---------------------------------------------------------------------------
// The guide in use: the shipped copy, or a newer one from the reference library.

const ts = (s: string | null) => (s ? Date.parse(`${s} UTC`) : NaN);

/** The library's current copy of a guide (saved whole by the downloader from 1.5.0). */
async function libraryCopy(key: string) {
  return prisma.document.findFirst({
    where: { documentType: TAX_REFERENCE_TYPE, supersededAt: null, referenceLinkId: { startsWith: "occupation:" }, sourceUrl: { endsWith: `/${key}` }, ocrText: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, ocrText: true, sourceUpdatedAt: true, originalFilename: true },
  });
}

export interface GuideInUse extends Guide {
  /** SHIPPED: the copy that came with the app; LIBRARY: the person's own, newer download. */
  source: "SHIPPED" | "LIBRARY";
  documentId: string | null;
}

export async function guideFor(key: string): Promise<GuideInUse | null> {
  const shippedCopy = shippedGuides().find((g) => g.key === key) ?? null;
  const doc = await libraryCopy(key);
  const parsed = doc?.ocrText ? parseGuide(doc.ocrText) : null;
  const newer =
    parsed &&
    parsed.items.length > 0 &&
    (!shippedCopy || shippedCopy.items.length === 0 || !(ts(parsed.updated) < ts(shippedCopy.updated)));
  if (newer) return { ...parsed!, key, source: "LIBRARY", documentId: doc!.id };
  if (shippedCopy) return { ...shippedCopy, source: "SHIPPED", documentId: doc?.id ?? null };
  return null;
}

/** Every guide there is: those that came with the app, and any new ones downloaded since. */
export async function guideList(): Promise<Array<{ key: string; title: string; updated: string | null; items: number }>> {
  const list = shippedGuides().map((g) => ({ key: g.key, title: g.title, updated: g.updated, items: g.items.length }));
  const known = new Set(list.map((g) => g.key));
  const docs = await prisma.document.findMany({
    where: { documentType: TAX_REFERENCE_TYPE, supersededAt: null, referenceLinkId: { startsWith: "occupation:" }, sourceUrl: { not: null } },
    select: { originalFilename: true, sourceUrl: true },
  });
  for (const d of docs) {
    // Guides saved whole end in "…-income-and-work-related-deductions"; older downloads saved each section apart.
    if (!/income-and-work-?related-deductions$/.test(guideKey(d.sourceUrl!))) continue;
    const key = guideKey(d.sourceUrl!);
    if (known.has(key)) continue;
    known.add(key);
    const title = d.originalFilename.replace(/ — saved \d{4}-\d{2}-\d{2}/, "").replace(/\.[a-z0-9]+$/i, "").replace(/^Occupation guide — /, "");
    list.push({ key, title: shortTitle(title), updated: null, items: 0 });
  }
  return list.sort((a, b) => a.title.localeCompare(b.title));
}
