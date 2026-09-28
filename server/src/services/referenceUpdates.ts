import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { sha256 } from "./hash.js";
import { ingestDocument } from "./documentIngest.js";
import { REFERENCE_ROOT } from "./referenceLibrary.js";
import { detectReferenceCode, nextReferenceCheck, TAX_REFERENCE_TYPE } from "./taxReference.js";

/**
 * "Check for new versions" (IDEAS.md idea 18). For each official source in
 * the link pack:
 *
 * - rates pages and guides: fetch the current copy; if it changed, save it
 *   as a new, dated Tax reference and mark the older copy superseded;
 * - yearly guides: try next year's address; if it's out, save it and mark
 *   last year's superseded;
 * - rulings: if the page now says withdrawn or replaced, flag every saved
 *   copy — and so every claim that cites it;
 * - broken links: listed, with a search to find the new address.
 *
 * It only runs when the button is pressed. It asks for public pages and
 * sends nothing about you.
 */

export interface LinkEntry {
  id: string;
  title: string;
  publisher: string;
  kind: string;
  url: string;
  changes?: string;
  download?: string;
  urlPattern?: string;
  latestYear?: number;
  note?: string;
}

export type CheckStatus = "CURRENT" | "UPDATED" | "NEW_YEAR" | "WITHDRAWN" | "BROKEN" | "FAILED" | "NOT_YET";

export interface FetchResult {
  status: number;
  contentType: string;
  body: Buffer;
}
export type Fetcher = (url: string) => Promise<FetchResult>;

export const httpFetch: Fetcher = async (url) => {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    // Asked for the way the Edge window does: some government sites turn away
    // requests that don't look like a browser.
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  });
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.from(await res.arrayBuffer()) };
};

