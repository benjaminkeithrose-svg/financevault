import { ZipArchive } from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { featureOn } from "../routes/settings.js";
import { dataFolder } from "./appInfo.js";
import { readDocumentFile } from "./documentFiles.js";
import { financialYearBounds, financialYearLabelForDate } from "./financialYear.js";
import { sha256 } from "./hash.js";
import { SERVER_ROOT } from "./paths.js";
import { REFERENCE_ROOT } from "./referenceLibrary.js";
import {
  checkForNewVersions,
  Fetcher,
  FetchResult,
  findPrintLink,
  htmlToText,
  httpFetch,
  isPdf,
  LinkEntry,
  publisherUpdated,
  readLinkPack,
  referenceFolderFor,
  saveCopy,
} from "./referenceUpdates.js";
import { TAX_REFERENCE_TYPE } from "./taxReference.js";

export { findPrintLink };

/**
 * The official reference library, downloaded (IDEAS.md idea 18, extended):
 *
 * 1. every source in the link pack is checked, and a changed one saved as a
 *    new, dated Tax reference (the whole section as a PDF where the page
 *    offers one) — the older copy kept and marked replaced;
 * 2. every ATO occupation guide is found from the guides' index and saved
 *    the same way, one document per guide;
 * 3. the current copy of every Tax reference is written into folders —
 *    ATO / Rulings, ATO / Occupation guides / A–D, Revenue NSW… — under the
 *    data folder, with an index of when each was last updated;
 * 4. with "Save the ZIP for Claude" switched on, the folders are zipped.
 *
 * Runs on the person's own computer, which the ATO lets in (it turns away
 * cloud computers). Only public pages are asked for; nothing about the
 * person is sent.
 */

export const DOWNLOADS_FOLDER = "Reference downloads";
export const ZIP_FEATURE = "reference-zip";
const OCCUPATION_INDEX_ID = "occupation-guides";
const MAX_OCCUPATION_PAGES = 400;
const MAX_DEPTH = 3;
const DAY = 86_400_000;

export function downloadsRoot(): string {
  const data = dataFolder();
  return data ? path.join(data, DOWNLOADS_FOLDER) : path.join(SERVER_ROOT, "storage", DOWNLOADS_FOLDER);
}

