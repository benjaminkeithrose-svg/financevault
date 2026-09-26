import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import yauzl from "yauzl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { classifyDocument } from "../src/services/classification.js";
import { deductibleInterest, purposeSplit, usableEquity } from "../src/services/debtAllocation.js";
import { loadLibrary, libraryStatus } from "../src/services/referenceLibrary.js";
import { detectReferenceCode, nextReferenceCheck } from "../src/services/taxReference.js";

// Batch 2: the Tax reference document type and reference library, debt
// allocation stage 1 (loan purposes, interest schedule, usable equity) and
// the "Why is this claimed?" note with its export.

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (s: string) => d(s).toISOString();

/** Entry names and text of a ZIP, for checking what went in. */
function readZip(buffer: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      const out = new Map<string, string>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e);
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(out));
      zip.readEntry();
    });
  });
}
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const RULING_TEXT =
  "Taxation Ruling TR 2000/2\nIncome tax: deductibility of interest on moneys drawn down under line of credit facilities\nThis Ruling is a public ruling. Australian Taxation Office.";

describe("tax references", () => {
  it("recognises a ruling, takes its code from the heading, and gives it no owner", () => {
    const r = classifyDocument({ filename: "tr2000-002.pdf", text: RULING_TEXT, entities: [{ id: "e", name: "Australian" }] });
    expect(r.documentType).toBe("Tax Reference");
    expect(r.referenceCode).toBe("TR 2000/2");
    expect(r.entityId).toBeNull();
    expect(r.amount).toBeNull();
  });

  it("ignores codes quoted further into a guide", () => {
    const guide = "Rental expenses\nPrint whole section\n" + "x".repeat(3000) + "\nsee PCG 2024/2";
    expect(detectReferenceCode(guide)).toBeNull();
    expect(detectReferenceCode("PCG 2016/5 - arm's length terms ... PCG 2016/5")).toBe("PCG 2016/5");
    expect(detectReferenceCode("ASIC Regulatory Guide RG 209")).toBe("RG 209");
  });

  it("checks again on the next 31 July", () => {
    expect(nextReferenceCheck(d("2026-09-26")).toISOString().slice(0, 10)).toBe("2027-07-31");
    expect(nextReferenceCheck(d("2027-03-01")).toISOString().slice(0, 10)).toBe("2027-07-31");
  });
});