export async function readLinkPack(root = REFERENCE_ROOT): Promise<LinkEntry[]> {
  const pack = JSON.parse(await fs.readFile(path.join(root, "link-pack.json"), "utf8")) as { links: LinkEntry[] };
  return pack.links;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", times: "×" };

/** A web page's readable text: no scripts, styles or navigation markup. */
export function htmlToText(html: string): string {
  // The page's own content — not the site's menus, banners and footer, which
  // change often and would make every check look like an update.
  const main = html.match(/<main\b[\s\S]*<\/main>/i)?.[0] ?? html.match(/<article\b[\s\S]*<\/article>/i)?.[0] ?? html;
  return main
    .replace(/<(script|style|noscript|svg|head|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      /^#x/i.test(e) ? String.fromCharCode(parseInt(e.slice(2), 16)) : e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)
    )
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** "This ruling has been withdrawn" and the like, near the top of a ruling. */
export function looksWithdrawn(text: string): string | null {
  const top = text.slice(0, 4000);
  const m =
    top.match(/[^.\n]*\b(has been|is|was)\s+withdrawn\b[^.\n]*\.?/i) ??
    top.match(/[^.\n]*\b(replaced|superseded)\s+by\b[^.\n]*\.?/i) ??
    top.match(/\bwithdrawal notice\b[^.\n]*/i);
  return m ? m[0].trim().slice(0, 300) : null;
}

/** A search for the page's new address, for a broken link. */
export function searchUrl(link: LinkEntry): string {
  const site = new URL(link.url).hostname.replace(/^www\./, "");
  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${site} "${link.title.split(" — ")[0]}"`)}`;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The publisher's own "Last updated 11 May 2026" (or "Last modified"), if the page says. */
export function publisherUpdated(text: string | null | undefined): Date | null {
  if (!text) return null;
  const m = text.match(/\blast\s+(?:updated|modified|reviewed)\s*:?\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)));
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Where a source sits in the library's folders. */
export function referenceFolderFor(link: Pick<LinkEntry, "publisher" | "kind">, group?: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (link.publisher !== "ATO") return clean(link.publisher) || "Other";
  switch (link.kind) {
    case "ruling":
      return "ATO/Rulings";
    case "yearly-guide":
    case "print-section":
      return "ATO/Guides";
    case "rates-page":
      return "ATO/Rates and thresholds";
    case "occupation-guide":
      return `ATO/Occupation guides/${clean(group ?? "") || "Other"}`;
    default:
      return "ATO/Topics";
  }
}

/** The "Print whole section" link on an ATO page (the whole section as one PDF), if it has one. */
export function findPrintLink(html: string, base: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/print\s+(the\s+)?whole\s+section/i.test(m[2].replace(/<[^>]+>/g, " "))) return new URL(m[1].replace(/&amp;/g, "&"), base).toString();
  }
  // Built by the page's script rather than a plain link: the section's print
  // address close to the words "Print whole section".
  const at = html.search(/print\s+(the\s+)?whole\s+section/i);
  if (at >= 0) {
    const near = html.slice(Math.max(0, at - 600), at + 600).match(/\/api\/public\/content\/0-[0-9a-f-]{36}[^"'\s<>\\]*/i);
    if (near) return new URL(near[0].replace(/&amp;/g, "&"), base).toString();
  }
  return null;
}

export const isPdf = (r: FetchResult) => r.contentType.includes("pdf") || r.body.subarray(0, 5).toString("latin1") === "%PDF-";

/** What a copy is stored as: the PDF itself, or the page's text. */
function copyOf(r: FetchResult): { buffer: Buffer; ext: string; mime: string; text: string | null } {
  if (isPdf(r)) return { buffer: r.body, ext: ".pdf", mime: "application/pdf", text: null };
  const text = htmlToText(r.body.toString("utf8"));
  return { buffer: Buffer.from(text, "utf8"), ext: ".txt", mime: "text/plain", text };
}

export interface CopyOptions {
  /** The whole section as a PDF, stored in place of the page's text. */
  pdf?: Buffer | null;
  /** Text to store in place of the fetched page (an occupation guide's pages, joined). */
  text?: string | null;
  folder?: string;
}

export async function saveCopy(link: LinkEntry, r: FetchResult | null, url: string, today: Date, title = link.title, opts: CopyOptions = {}) {
  const copy = opts.pdf
    ? { buffer: opts.pdf, ext: ".pdf", mime: "application/pdf", text: null as string | null }
    : opts.text != null
      ? { buffer: Buffer.from(opts.text, "utf8"), ext: ".txt", mime: "text/plain", text: opts.text }
      : copyOf(r!);
  const pageText = opts.text ?? (r && !isPdf(r) ? htmlToText(r.body.toString("utf8")) : null);
  const date = today.toISOString().slice(0, 10);
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 90).trim();
  const result = await ingestDocument({
    buffer: copy.buffer,
    originalFilename: `${safe} — saved ${date}${copy.ext}`,
    mimeType: copy.mime,
    fileSize: copy.buffer.length,
    source: "REFERENCE_CHECK",
    suggestedDocumentType: TAX_REFERENCE_TYPE,
    referenceCode: detectReferenceCode(link.title),
  });
  const doc = result.document!;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      documentType: TAX_REFERENCE_TYPE,
      entityId: null,
      taxRelevance: "NOT_RELEVANT",
      referenceCode: doc.referenceCode ?? detectReferenceCode(link.title),
      referenceCheckBy: nextReferenceCheck(today),
      reviewStatus: "CONFIRMED",
      referenceLinkId: link.id,
      sourceUrl: url,
      retrievedAt: today,
      supersededAt: null,
      sourceUpdatedAt: publisherUpdated(pageText) ?? publisherUpdated(doc.ocrText),
      referenceFolder: opts.folder ?? referenceFolderFor(link),
      notes: doc.notes ?? `${link.title} (${link.publisher}), saved from ${url} on ${date}.`,
    },
  });
  // Older copies of the same source are kept, marked as replaced by this one.
  await prisma.document.updateMany({
    where: { referenceLinkId: link.id, id: { not: doc.id }, supersededAt: null },
    data: { supersededAt: today },
  });
  return { documentId: doc.id, duplicate: result.duplicate, hash: sha256(copy.text != null ? Buffer.from(copy.text, "utf8") : copy.buffer), text: copy.text };
}

