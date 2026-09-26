import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Turning off a file's extracted text: it stops showing up in search and
// feeding the lease-term suggester, without touching the file or deleting
// the text — and turning it back on undoes exactly that.

const agent = request.agent(app);
async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe("turning off a document's extracted text", () => {
  let docId: string;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "text toggle test passcode" })).status).toBe(201);
    const upload = await agent.post("/api/documents/upload").attach("file", Buffer.from("just a plain file"), "plain.txt");
    docId = upload.body.document.id;
    // OCR only runs on images/PDFs; set the extracted text directly so the
    // toggle's effect on search and the lease suggester can be tested
    // without depending on the OCR engine itself.
    await prisma.document.update({ where: { id: docId }, data: { ocrText: "a very distinctive ocr phrase xyzzy" } });
  });

  it("defaults to on, and can be turned off and back on", async () => {
    const doc = await agent.get(`/api/documents/${docId}`);
    expect(doc.body.textExtractionEnabled).toBe(true);

    const off = await agent.put(`/api/documents/${docId}`).send({ textExtractionEnabled: false });
    expect(off.body.textExtractionEnabled).toBe(false);
    expect(off.body.ocrText).toBe("a very distinctive ocr phrase xyzzy"); // kept, just not used

    const on = await agent.put(`/api/documents/${docId}`).send({ textExtractionEnabled: true });
    expect(on.body.textExtractionEnabled).toBe(true);
  });

  it("leaves the file out of search results while it's off", async () => {
    await agent.put(`/api/documents/${docId}`).send({ textExtractionEnabled: true });
    expect((await agent.get("/api/documents?q=xyzzy")).body.map((d: { id: string }) => d.id)).toContain(docId);
    expect((await agent.get("/api/search?q=xyzzy")).body.documents.map((d: { id: string }) => d.id)).toContain(docId);

    await agent.put(`/api/documents/${docId}`).send({ textExtractionEnabled: false });
    expect((await agent.get("/api/documents?q=xyzzy")).body.map((d: { id: string }) => d.id)).not.toContain(docId);
    expect((await agent.get("/api/search?q=xyzzy")).body.documents.map((d: { id: string }) => d.id)).not.toContain(docId);

    // Other fields still match regardless — the toggle only affects the OCR text.
    await agent.put(`/api/documents/${docId}`).send({ notes: "xyzzy note" });
    expect((await agent.get("/api/documents?q=xyzzy")).body.map((d: { id: string }) => d.id)).toContain(docId);
  });

  it("stops feeding the commercial-property lease term suggester while off", async () => {
    const entity = await post("/entities", { name: "Text Toggle Trust", entityType: "TRUST" });
    const cp = await post("/commercial-properties", { name: "Unit 1", address: "1 Toggle Rd", propertyTypes: ["INDUSTRIAL"], entityId: entity.id, currentValue: 500_000 });
    const tenancy = await post(`/commercial-properties/${cp.id}/tenancies`, { tenantName: "Tenant Co", leaseStatus: "ACTIVE" });
    await agent.post(`/api/documents/${docId}/links`).send({ targetType: "TENANCY", targetId: tenancy.id });
    await prisma.document.update({
      where: { id: docId },
      data: {
        documentType: "Lease",
        ocrText: "Lease commencement 1 July 2024. Rent per annum $52,000. Reviews by CPI.",
        textExtractionEnabled: true,
      },
    });

    const on = await agent.get(`/api/commercial-properties/tenancies/${tenancy.id}/extract-lease-terms`);
    expect(on.body.found).toBe(true);
    expect(on.body.suggestion.rentPerAnnum).toBe(52_000);

    await agent.put(`/api/documents/${docId}`).send({ textExtractionEnabled: false });
    const off = await agent.get(`/api/commercial-properties/tenancies/${tenancy.id}/extract-lease-terms`);
    expect(off.body.found).toBe(true);
    expect(off.body.suggestion.rentPerAnnum).toBeNull();
  });
});