/** Pages under the same section (e.g. every occupation guide under the guides' index). */
export function findSectionLinks(html: string, base: string, prefix: string): string[] {
  const found = new Set<string>();
  const origin = new URL(base).origin;
  for (const m of html.matchAll(/["'(]((?:https?:\/\/[^"'\s<>]+)?\/[^"'\s<>]*)["')]/g)) {
    let url: URL;
    try {
      url = new URL(m[1].replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) continue;
    if (/\.(css|js|png|jpe?g|svg|gif|ico|woff2?)$/i.test(url.pathname)) continue;
    found.add(`${url.origin}${url.pathname.replace(/\/+$/, "")}`);
  }
  return [...found];
}

/** A page's own heading. */
function heading(html: string): string | null {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const t = m ? htmlToText(m[1]).replace(/\s+/g, " ").trim() : "";
  return t || null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110) || "Document";

export interface DownloadResult {
  folder: string;
  zip: string | null;
  savedAt: string;
  documents: number;
  changed: number;
  sources: number;
  occupationGuides: number;
  failed: Array<{ title: string; url: string; reason: string }>;
}

function reasonFor(r: FetchResult | null, e?: unknown): string {
  if (e) return (e as Error).name === "TimeoutError" ? "took too long to answer" : "couldn't be reached";
  if (!r) return "couldn't be reached";
  if (r.status === 404 || r.status === 410) return "page has moved or gone";
  if (r.status === 403 || r.status === 429) return "the site turned the request away";
  return `the site answered ${r.status}`;
}

interface Page {
  url: string;
  depth: number;
  parent: string | null;
  title: string;
  html: string;
  text: string;
}

/**
 * The occupation guides: from the index, down through A–D, E–K… to each
 * guide and its pages. Each guide is kept as one document — its "Print whole
 * section" PDF when it has one, otherwise its pages' text joined.
 */
async function occupationGuides(index: LinkEntry, fetcher: Fetcher, today: Date, pause: number, progress: (t: string) => void) {
  const failed: DownloadResult["failed"] = [];
  const start = index.url.replace(/\/+$/, "");
  const prefix = new URL(start).pathname.replace(/\/[^/]+$/, "/");
  const pages = new Map<string, Page>();
  const seen = new Set<string>([start]);
  const queue: Array<{ url: string; depth: number; parent: string | null }> = [{ url: start, depth: 0, parent: null }];
  while (queue.length && pages.size < MAX_OCCUPATION_PAGES) {
    const { url, depth, parent } = queue.shift()!;
    progress(`Occupation guides — ${new URL(url).pathname.split("/").pop()}`);
    let r: FetchResult | null = null;
    try {
      r = await fetcher(url);
    } catch (e) {
      failed.push({ title: depth === 0 ? index.title : `Occupation guides page`, url, reason: reasonFor(null, e) });
      continue;
    }
    await new Promise((res) => setTimeout(res, pause));
    if (r.status !== 200) {
      failed.push({ title: depth === 0 ? index.title : `Occupation guides page`, url, reason: reasonFor(r) });
      continue;
    }
    if (isPdf(r)) continue;
    const html = r.body.toString("utf8");
    const title = heading(html) ?? new URL(url).pathname.split("/").pop()!.replace(/-/g, " ");
    pages.set(url, { url, depth, parent, title, html, text: htmlToText(html) });
    if (depth >= MAX_DEPTH) continue;
    for (const next of findSectionLinks(html, url, prefix)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ url: next, depth: depth + 1, parent: url });
    }
  }

  // Depth 1 are the groups (A–D, E–K…); depth 2 the guides, with their own
  // pages below them. A group page that leads nowhere is a guide itself.
  const all = [...pages.values()];
  const children = (url: string) => all.filter((p) => p.parent === url);
  const guides: Array<{ page: Page; group: string; parts: Page[] }> = [];
  for (const g of all.filter((p) => p.depth === 1)) {
    const under = children(g.url);
    if (under.length === 0) guides.push({ page: g, group: "Other", parts: [] });
    for (const p of under) guides.push({ page: p, group: g.title, parts: children(p.url) });
  }

  let changed = 0;
  for (const { page, group, parts } of guides) {
    progress(`Occupation guide — ${page.title}`);
    const id = `occupation:${slug(new URL(page.url).pathname.slice(prefix.length))}`;
    const text = [page, ...parts].map((p) => `${p.title}\n${p.url}\n\n${p.text}`).join("\n\n----------\n\n");
    const hash = sha256(Buffer.from(text, "utf8"));
    const previous = await prisma.referenceCheck.findUnique({ where: { linkId: id } });
    const link: LinkEntry = { id, title: `Occupation guide — ${page.title}`, publisher: "ATO", kind: "occupation-guide", url: page.url };
    const folder = referenceFolderFor(link, group);
    if (previous?.contentHash === hash && previous.documentId) {
      await prisma.referenceCheck.update({ where: { linkId: id }, data: { checkedAt: today, status: "CURRENT", message: "No change since the last download." } });
      await prisma.document.updateMany({ where: { id: previous.documentId }, data: { referenceFolder: folder } });
      continue;
    }
    let pdf: Buffer | null = null;
    const print = findPrintLink(page.html, page.url);
    if (print) {
      const p = await fetcher(print).catch(() => null);
      if (p?.status === 200 && isPdf(p)) pdf = p.body;
    }
    const saved = await saveCopy(link, null, page.url, today, link.title, {
      pdf,
      text: pdf ? null : `${link.title}\nSource: ${page.url}\nSaved: ${today.toISOString().slice(0, 10)}\n\n${text}\n`,
      folder,
    });
    // The publisher's date is read from the guide's own words, even when its PDF is kept.
    const updated = publisherUpdated(page.text);
    if (updated) await prisma.document.update({ where: { id: saved.documentId }, data: { sourceUpdatedAt: updated } });
    const data = { checkedAt: today, status: "UPDATED", message: previous ? "Changed since the last download." : "Saved.", contentHash: hash, documentId: saved.documentId, url: page.url };
    await prisma.referenceCheck.upsert({ where: { linkId: id }, update: data, create: { linkId: id, ...data } });
    changed += 1;
  }
  return { guides: guides.length, changed, failed };
}

