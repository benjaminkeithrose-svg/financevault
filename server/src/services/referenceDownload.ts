import { ZipArchive } from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { dataFolder, programVersion } from "./appInfo.js";
import { SERVER_ROOT } from "./paths.js";
import { REFERENCE_ROOT } from "./referenceLibrary.js";
import { Fetcher, FetchResult, htmlToText, httpFetch, LinkEntry, readLinkPack } from "./referenceUpdates.js";

/**
 * "Download everything for Claude": fetches every official source in the
 * link pack — and every ATO occupation guide, found by following the guides'
 * index pages — into a dated folder, with a ZIP of it to upload. Runs on the
 * person's own computer, which the ATO lets in (it turns away cloud
 * computers). Nothing is added to the vault and nothing about the person is
 * sent: it only asks for public pages.
 *
 * Each page is saved as text; where a page has a "Print whole section" link,
 * that PDF (the whole section in one document) is saved as well.
 */

export const DOWNLOADS_FOLDER = "Reference downloads";
const OCCUPATION_INDEX_ID = "occupation-guides";
const MAX_OCCUPATION_PAGES = 400;
const MAX_DEPTH = 3;

export function downloadsRoot(): string {
  const data = dataFolder();
  return data ? path.join(data, DOWNLOADS_FOLDER) : path.join(SERVER_ROOT, "storage", DOWNLOADS_FOLDER);
}

const isPdf = (r: FetchResult) => r.contentType.includes("pdf") || r.body.subarray(0, 5).toString("latin1") === "%PDF-";

/** The "Print whole section" link on an ATO page, if it has one. */
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

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";

function textFile(title: string, url: string, when: string, text: string) {
  return `${title}\nSource: ${url}\nSaved: ${when}\n\n${text}\n`;
}

export interface DownloadedFile {
  file: string;
  covers: string[];
  title: string;
  url: string;
}

export interface DownloadResult {
  folder: string;
  zip: string;
  savedAt: string;
  files: number;
  sources: number;
  occupationPages: number;
  occupationSections: number;
  failed: Array<{ title: string; url: string; reason: string }>;
}

function sourceUrl(l: LinkEntry): string {
  if (l.download) return l.download;
  if (l.urlPattern && l.latestYear) return l.urlPattern.replace("{YEAR}", String(l.latestYear));
  return l.url;
}

function reasonFor(r: FetchResult | null, e?: unknown): string {
  if (e) return (e as Error).name === "TimeoutError" ? "took too long to answer" : "couldn't be reached";
  if (!r) return "couldn't be reached";
  if (r.status === 404 || r.status === 410) return "page has moved or gone";
  if (r.status === 403 || r.status === 429) return "the site turned the request away";
  return `the site answered ${r.status}`;
}

