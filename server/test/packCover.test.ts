import { describe, expect, it } from "vitest";
import { packCover } from "../src/routes/documentPacks.js";

// A Document Pack's cover page: the Financial Vault mark, whose pack it is,
// and what's in it — with names escaped, since it opens in a browser.

describe("the pack's cover page", () => {
  it("names the pack, lists what's in it, and escapes anything typed in", () => {
    const html = packCover({
      entityName: "Rose & Co <Trust>",
      fyLabel: "2025-26",
      documents: [{ name: "Rates <script>alert(1)</script>.pdf", type: "Council Rates", date: "2025-08-01" }],
      reports: ["Tax summary (tax_summary.csv)"],
      now: new Date("2026-09-27T02:00:00Z"),
    });
    expect(html).toContain("<title>Document Pack — Rose &amp; Co &lt;Trust&gt;</title>");
    expect(html).toContain("Financial year 2025-26 · Prepared 27 September 2026 with Financial Vault");
    expect(html).toContain("Rates &lt;script&gt;alert(1)&lt;/script&gt;.pdf");
    expect(html).not.toContain("<script>");
    expect(html).toContain('aria-label="Financial Vault"');
    expect(html).toContain("<li>Tax summary (tax_summary.csv)</li>");
  });
});