function csv(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** A reference document's title, from its saved file name. */
export function referenceTitle(originalFilename: string): string {
  return originalFilename.replace(/ — saved \d{4}-\d{2}-\d{2}(?=\.[a-z0-9]+$)/i, "").replace(/\.[a-z0-9]+$/i, "");
}

/** Every current Tax reference, written into its folder, with an index. What was there before is cleared first. */
export async function writeLibraryFolders(outRoot: string, today = new Date()): Promise<number> {
  await fsp.mkdir(outRoot, { recursive: true });
  for (const entry of await fsp.readdir(outRoot, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith(".zip") || entry.name === "last-download.json")) continue;
    await fsp.rm(path.join(outRoot, entry.name), { recursive: true, force: true });
  }
  const docs = await prisma.document.findMany({
    where: { documentType: TAX_REFERENCE_TYPE, supersededAt: null, reviewStatus: { not: "ARCHIVED" } },
    orderBy: [{ referenceFolder: "asc" }, { originalFilename: "asc" }],
  });
  const checks = new Map((await prisma.referenceCheck.findMany()).map((c) => [c.linkId, c]));
  const fyStart = financialYearBounds(financialYearLabelForDate(today)).start;
  const rows = [["Folder", "File", "Title", "Last updated by the publisher", "Updated this financial year", "This copy saved", "Last checked", "Source"]];
  const used = new Set<string>();
  let written = 0;
  for (const d of docs) {
    const folder = d.referenceFolder ?? "Other";
    const title = referenceTitle(d.originalFilename);
    const ext = path.extname(d.originalFilename) || (d.mimeType === "application/pdf" ? ".pdf" : ".txt");
    let name = `${safeName(title)}${ext}`;
    for (let n = 2; used.has(`${folder}/${name}`.toLowerCase()); n++) name = `${safeName(title)} (${n})${ext}`;
    let bytes: Buffer;
    try {
      bytes = await readDocumentFile(d.filePath);
    } catch {
      continue;
    }
    used.add(`${folder}/${name}`.toLowerCase());
    await fsp.mkdir(path.join(outRoot, ...folder.split("/")), { recursive: true });
    await fsp.writeFile(path.join(outRoot, ...folder.split("/"), name), bytes);
    written += 1;
    const check = d.referenceLinkId ? checks.get(d.referenceLinkId) : undefined;
    rows.push([
      folder,
      name,
      title,
      ymd(d.sourceUpdatedAt),
      d.sourceUpdatedAt ? (d.sourceUpdatedAt >= fyStart ? "Yes" : "No") : "Not shown on the page",
      ymd(d.retrievedAt ?? d.uploadDate),
      ymd(check?.checkedAt),
      d.sourceUrl ?? "",
    ]);
  }
  await fsp.writeFile(path.join(outRoot, "_Index.csv"), rows.map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n");
  await fsp.writeFile(
    path.join(outRoot, "READ ME.txt"),
    [
      `The official reference library from Financial Vault, as of ${ymd(today)}.`,
      "",
      "Each document is in a folder by who published it and what it is. _Index.csv lists them all,",
      "with the date the publisher last updated each one and whether that's this financial year.",
      "These are copies: Financial Vault keeps the originals, and older versions, under",
      "Documents -> Tax references.",
      "",
    ].join("\r\n")
  );
  return written;
}

async function zipFolder(outRoot: string, when: string): Promise<string> {
  for (const f of await fsp.readdir(outRoot)) if (f.endsWith(".zip")) await fsp.rm(path.join(outRoot, f), { force: true });
  const zip = path.join(outRoot, `${DOWNLOADS_FOLDER} ${when}.zip`);
  const tmp = path.join(path.dirname(outRoot), `.${DOWNLOADS_FOLDER} ${when}.zip.part`);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
    archive.glob("**/*", { cwd: outRoot, ignore: ["*.zip", "last-download.json"] }, { prefix: DOWNLOADS_FOLDER });
    void archive.finalize();
  });
  await fsp.rename(tmp, zip);
  return zip;
}