export async function downloadReferencePack(
  opts: { fetcher?: Fetcher; root?: string; outRoot?: string; now?: Date; pauseMs?: number; onProgress?: (done: number, title: string) => void } = {}
): Promise<DownloadResult> {
  const fetcher = opts.fetcher ?? httpFetch;
  const now = opts.now ?? new Date();
  const when = now.toISOString().slice(0, 10);
  const pause = opts.pauseMs ?? 300;
  const folder = path.join(opts.outRoot ?? downloadsRoot(), when);
  await fsp.rm(folder, { recursive: true, force: true });
  await fsp.mkdir(path.join(folder, "occupation-guides"), { recursive: true });

  const links = await readLinkPack(opts.root ?? REFERENCE_ROOT);
  const files: DownloadedFile[] = [];
  const failed: DownloadResult["failed"] = [];
  const printed = new Set<string>();
  const wait = () => new Promise((r) => setTimeout(r, pause));

  async function get(url: string): Promise<{ r: FetchResult | null; error?: unknown }> {
    try {
      const r = await fetcher(url);
      await wait();
      return { r };
    } catch (error) {
      return { r: null, error };
    }
  }

  /** Saves one page (as text, or the PDF it is) and its print-whole-section PDF. Returns the page's HTML. */
  let done = 0;
  async function save(dir: string, name: string, title: string, url: string, covers: string[]): Promise<string | null> {
    opts.onProgress?.(done++, title);
    const { r, error } = await get(url);
    if (!r || r.status !== 200) {
      failed.push({ title, url, reason: reasonFor(r, error) });
      return null;
    }
    if (isPdf(r)) {
      await fsp.writeFile(path.join(folder, dir, `${name}.pdf`), r.body);
      files.push({ file: path.posix.join(dir, `${name}.pdf`), covers, title, url });
      return null;
    }
    const html = r.body.toString("utf8");
    await fsp.writeFile(path.join(folder, dir, `${name}.txt`), textFile(title, url, when, htmlToText(html)));
    files.push({ file: path.posix.join(dir, `${name}.txt`), covers, title, url });
    const print = findPrintLink(html, url);
    if (print && !printed.has(print)) {
      printed.add(print);
      const p = await get(print);
      if (p.r?.status === 200 && isPdf(p.r)) {
        await fsp.writeFile(path.join(folder, dir, `${name} (whole section).pdf`), p.r.body);
        files.push({ file: path.posix.join(dir, `${name} (whole section).pdf`), covers, title: `${title} — whole section`, url: print });
      }
    }
    return html;
  }

  // 1. Every source in the link pack.
  let sources = 0;
  for (const l of links.filter((x) => x.kind !== "index")) {
    await save(".", l.id, l.title, sourceUrl(l), [l.id]);
    sources += 1;
  }

  // 2. The occupation guides: from the index, down through A–D, E–K… to each guide.
  let occupationPages = 0;
  const index = links.find((l) => l.id === OCCUPATION_INDEX_ID);
  if (index) {
    const start = index.url.replace(/\/+$/, "");
    const prefix = new URL(start).pathname.replace(/\/[^/]+$/, "/");
    const seen = new Set<string>([start]);
    const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
    while (queue.length && occupationPages < MAX_OCCUPATION_PAGES) {
      const { url, depth } = queue.shift()!;
      // Named from the index down: "index", "a-d", "a-d-nurses-and-midwives".
      const at = new URL(url).pathname;
      const startPath = new URL(start).pathname;
      const name = at === startPath ? "index" : slug(at.startsWith(`${startPath}/`) ? at.slice(startPath.length + 1) : at.slice(prefix.length));
      const title = depth === 0 ? index.title : `Occupation guide: ${name.replace(/-/g, " ")}`;
      const html = await save("occupation-guides", name, title, url, depth === 0 ? [index.id] : []);
      occupationPages += 1;
      if (!html || depth >= MAX_DEPTH) continue;
      for (const next of findSectionLinks(html, url, prefix)) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push({ url: next, depth: depth + 1 });
      }
    }
  }

  const manifest = {
    note: "Official reference documents downloaded by Financial Vault for loading into its reference library. Upload the ZIP to Claude.",
    savedAt: now.toISOString(),
    programVersion: programVersion(),
    files,
    failed,
  };
  await fsp.writeFile(path.join(folder, "index.json"), JSON.stringify(manifest, null, 2));
  await fsp.writeFile(
    path.join(folder, "READ ME.txt"),
    [
      "Official reference documents, downloaded by Financial Vault on " + when + ".",
      "",
      "To give them to Claude: upload the ZIP next to this folder",
      `("${DOWNLOADS_FOLDER} ${when}.zip") into the conversation.`,
      "",
      `${files.length} files saved. ${failed.length ? `${failed.length} couldn't be downloaded — they're listed in index.json under "failed"; open those by hand and save them as PDFs.` : "Nothing failed."}`,
      "",
    ].join("\r\n")
  );

  const zip = path.join(path.dirname(folder), `${DOWNLOADS_FOLDER} ${when}.zip`);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(zip);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(folder, `${DOWNLOADS_FOLDER} ${when}`);
    void archive.finalize();
  });

  const result: DownloadResult = {
    folder,
    zip,
    savedAt: now.toISOString(),
    files: files.length,
    sources,
    occupationPages,
    occupationSections: files.filter((f) => f.file.startsWith("occupation-guides/") && f.file.endsWith("(whole section).pdf")).length,
    failed,
  };
  await fsp.writeFile(path.join(path.dirname(folder), "last-download.json"), JSON.stringify(result, null, 2));
  return result;
}

export async function lastDownload(outRoot = downloadsRoot()): Promise<DownloadResult | null> {
  try {
    const r = JSON.parse(await fsp.readFile(path.join(outRoot, "last-download.json"), "utf8")) as DownloadResult;
    return fs.existsSync(r.zip) ? r : null;
  } catch {
    return null;
  }
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
