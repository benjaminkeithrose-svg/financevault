import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { downloadReferencePack, findPrintLink, findSectionLinks, lastDownload } from "../src/services/referenceDownload.js";
import type { FetchResult } from "../src/services/referenceUpdates.js";

// "Download everything for Claude", against a pretend ATO site: every source
// in the link pack, and every occupation guide found from the guides' index.

const ATO = "https://www.ato.gov.au";
const SECTION = "/x/guides/occupation-and-industry-specific-guides";
const PDF = Buffer.from("%PDF-1.4 pretend");
const page = (body: string) => `<html><head><title>t</title></head><body><nav><a href="/y/menu">Menu</a></nav><main>${body}</main></body></html>`;

const site: Record<string, FetchResult> = {
  [`${ATO}${SECTION}`]: html(page(`<h1>Guides</h1><a href="${SECTION}/a-d">A–D</a><a href="/x/guides">Up</a><a href="/y/other">Other</a>`)),
  [`${ATO}${SECTION}/a-d`]: html(page(`<h1>A–D</h1><a href="${SECTION}/a-d/nurses">Nurses</a><a href="${ATO}${SECTION}/a-d/cleaners/">Cleaners</a><a href="${SECTION}">Back</a>`)),
  [`${ATO}${SECTION}/a-d/nurses`]: html(page(`<h1>Nurses and midwives</h1><p>Deductions for nurses.</p><a href="/api/public/content/0-11111111-2222-3333-4444-555555555555?v=1">Print whole section</a>`)),
  [`${ATO}${SECTION}/a-d/cleaners`]: html(
    page(`<h1>Cleaners</h1><p>Deductions for cleaners.</p><script>{"label":"Print whole section","href":"/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}</script>`)
  ),
  [`${ATO}/api/public/content/0-11111111-2222-3333-4444-555555555555?v=1`]: pdf(),
  [`${ATO}/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`]: pdf(),
  [`${ATO}/rates`]: html(page("<h1>Rates</h1><p>The rate is 5%.</p>")),
  [`${ATO}/ruling.pdf`]: pdf(),
};

function html(s: string): FetchResult {
  return { status: 200, contentType: "text/html", body: Buffer.from(s) };
}
function pdf(): FetchResult {
  return { status: 200, contentType: "application/pdf", body: PDF };
}

describe("finding links on a page", () => {
  it("finds the print-whole-section link, as a plain link or in the page's script", () => {
    expect(findPrintLink(`<a class="x" href="/api/public/content/0-1?a=1&amp;b=2"><span>Print whole section</span></a>`, ATO)).toBe(`${ATO}/api/public/content/0-1?a=1&b=2`);
    expect(findPrintLink(`"Print whole section","url":"/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"`, ATO)).toBe(
      `${ATO}/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
    );
    expect(findPrintLink(`<a href="/print">Print this page</a>`, ATO)).toBeNull();
  });

  it("keeps to pages under the section", () => {
    const links = findSectionLinks(`<a href="/s/a">a</a><a href="https://www.ato.gov.au/s/b/">b</a><a href="/t/c">c</a><a href="https://other.com/s/d">d</a><img src="/s/logo.png">`, `${ATO}/s/`, "/s/");
    expect(links.sort()).toEqual([`${ATO}/s/a`, `${ATO}/s/b`]);
  });
});

describe("downloading everything", () => {
  it("saves every source and every occupation guide into a dated folder and a ZIP", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fv-ref-"));
    const out = path.join(root, "out");
    fs.writeFileSync(
      path.join(root, "link-pack.json"),
      JSON.stringify({
        links: [
          { id: "occupation-guides", title: "Occupation guides (index)", publisher: "ATO", kind: "index", url: `${ATO}${SECTION}` },
          { id: "rates", title: "Some rates", publisher: "ATO", kind: "rates-page", url: `${ATO}/rates` },
          { id: "ruling", title: "TR 2000/2", publisher: "ATO", kind: "ruling", url: `${ATO}/ruling`, download: `${ATO}/ruling.pdf` },
          { id: "gone", title: "A moved page", publisher: "ATO", kind: "page", url: `${ATO}/gone` },
        ],
      })
    );
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return site[url] ?? { status: 404, contentType: "text/html", body: Buffer.from("not found") };
    };

    const r = await downloadReferencePack({ fetcher, root, outRoot: out, now: new Date("2026-09-27T01:00:00Z"), pauseMs: 0 });
    const folder = path.join(out, "2026-09-27");
    expect(r.folder).toBe(folder);
    const saved = (f: string) => fs.existsSync(path.join(folder, f));

    // The link pack's sources.
    expect(fs.readFileSync(path.join(folder, "rates.txt"), "utf8")).toMatch(/^Some rates\nSource: https:\/\/www.ato.gov.au\/rates[\s\S]*The rate is 5%/);
    expect(fs.readFileSync(path.join(folder, "rates.txt"), "utf8")).not.toMatch(/Menu/);
    expect(saved("ruling.pdf")).toBe(true);
    expect(r.failed).toEqual([{ title: "A moved page", url: `${ATO}/gone`, reason: "page has moved or gone" }]);

    // The guides: index → A–D → each guide, with each guide's whole-section PDF.
    expect(saved("occupation-guides/index.txt")).toBe(true);
    expect(saved("occupation-guides/a-d.txt")).toBe(true);
    expect(fs.readFileSync(path.join(folder, "occupation-guides/a-d-nurses.txt"), "utf8")).toMatch(/Deductions for nurses/);
    expect(saved("occupation-guides/a-d-nurses (whole section).pdf")).toBe(true);
    expect(saved("occupation-guides/a-d-cleaners (whole section).pdf")).toBe(true);
    expect(r.occupationPages).toBe(4);
    expect(r.occupationSections).toBe(2);
    // Nothing outside the section, and nothing twice.
    expect(asked.some((u) => u.includes("/y/"))).toBe(false);
    expect(asked.filter((u) => u === `${ATO}${SECTION}`).length).toBe(1);

    // The manifest, the note, and the ZIP to upload.
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "index.json"), "utf8"));
    expect(manifest.files.find((f: { file: string }) => f.file === "rates.txt").covers).toEqual(["rates"]);
    expect(saved("READ ME.txt")).toBe(true);
    expect(r.zip).toBe(path.join(out, "Reference downloads 2026-09-27.zip"));
    expect(fs.statSync(r.zip).size).toBeGreaterThan(500);
    expect((await lastDownload(out))?.files).toBe(r.files);
  });
});