describe("debt allocation rules", () => {
  const purposes = [
    { id: "a", date: d("2024-03-01"), amount: 400_000, deductible: true, assetId: "rental", description: "Buy rental" },
    { id: "b", date: d("2024-03-01"), amount: 100_000, deductible: false, assetId: null, description: "Home renovation" },
    { id: "c", date: d("2026-09-01"), amount: 50_000, deductible: true, assetId: "shares", description: "Shares" },
  ];

  it("splits a loan by what its money was used for, as at a date", () => {
    const before = purposeSplit(purposes, d("2026-06-30"));
    expect(before.deductibleShare).toBeCloseTo(0.8);
    const after = purposeSplit(purposes);
    expect(after.deductibleShare).toBeCloseTo(450 / 550);
    expect(purposeSplit([]).deductibleShare).toBeNull();
  });

  it("applies the share to the year's interest, by use", () => {
    const r = deductibleInterest(30_000, purposeSplit(purposes, d("2026-06-30")));
    expect(r.deductible).toBeCloseTo(24_000);
    expect(r.private).toBeCloseTo(6_000);
    expect(r.byUse).toHaveLength(1);
  });

  it("works out usable equity from the lender's maximum", () => {
    expect(usableEquity(1_000_000, null, 500_000)?.usable).toBe(300_000);
    expect(usableEquity(1_000_000, 0.9, 500_000)?.usable).toBe(400_000);
    expect(usableEquity(500_000, null, 600_000)?.usable).toBe(0);
    expect(usableEquity(null, null, 0)).toBeNull();
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  async function post(p: string, body: unknown) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  let tmpRoot: string;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "debt allocation test passcode" })).status).toBe(201);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fv-reflib-"));
  });
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  let alex: { id: string; entityId: string };
  let sam: { id: string; entityId: string };
  let rulingId: string;

  it("files an uploaded ruling as a tax reference, lists it separately and keeps it out of packs", async () => {
    alex = await agent.get(`/api/people/${(await post("/people", { name: "Alex Borrower" })).id}`).then((r) => r.body);
    const upload = await agent.post("/api/documents/upload").attach("file", Buffer.from(RULING_TEXT + " unique-a"), { filename: "tr2000-002.txt", contentType: "text/plain" });
    const doc = upload.body.document;
    rulingId = doc.id;
    expect(doc.documentType).toBe("Tax Reference");
    expect(doc.referenceCode).toBe("TR 2000/2");
    expect(doc.referenceCheckBy).toBeTruthy();
    expect(doc.taxRelevance).toBe("NOT_RELEVANT");

    const everyday = (await agent.get("/api/documents")).body.map((x: { id: string }) => x.id);
    expect(everyday).not.toContain(doc.id);
    const refs = (await agent.get("/api/documents?reference=only")).body.map((x: { id: string }) => x.id);
    expect(refs).toContain(doc.id);

    // Even if someone gives it an owner, a pack leaves it out.
    await prisma.document.update({ where: { id: doc.id }, data: { entityId: alex.entityId, documentType: "Tax Reference" } });
    const other = await agent.post("/api/documents/upload").attach("file", Buffer.from("Notice of assessment from the ATO for Alex Borrower"), { filename: "noa.txt", contentType: "text/plain" });
    await agent.put(`/api/documents/${other.body.document.id}`).send({ documentType: "Notice of Assessment", entityId: alex.entityId }).expect(200);
    const res = await agent.post("/api/document-packs/generate").send({ entityId: alex.entityId, categories: ["Tax", "Reference"] }).buffer(true).parse(binary);
    const names = [...(await readZip(res.body)).keys()];
    expect(names).toContain("documents/noa.txt");
    expect(names.some((n) => n.includes("tr2000"))).toBe(false);
  });

  it("puts one check-current reminder per date in the calendar", async () => {
    const events = (await agent.get("/api/calendar?from=2026-01-01&to=2028-12-31")).body as Array<{ category: string; title: string }>;
    const refs = events.filter((e) => e.category === "REFERENCE");
    expect(refs).toHaveLength(1);
    expect(refs[0].title).toMatch(/TR 2000\/2/);
  });

  it("loads a reference library once, and only adds what's missing the second time", async () => {
    fs.mkdirSync(path.join(tmpRoot, "sources"));
    fs.writeFileSync(
      path.join(tmpRoot, "link-pack.json"),
      JSON.stringify({ links: [{ id: "pcg-2016-5", title: "PCG 2016/5 — safe-harbour terms", publisher: "ATO", url: "https://example.invalid/pcg" }] })
    );
    fs.writeFileSync(path.join(tmpRoot, "sources", "index.json"), JSON.stringify({ files: [{ file: "pcg-2016-5.txt", covers: ["pcg-2016-5"] }] }));
    fs.writeFileSync(path.join(tmpRoot, "sources", "pcg-2016-5.txt"), "Some guideline text without much to go on");

    expect((await libraryStatus(tmpRoot)).items[0].documentId).toBeNull();
    expect(await loadLibrary(tmpRoot)).toEqual({ added: 1, alreadyHere: 0, missing: [] });
    expect(await loadLibrary(tmpRoot)).toEqual({ added: 0, alreadyHere: 1, missing: [] });
    const status = await libraryStatus(tmpRoot);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: status.items[0].documentId! } });
    expect(doc.documentType).toBe("Tax Reference");
    expect(doc.referenceCode).toBe("PCG 2016/5");
    expect(doc.reviewStatus).toBe("CONFIRMED");
    expect(doc.notes).toMatch(/example.invalid/);
  });

  it("records a loan's uses and interest, and schedules the deductible part by borrower", async () => {
    sam = await agent.get(`/api/people/${(await post("/people", { name: "Sam Borrower" })).id}`).then((r) => r.body);
    const rental = await post("/properties", { name: "4 Rental Ave", address: "4 Rental Ave", entityId: alex.entityId, currentValue: 900_000 });
    const loan = await post("/liabilities", {
      name: "Split 1",
      liabilityType: "INVESTMENT_LOAN",
      entityId: alex.entityId,
      currentBalance: 500_000,
      facility: "CBA home loan",
      securityPropertyId: rental.id,
      owners: [
        { entityId: alex.entityId, percent: 50 },
        { entityId: sam.entityId, percent: 50 },
      ],
    });
    const statement = (await agent.post("/api/documents/upload").attach("file", Buffer.from("Interest statement 2025-26"), { filename: "interest.txt", contentType: "text/plain" })).body.document;
    const buy = await post(`/debt-allocation/loans/${loan.id}/purposes`, {
      date: iso("2024-03-01"),
      amount: 400_000,
      use: "PROPERTY",
      deductible: true,
      assetId: rental.assetId,
      description: "Purchase of 4 Rental Ave",
      documentId: statement.id,
    });
    await post(`/debt-allocation/loans/${loan.id}/purposes`, { amount: 100_000, use: "PRIVATE", deductible: false, description: "Home renovation" });
    const year = (await agent.put(`/api/debt-allocation/loans/${loan.id}/interest-years`).send({ fyLabel: "2025-26", interestCharged: 30_000, documentId: statement.id }).expect(200)).body;

    const view = (await agent.get(`/api/debt-allocation/loans/${loan.id}`)).body;
    expect(view.split.deductibleShare).toBeCloseTo(0.8);
    expect(view.reasonsFor).toEqual([]);

    const schedule = (await agent.get("/api/debt-allocation/schedule?fy=2025-26")).body;
    const row = schedule.rows.find((r: { liabilityId: string }) => r.liabilityId === loan.id);
    expect(row.deductibleInterest).toBeCloseTo(24_000);
    expect(row.facility).toBe("CBA home loan");
    expect(row.owners.map((o: { deductibleInterest: number }) => Math.round(o.deductibleInterest))).toEqual([12_000, 12_000]);
    expect(row.byUse[0].assetName).toBe("4 Rental Ave");

    // Usable equity on the rental: 900,000 × 80% − 500,000.
    const equity = (await agent.get(`/api/debt-allocation/usable-equity/${rental.assetId}`)).body;
    expect(equity.equity.usable).toBe(220_000);
    await agent.put(`/api/assets/${rental.assetId}`).send({ lenderMaxLvr: 0.9 }).expect(200);
    expect((await agent.get(`/api/debt-allocation/usable-equity/${rental.assetId}`)).body.equity.usable).toBe(310_000);

    // The Accountant Pack's interest schedule, from Sam's side.
    const fy = (await agent.get("/api/financial-years")).body.find((f: { label: string }) => f.label === "2025-26") ?? (await post("/financial-years", { label: "2025-26" }));
    const pack = await agent.post("/api/document-packs/generate").send({ entityId: sam.entityId, financialYearId: fy.id, generated: ["INTEREST_SCHEDULE"] }).buffer(true).parse(binary);
    const csv = (await readZip(pack.body)).get("loan_interest_schedule.csv")!;
    expect(csv).toMatch(/Split 1/);
    expect(csv).toMatch(/12000\.00/);

    // Why is this claimed?
    await agent
      .put("/api/claim-notes")
      .send({ targetType: "LOAN_PURPOSE", targetId: buy.id, reason: "Bought the rental", referenceDocumentId: rulingId, referencePinpoint: "paragraph 12", accountantNote: "Agreed", accountantAgreedOn: iso("2026-08-01") })
      .expect(200);
    await agent.put("/api/claim-notes").send({ targetType: "LOAN_PURPOSE", targetId: buy.id, reason: "Bought the rental property" }).expect(200);
    const claim = (await agent.get(`/api/claim-notes?targetType=LOAN_PURPOSE&targetId=${buy.id}`)).body;
    expect(claim.note.reason).toBe("Bought the rental property");
    expect(claim.evidence.map((e: { id: string }) => e.id)).toEqual([statement.id]);
    expect(claim.history.map((h: { action: string }) => h.action).sort()).toEqual(["CLAIM_REASON_ADDED", "CLAIM_REASON_CHANGED"]);
    expect((await agent.get(`/api/debt-allocation/loans/${loan.id}`)).body.reasonsFor).toEqual([buy.id]);

    await agent.put("/api/claim-notes").send({ targetType: "LOAN_INTEREST_YEAR", targetId: year.id, reason: "Interest on the loan", referenceDocumentId: rulingId }).expect(200);
    const exported = await agent.get(`/api/claim-notes/export?targetType=LOAN_INTEREST_YEAR&targetId=${year.id}`).buffer(true).parse(binary);
    const files = await readZip(exported.body);
    expect(files.get("why_this_is_claimed.txt")).toMatch(/Deductible interest: \$24,000\.00/);
    expect([...files.keys()]).toEqual(expect.arrayContaining(["reference/tr2000-002.txt", "evidence/interest.txt"]));

    // Deleting the use removes its note too.
    await agent.delete(`/api/debt-allocation/purposes/${buy.id}`).expect(204);
    expect(await prisma.claimNote.count({ where: { targetId: buy.id } })).toBe(0);
  });
});