export async function downloadReferencePack(
  opts: { fetcher?: Fetcher; root?: string; outRoot?: string; now?: Date; pauseMs?: number; zip?: boolean; onProgress?: (done: number, title: string) => void } = {}
): Promise<DownloadResult> {
  const fetcher = opts.fetcher ?? httpFetch;
  const now = opts.now ?? new Date();
  const pause = opts.pauseMs ?? 300;
  const outRoot = opts.outRoot ?? downloadsRoot();
  const root = opts.root ?? REFERENCE_ROOT;
  let done = 0;
  const progress = (t: string) => opts.onProgress?.(done++, t);

  // 1. The sources in the link pack.
  const summary = await checkForNewVersions(fetcher, now, root, progress);
  const links = await readLinkPack(root);
  const titles = new Map(links.map((l) => [l.id, l.title]));
  const failedChecks = await prisma.referenceCheck.findMany({
    where: { status: { in: ["FAILED", "BROKEN"] }, checkedAt: { gte: new Date(now.getTime() - DAY) } },
  });
  const failed: DownloadResult["failed"] = failedChecks
    .filter((c) => titles.has(c.linkId))
    .map((c) => ({ title: titles.get(c.linkId)!, url: c.url ?? "", reason: c.message ?? "couldn't be reached" }));

  // 2. The occupation guides.
  const index = links.find((l) => l.id === OCCUPATION_INDEX_ID);
  const occ = index ? await occupationGuides(index, fetcher, now, pause, progress) : { guides: 0, changed: 0, failed: [] };
  failed.push(...occ.failed);

  // 3. The folders, and 4. the ZIP.
  progress("Writing the folders");
  const documents = await writeLibraryFolders(outRoot, now);
  const wantZip = opts.zip ?? (await featureOn(ZIP_FEATURE));
  let zip: string | null = null;
  if (wantZip) zip = await zipFolder(outRoot, now.toISOString().slice(0, 10));
  else for (const f of await fsp.readdir(outRoot)) if (f.endsWith(".zip")) await fsp.rm(path.join(outRoot, f), { force: true });

  const result: DownloadResult = {
    folder: outRoot,
    zip,
    savedAt: now.toISOString(),
    documents,
    changed: summary.updated + summary.newYear + occ.changed,
    sources: summary.checked,
    occupationGuides: occ.guides,
    failed,
  };
  await fsp.writeFile(path.join(outRoot, "last-download.json"), JSON.stringify(result, null, 2));
  return result;
}

export async function lastDownload(outRoot = downloadsRoot()): Promise<DownloadResult | null> {
  try {
    const r = JSON.parse(await fsp.readFile(path.join(outRoot, "last-download.json"), "utf8")) as DownloadResult;
    if (r.zip && !fs.existsSync(r.zip)) r.zip = null;
    return r;
  } catch {
    return null;
  }
}

/** The ZIP for Claude, made from the folders as they are (the switch turned on after a download). */
export async function zipLibraryNow(outRoot = downloadsRoot(), now = new Date()): Promise<string> {
  const last = await lastDownload(outRoot);
  const zip = await zipFolder(outRoot, now.toISOString().slice(0, 10));
  if (last) await fsp.writeFile(path.join(outRoot, "last-download.json"), JSON.stringify({ ...last, zip }, null, 2));
  return zip;
}

// One download at a time, run in the background; the page asks how it's going.
let running: { startedAt: string; done: number; current: string; error?: string } | null = null;

export function downloadProgress() {
  return running;
}

export function startDownload(): boolean {
  if (running && !running.error) return false;
  running = { startedAt: new Date().toISOString(), done: 0, current: "Starting" };
  const job = running;
  downloadReferencePack({ onProgress: (d, t) => Object.assign(job, { done: d, current: t }) })
    .then(() => {
      if (running === job) running = null;
    })
    .catch((e: Error) => {
      job.error = e.message;
    });
  return true;
}