/** Library copies loaded from the reference folder get their place in the folders. */
export async function fileLibraryFolders(links: LinkEntry[]): Promise<void> {
  for (const l of links) {
    await prisma.document.updateMany({ where: { referenceLinkId: l.id, referenceFolder: null }, data: { referenceFolder: referenceFolderFor(l) } });
    // Copies loaded from the program's own reference folder carry the file's
    // short name ("tr-2000-2.pdf"): give them the source's title and address.
    const title = l.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 90).trim();
    const named = await prisma.document.findMany({
      where: { referenceLinkId: l.id, NOT: { originalFilename: { startsWith: title } } },
      select: { id: true, originalFilename: true, sourceUrl: true },
    });
    for (const d of named) {
      const ext = d.originalFilename.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
      await prisma.document.update({ where: { id: d.id }, data: { originalFilename: `${title}${ext}`, sourceUrl: d.sourceUrl ?? l.download ?? l.url } });
    }
  }
  // And the publisher's "Last updated" date, where the saved text shows it.
  const undated = await prisma.document.findMany({
    where: { documentType: TAX_REFERENCE_TYPE, sourceUpdatedAt: null, ocrText: { not: null } },
    select: { id: true, ocrText: true },
  });
  for (const d of undated) {
    const when = publisherUpdated(d.ocrText);
    if (when) await prisma.document.update({ where: { id: d.id }, data: { sourceUpdatedAt: when } });
  }
}

/**
 * Library copies loaded before copies were tied to their source: tie each
 * to its link-pack entry (by the file it was loaded from).
 */
export async function linkLibraryCopies(root = REFERENCE_ROOT): Promise<number> {
  let files: Array<{ file: string; covers: string[] }>;
  try {
    files = JSON.parse(await fs.readFile(path.join(root, "sources", "index.json"), "utf8")).files;
  } catch {
    return 0;
  }
  let linked = 0;
  for (const f of files) {
    if (!f.covers[0]) continue;
    let hash: string;
    try {
      hash = sha256(await fs.readFile(path.join(root, "sources", f.file)));
    } catch {
      continue;
    }
    const r = await prisma.document.updateMany({ where: { fileHash: hash, referenceLinkId: null }, data: { referenceLinkId: f.covers[0] } });
    linked += r.count;
  }
  return linked;
}

export interface CheckResult {
  linkId: string;
  status: CheckStatus;
  message: string;
  url: string;
  documentId: string | null;
  latestYear: number | null;
}

async function record(r: CheckResult & { contentHash?: string | null }, today: Date): Promise<CheckResult> {
  const data = {
    checkedAt: today,
    status: r.status,
    message: r.message,
    url: r.url,
    latestYear: r.latestYear,
    ...(r.documentId ? { documentId: r.documentId } : {}),
    ...(r.contentHash ? { contentHash: r.contentHash } : {}),
  };
  await prisma.referenceCheck.upsert({ where: { linkId: r.linkId }, update: data, create: { linkId: r.linkId, ...data } });
  return r;
}

/** Checks one source. Never throws: a failure is its result. */
export async function checkLink(link: LinkEntry, fetcher: Fetcher, today = new Date()): Promise<CheckResult> {
  const previous = await prisma.referenceCheck.findUnique({ where: { linkId: link.id } });
  const base = { linkId: link.id, documentId: previous?.documentId ?? null, latestYear: previous?.latestYear ?? link.latestYear ?? null };
  try {
    // Yearly guides: is next year's out?
    if (link.urlPattern && base.latestYear) {
      const next = base.latestYear + 1;
      const nextUrl = link.urlPattern.replace("{YEAR}", String(next));
      const r = await fetcher(nextUrl);
      if (r.status === 200) {
        const saved = await saveCopy(link, r, nextUrl, today, `${link.title} ${next}`);
        return record(
          { ...base, status: "NEW_YEAR", url: nextUrl, documentId: saved.documentId, latestYear: next, contentHash: saved.hash, message: `The ${next} guide is out — saved, and the ${next - 1} one marked as replaced.` },
          today
        );
      }
    }

    const url = link.download ?? link.url;
    const r = await fetcher(url);
    if (r.status === 404 || r.status === 410) {
      return record({ ...base, status: "BROKEN", url, message: "This page has moved or gone. Search for its new address." }, today);
    }
    if (r.status !== 200) {
      const why = r.status === 403 || r.status === 429 ? "The site turned the check away" : `The site answered ${r.status}`;
      return record({ ...base, status: "FAILED", url, message: `${why} — try again later.` }, today);
    }

    const copy = copyOf(r);
    const withdrawn = link.kind === "ruling" && copy.text ? looksWithdrawn(copy.text) : null;
    if (withdrawn) {
      const saved = await saveCopy(link, r, url, today);
      const code = detectReferenceCode(link.title);
      await prisma.document.updateMany({
        where: { OR: [{ referenceLinkId: link.id }, ...(code ? [{ referenceCode: code }] : [])] },
        data: { withdrawnNote: withdrawn },
      });
      return record({ ...base, status: "WITHDRAWN", url, documentId: saved.documentId, contentHash: saved.hash, message: withdrawn }, today);
    }

    // Changes are judged on the page's words (a print PDF is made fresh each
    // time, so its bytes always differ); the copy kept is the whole section
    // as a PDF when the page offers one.
    const hash = sha256(copy.buffer);
    if (previous?.contentHash === hash) {
      return record({ ...base, status: "CURRENT", url, message: "No change since the last check." }, today);
    }
    let pdf: Buffer | null = null;
    if (!isPdf(r)) {
      const print = findPrintLink(r.body.toString("utf8"), url);
      if (print) {
        const p = await fetcher(print).catch(() => null);
        if (p?.status === 200 && isPdf(p)) pdf = p.body;
      }
    }
    const saved = await saveCopy(link, r, url, today, link.title, { pdf });
    if (saved.duplicate) {
      return record({ ...base, status: "CURRENT", url, documentId: saved.documentId, contentHash: hash, message: "Same as the saved copy." }, today);
    }
    return record(
      {
        ...base,
        status: "UPDATED",
        url,
        documentId: saved.documentId,
        contentHash: hash,
        message: previous ? "Changed since the last check — the new copy is saved and dated." : "Current copy saved and dated.",
      },
      today
    );
  } catch (e) {
    const reason = (e as Error).name === "TimeoutError" ? "it took too long to answer" : "it couldn't be reached";
    return record({ ...base, status: "FAILED", url: link.url, message: `Not checked — ${reason}. Check your internet connection and try again.` }, today);
  }
}

