import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { parseFeaturesOff } from "../src/routes/settings.js";
import { downloadReferencePack, findPrintLink, findSectionLinks, lastDownload } from "../src/services/referenceDownload.js";
import { publisherUpdated, referenceFolderFor, type FetchResult } from "../src/services/referenceUpdates.js";

// The official reference library, downloaded from a pretend ATO site: every
// source in the link pack and every occupation guide, filed as Tax
// references with when each was last updated, and written into folders.

const ATO = "https://dl.ato.test";
const SECTION = "/x/guides/occupation-and-industry-specific-guides";
const page = (body: string) => `<html><head><title>t</title></head><body><nav><a href="/y/menu">Menu</a></nav><main>${body}</main></body></html>`;
const html = (s: string): FetchResult => ({ status: 200, contentType: "text/html", body: Buffer.from(s) });
const pdf = (s: string): FetchResult => ({ status: 200, contentType: "application/pdf", body: Buffer.from(`%PDF-1.4 ${s}`) });

describe("reading the pages", () => {
  it("finds the print-whole-section link, as a plain link or in the page's script", () => {
    expect(findPrintLink(`<a class="x" href="/api/public/content/0-1?a=1&amp;b=2"><span>Print whole section</span></a>`, ATO)).toBe(`${ATO}/api/public/content/0-1?a=1&b=2`);
    expect(findPrintLink(`"Print whole section","url":"/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"`, ATO)).toBe(
      `${ATO}/api/public/content/0-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
    );
    expect(findPrintLink(`<a href="/print">Print this page</a>`, ATO)).toBeNull();
  });

  it("keeps to pages under the section", () => {
    const links = findSectionLinks(`<a href="/s/a">a</a><a href="${ATO}/s/b/">b</a><a href="/t/c">c</a><a href="https://other.com/s/d">d</a><img src="/s/logo.png">`, `${ATO}/s/`, "/s/");
    expect(links.sort()).toEqual([`${ATO}/s/a`, `${ATO}/s/b`]);
  });

  it("reads the publisher's own last-updated date", () => {
    expect(publisherUpdated("Occupation guides\nLast updated 11 May 2026\nOur guides")?.toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(publisherUpdated("Last modified: 3 Jul 2025")?.toISOString().slice(0, 10)).toBe("2025-07-03");
    expect(publisherUpdated("Nothing about dates")).toBeNull();
  });

  it("shelves each source by publisher and kind", () => {
    expect(referenceFolderFor({ publisher: "ATO", kind: "ruling" })).toBe("ATO/Rulings");
    expect(referenceFolderFor({ publisher: "ATO", kind: "rates-page" })).toBe("ATO/Rates and thresholds");
    expect(referenceFolderFor({ publisher: "ATO", kind: "occupation-guide" }, "A–D")).toBe("ATO/Occupation guides/A–D");
    expect(referenceFolderFor({ publisher: "Revenue NSW", kind: "page" })).toBe("Revenue NSW");
  });

  it("starts with the ZIP switched off, in a new copy and an existing one", () => {
    expect(parseFeaturesOff(null)).toEqual(["reference-zip"]);
    expect(parseFeaturesOff('["gmail"]')).toEqual(["gmail"]); // the upgrade step adds it to a saved list
  });
});

describe("downloading the library", () => {
  it("files every source and occupation guide, notes when each was updated, and writes the folders", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fv-lib-"));
    const out = path.join(root, "Reference downloads");
    fs.writeFileSync(
      path.join(root, "link-pack.json"),
      JSON.stringify({
        links: [
          { id: "occupation-guides", title: "Occupation guides (index)", publisher: "ATO", kind: "index", url: `${ATO}${SECTION}` },
          { id: "dl-rates", title: "DL test rates", publisher: "ATO", kind: "rates-page", url: `${ATO}/rates` },
          { id: "dl-ruling", title: "DL test ruling TR 2099/1", publisher: "ATO", kind: "ruling", url: `${ATO}/ruling` },
          { id: "dl-nsw", title: "DL test land tax", publisher: "Revenue NSW", kind: "page", url: `${ATO}/nsw` },
          { id: "dl-gone", title: "DL test moved page", publisher: "ATO", kind: "page", url: `${ATO}/gone` },
        ],
      })
    );
    const site: Record<string, FetchResult> = {
      [`${ATO}/rates`]: html(page("<h1>Rates</h1><p>Last updated 3 July 2026</p><p>The rate is 5%.</p>")),
      [`${ATO}/ruling`]: html(page(`<h1>TR 2099/1</h1><p>Last updated 2 March 2020</p><a href="/api/public/content/0-99999999-2222-3333-4444-555555555555">Print whole section</a>`)),
      [`${ATO}/api/public/content/0-99999999-2222-3333-4444-555555555555`]: pdf("the whole ruling"),
      [`${ATO}/nsw`]: html(page("<h1>Land tax</h1><p>Thresholds.</p>")),
      [`${ATO}${SECTION}`]: html(page(`<h1>Guides</h1><a href="${SECTION}/a-d">A–D</a><a href="/x/guides">Up</a><a href="/y/other">Other</a>`)),
      [`${ATO}${SECTION}/a-d`]: html(page(`<h1>A–D</h1><a href="${SECTION}/a-d/dl-nurses">Nurses</a><a href="${ATO}${SECTION}/a-d/dl-cleaners/">Cleaners</a>`)),
      [`${ATO}${SECTION}/a-d/dl-nurses`]: html(
        page(`<h1>DL Nurses and midwives</h1><p>Last updated 20 July 2026</p><a href="/api/public/content/0-11111111-2222-3333-4444-555555555555">Print whole section</a>`)
      ),
      [`${ATO}/api/public/content/0-11111111-2222-3333-4444-555555555555`]: pdf("nurses whole section"),
      [`${ATO}${SECTION}/a-d/dl-cleaners`]: html(page(`<h1>DL Cleaners</h1><p>Deductions for cleaners.</p><a href="${SECTION}/a-d/dl-cleaners/clothing">Clothing</a>`)),
      [`${ATO}${SECTION}/a-d/dl-cleaners/clothing`]: html(page(`<h1>Clothing</h1><p>Uniforms can be claimed.</p>`)),
    };
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return site[url] ?? { status: 404, contentType: "text/html", body: Buffer.from("not found") };
    };
    const now = new Date("2026-09-27T01:00:00Z");
    const r = await downloadReferencePack({ fetcher, root, outRoot: out, now, pauseMs: 0, zip: false });

    // Filed as Tax references, each in its place, with the publisher's date.
    const doc = async (linkId: string) => prisma.document.findFirst({ where: { referenceLinkId: linkId, supersededAt: null } });
    expect(await doc("dl-rates")).toMatchObject({ referenceFolder: "ATO/Rates and thresholds", mimeType: "text/plain" });
    expect((await doc("dl-rates"))!.sourceUpdatedAt!.toISOString().slice(0, 10)).toBe("2026-07-03");
    // The ruling's whole section, as a PDF.
    expect(await doc("dl-ruling")).toMatchObject({ referenceFolder: "ATO/Rulings", mimeType: "application/pdf" });
    expect(await doc("dl-nsw")).toMatchObject({ referenceFolder: "Revenue NSW" });
    const nurses = await doc("occupation:occupation-and-industry-specific-guides-a-d-dl-nurses");
    expect(nurses).toMatchObject({ referenceFolder: "ATO/Occupation guides/A–D", mimeType: "application/pdf" });
    expect(nurses!.sourceUpdatedAt!.toISOString().slice(0, 10)).toBe("2026-07-20");
    // A guide with no print link: its pages joined into one.
    const cleaners = await doc("occupation:occupation-and-industry-specific-guides-a-d-dl-cleaners");
    expect(cleaners!.ocrText).toMatch(/Deductions for cleaners[\s\S]*Uniforms can be claimed/);
    expect(r.occupationGuides).toBe(2);
    expect(r.failed).toEqual([expect.objectContaining({ title: "DL test moved page" })]);
    expect(asked.some((u) => u.includes("/y/"))).toBe(false);

    // The folders and their index.
    expect(fs.existsSync(path.join(out, "ATO", "Rulings", "DL test ruling TR 2099 1.pdf"))).toBe(true);
    expect(fs.readFileSync(path.join(out, "ATO", "Rates and thresholds", "DL test rates.txt"), "utf8")).toMatch(/The rate is 5%/);
    expect(fs.existsSync(path.join(out, "ATO", "Occupation guides", "A–D", "Occupation guide — DL Nurses and midwives.pdf"))).toBe(true);
    const index = fs.readFileSync(path.join(out, "_Index.csv"), "utf8");
    expect(index).toMatch(/ATO\/Rates and thresholds,DL test rates\.txt,DL test rates,2026-07-03,Yes,2026-09-27,2026-09-27/);
    expect(index).toMatch(/ATO\/Rulings,DL test ruling TR 2099 1\.pdf,DL test ruling TR 2099 1,2020-03-02,No/);
    expect(r.zip).toBeNull();

    // Next time, nothing changed: nothing new saved. Then a guide changes.
    const again = await downloadReferencePack({ fetcher, root, outRoot: out, now: new Date("2026-10-01T01:00:00Z"), pauseMs: 0, zip: true });
    expect(again.changed).toBe(0);
    expect(fs.statSync(again.zip!).size).toBeGreaterThan(300);
    expect(path.basename(again.zip!)).toBe("Reference downloads 2026-10-01.zip");

    site[`${ATO}${SECTION}/a-d/dl-cleaners/clothing`] = html(page(`<h1>Clothing</h1><p>Only compulsory uniforms can be claimed.</p>`));
    const third = await downloadReferencePack({ fetcher, root, outRoot: out, now: new Date("2026-10-02T01:00:00Z"), pauseMs: 0, zip: false });
    expect(third.changed).toBe(1);
    const newer = await doc("occupation:occupation-and-industry-specific-guides-a-d-dl-cleaners");
    expect(newer!.id).not.toBe(cleaners!.id);
    expect((await prisma.document.findUnique({ where: { id: cleaners!.id } }))!.supersededAt).not.toBeNull();
    // The folders hold only the current copy, and the old ZIP is gone with the switch off.
    const files = fs.readdirSync(path.join(out, "ATO", "Occupation guides", "A–D"));
    expect(files.filter((f) => f.includes("DL Cleaners"))).toHaveLength(1);
    expect((await lastDownload(out))?.zip).toBeNull();
  });
});
