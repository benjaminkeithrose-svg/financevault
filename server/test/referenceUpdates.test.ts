import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { figures } from "../src/services/figures.js";
import { checkForNewVersions, Fetcher, htmlToText, looksWithdrawn, referenceChecks } from "../src/services/referenceUpdates.js";

// Batch 6: the reference library checks its links for newer versions.
// A pretend website stands in for the ATO — nothing goes online in tests.

describe("reading pages", () => {
  it("keeps the words and drops scripts and markup", () => {
    expect(htmlToText("<html><head><title>x</title></head><body><script>var a=1</script><h1>Tax rates</h1><p>15% &amp; 30%</p></body></html>")).toBe(
      "Tax rates\n15% & 30%"
    );
  });
  it("spots a withdrawn ruling near the top", () => {
    expect(looksWithdrawn("TR 95/25\nThis ruling has been withdrawn with effect from 1 July.\nMore text")).toMatch(/withdrawn/);
    expect(looksWithdrawn("TR 2000/2\nInterest on redraws. Nothing about withdrawal here.")).toBeNull();
  });
});

describe("check for new versions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fv-ref-"));
  const pages: Record<string, { status: number; type: string; body: string }> = {};
  const fetcher: Fetcher = async (url) => {
    if (url.includes("unreachable")) throw new Error("ECONNREFUSED");
    const p = pages[url] ?? { status: 404, type: "text/html", body: "Not found" };
    return { status: p.status, contentType: p.type, body: Buffer.from(p.body) };
  };
  const page = (url: string, body: string, type = "text/html", status = 200) => (pages[url] = { status, type, body });

  beforeAll(async () => {
    fs.writeFileSync(
      path.join(root, "link-pack.json"),
      JSON.stringify({
        links: [
          { id: "index-page", title: "Index", publisher: "ATO", kind: "index", url: "https://example.test/index" },
          { id: "tax-rates-residents", title: "Tax rates – Australian residents", publisher: "ATO", kind: "rates-page", url: "https://example.test/rates" },
          { id: "tr-95-25", title: "TR 95/25 — car expenses", publisher: "ATO", kind: "ruling", url: "https://example.test/tr9525" },
          {
            id: "rental-properties-guide",
            title: "Rental properties guide",
            publisher: "ATO",
            kind: "yearly-guide",
            url: "https://example.test/rental-2026",
            urlPattern: "https://example.test/rental-{YEAR}",
            latestYear: 2026,
          },
          { id: "moved-page", title: "Moved page — details", publisher: "ATO", kind: "page", url: "https://example.test/moved" },
          { id: "offline-page", title: "Offline", publisher: "ATO", kind: "page", url: "https://unreachable.test/x" },
        ],
      })
    );
    page("https://example.test/rates", "<h1>Tax rates 2026-27</h1><p>15% from $18,201</p>");
    page("https://example.test/tr9525", "<h1>TR 95/25</h1><p>This ruling has been withdrawn and replaced by TR 2026/1.</p>");
    page("https://example.test/rental-2026", "<h1>Rental properties 2026</h1>");
    page("https://example.test/rental-2027", "%PDF-1.4 rental properties 2027", "application/pdf");
  });

  it("saves current copies, finds next year's guide, spots withdrawn and moved pages", async () => {
    const today = new Date("2026-10-01T00:00:00Z");
    const summary = await checkForNewVersions(fetcher, today, root);
    expect(summary).toMatchObject({ checked: 5, updated: 1, newYear: 1, withdrawn: 1, broken: 1, failed: 1 });

    const { items } = await referenceChecks(root);
    const by = (id: string) => items.find((i) => i.linkId === id)!;
    expect(by("rental-properties-guide")).toMatchObject({ status: "NEW_YEAR", url: "https://example.test/rental-2027" });
    expect(by("moved-page").searchUrl).toMatch(/duckduckgo/);
    expect(by("offline-page").message).toMatch(/couldn't be reached/);

    const guide = await prisma.document.findUnique({ where: { id: by("rental-properties-guide").documentId! } });
    expect(guide).toMatchObject({ documentType: "Tax Reference", referenceLinkId: "rental-properties-guide", mimeType: "application/pdf" });
    expect(guide!.retrievedAt?.toISOString()).toBe(today.toISOString());
  });

  it("keeps one copy when nothing changed, and dates a new one when it did", async () => {
    let summary = await checkForNewVersions(fetcher, new Date("2026-10-02T00:00:00Z"), root);
    const rates = () => referenceChecks(root).then((r) => r.items.find((i) => i.linkId === "tax-rates-residents")!);
    expect((await rates()).status).toBe("CURRENT");
    const first = (await rates()).documentId!;

    page("https://example.test/rates", "<h1>Tax rates 2026-27</h1><p>14% from $18,201</p>");
    summary = await checkForNewVersions(fetcher, new Date("2026-10-03T00:00:00Z"), root);
    expect(summary.updated).toBe(1);
    const second = (await rates()).documentId!;
    expect(second).not.toBe(first);
    expect((await prisma.document.findUnique({ where: { id: first } }))!.supersededAt).not.toBeNull();
    expect((await prisma.document.findUnique({ where: { id: second } }))!.supersededAt).toBeNull();
  });

  it("counts claims that cite a withdrawn ruling, and flags figures whose source changed", async () => {
    const ruling = (await referenceChecks(root)).items.find((i) => i.linkId === "tr-95-25")!;
    await prisma.claimNote.create({
      data: { targetType: "WORK_DEDUCTION", targetId: "test-claim", reason: "Car claim", referenceDocumentId: ruling.documentId },
    });
    expect((await referenceChecks(root)).items.find((i) => i.linkId === "tr-95-25")!.claimsCiting).toBe(1);
    const f = await figures();
    expect(f.items.find((i) => i.id === "tax-rates")!.review).toBe(true);
    expect(f.items.find((i) => i.id === "mls")!.review).toBe(false);
  });
});

describe("reading a real-looking page", () => {
  it("keeps the main content and leaves out menus and banners", () => {
    const html = `<body><header><nav>Home | Land tax</nav><div>Planned outage this weekend</div></header>
      <main><h1>Land tax rates</h1><p>Threshold $1,075,000</p><aside>Related links</aside></main><footer>Copyright</footer></body>`;
    expect(htmlToText(html)).toBe("Land tax rates\nThreshold $1,075,000");
  });
});