/** Checks every source that has a document behind it (not the index pages), a few at a time. */
export async function checkForNewVersions(fetcher: Fetcher = httpFetch, today = new Date(), root = REFERENCE_ROOT, onProgress?: (title: string) => void) {
  await linkLibraryCopies(root);
  const all = await readLinkPack(root);
  await fileLibraryFolders(all);
  const links = all.filter((l) => l.kind !== "index");
  const results: CheckResult[] = [];
  const queue = [...links];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let link = queue.shift(); link; link = queue.shift()) {
        onProgress?.(link.title);
        results.push(await checkLink(link, fetcher, today));
      }
    })
  );
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return {
    checked: results.length,
    updated: count("UPDATED"),
    newYear: count("NEW_YEAR"),
    withdrawn: count("WITHDRAWN"),
    broken: count("BROKEN"),
    failed: count("FAILED"),
    current: count("CURRENT"),
  };
}

/** Each source with its last check, newest copy, and — when withdrawn — the claims that cite it. */
export async function referenceChecks(root = REFERENCE_ROOT) {
  let links: LinkEntry[] = [];
  try {
    links = (await readLinkPack(root)).filter((l) => l.kind !== "index");
  } catch {
    return { lastCheckedAt: null, items: [] };
  }
  const checks = new Map((await prisma.referenceCheck.findMany()).map((c) => [c.linkId, c]));
  const withdrawnDocs = await prisma.document.findMany({ where: { withdrawnNote: { not: null } }, select: { id: true, referenceLinkId: true } });
  const citing = await prisma.claimNote.findMany({
    where: { referenceDocumentId: { in: withdrawnDocs.map((d) => d.id) } },
    select: { referenceDocumentId: true },
  });
  const lastCheckedAt = [...checks.values()].reduce<Date | null>((a, c) => (!a || c.checkedAt > a ? c.checkedAt : a), null);
  return {
    lastCheckedAt,
    items: links.map((l) => {
      const c = checks.get(l.id);
      const docIds = new Set(withdrawnDocs.filter((d) => d.referenceLinkId === l.id).map((d) => d.id));
      return {
        linkId: l.id,
        title: l.title,
        publisher: l.publisher,
        kind: l.kind,
        url: c?.url ?? l.url,
        status: (c?.status ?? null) as CheckStatus | null,
        message: c?.message ?? null,
        checkedAt: c?.checkedAt ?? null,
        documentId: c?.documentId ?? null,
        searchUrl: c?.status === "BROKEN" ? searchUrl(l) : null,
        claimsCiting: citing.filter((n) => n.referenceDocumentId && docIds.has(n.referenceDocumentId)).length,
      };
    }),
  };
}
