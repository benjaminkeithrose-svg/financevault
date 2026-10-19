import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { factFindCsv } from "../src/routes/documentPacks.js";

// Personal & contact details, mother's maiden name, professional advisers,
// and the generic Fact Find summary for a broker.

const agent = request.agent(app);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
async function post(path: string, body: unknown) {
  const res = await agent.post(`/api${path}`).send(body as object);
  if (res.status >= 300) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe("Fact Find", () => {
  let alex: { id: string; entityId: string };
  let sam: { id: string; entityId: string };

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "fact find test passcode" })).status).toBe(201);
    const person = async (name: string) => (await agent.get(`/api/people/${(await post("/people", { name })).id}`)).body;
    alex = await person("Alex FactFind");
    sam = await person("Sam FactFind");
    await post("/people/family", { personId: alex.id, relatedPersonId: sam.id, relation: "PARTNER" });
  });

  it("keeps mother's maiden name encrypted, masked, and reveal-only", async () => {
    const updated = await agent.put(`/api/people/${alex.id}`).send({ motherMaidenName: "Wentworth" });
    expect(updated.body.motherMaidenName).toBeUndefined();
    expect(updated.body.hasMotherMaidenName).toBe(true);
    expect(updated.body.motherMaidenNameMasked).not.toContain("Wentworth");

    const [raw] = await prisma.$queryRaw<Array<{ motherMaidenName: string }>>`SELECT motherMaidenName FROM Person WHERE id = ${alex.id}`;
    expect(raw.motherMaidenName).not.toContain("Wentworth");
    expect((await agent.get(`/api/people/${alex.id}/mother-maiden-name`)).body.motherMaidenName).toBe("Wentworth");

    // Never appears in the audit log, even on a change.
    await agent.put(`/api/people/${alex.id}`).send({ motherMaidenName: "Ashworth" });
    const entries = await prisma.auditLog.findMany({ where: { targetId: alex.id, action: "PERSON_CHANGED" } });
    expect(entries.some((e) => (e.details ?? "").includes("Ashworth"))).toBe(false);
  });

  it("saves personal and contact details, and next of kin", async () => {
    const updated = await agent.put(`/api/people/${alex.id}`).send({
      phone: "0400 000 111",
      email: "alex@example.com",
      currentAddress: "1 Example St",
      maritalStatus: "MARRIED",
      nextOfKinName: "Sam FactFind",
      nextOfKinRelationship: "Spouse",
      nextOfKinPhone: "0400 000 222",
    });
    expect(updated.body.phone).toBe("0400 000 111");
    expect(updated.body.maritalStatus).toBe("MARRIED");
    // Clearing with an empty string, not just omitting the field.
    const cleared = await agent.put(`/api/people/${alex.id}`).send({ email: "" });
    expect(cleared.body.email).toBeNull();
  });

  it("keeps a family-wide list of professional advisers", async () => {
    expect((await agent.post("/api/advisers").send({ kind: "NOT_A_KIND" })).status).toBe(400);
    const adviser = await post("/advisers", { kind: "ACCOUNTANT", firm: "Smith & Co", contactFirstName: "Jo", contactSurname: "Lee", phone: "07 1234 5678" });
    expect((await agent.get("/api/advisers")).body.map((a: { id: string }) => a.id)).toContain(adviser.id);
    await agent.put(`/api/advisers/${adviser.id}`).send({ firm: "Smith & Partners" });
    expect((await agent.get("/api/advisers")).body.find((a: { id: string }) => a.id === adviser.id).firm).toBe("Smith & Partners");
    expect((await agent.delete(`/api/advisers/${adviser.id}`)).status).toBe(204);
  });

  it("builds a Fact Find summary from the family's own records, with no secret numbers in it", async () => {
    const house = await post("/properties", { name: "1 FactFind St", address: "1 FactFind St", entityId: alex.entityId, currentValue: 800_000 });
    await post("/liabilities", { name: "Home loan", liabilityType: "HOME_LOAN", entityId: alex.entityId, currentBalance: 500_000 });
    await post("/insurance", { kind: "LIFE", insurer: "TAL", policyNumber: "L-000111", coverAmount: 900_000, personId: alex.id, entityId: alex.entityId });
    await post("/identity", { personId: alex.id, kind: "DRIVERS_LICENCE", number: "12345678", issuer: "NSW", expiryDate: d("2028-01-01").toISOString() });
    const account = await post("/banking/accounts", { institution: "Bank", accountName: "Everyday", accountType: "TRANSACTION", accountNumber: "99988877", entityId: alex.entityId, currentBalance: 5_000 });
    await post("/advisers", { kind: "SOLICITOR", firm: "Legal Eagles" });

    const csv = await factFindCsv(alex.entityId);

    // Section headings and the people/records it should cover.
    expect(csv).toContain("PERSONAL & CONTACT DETAILS");
    expect(csv).toContain("Alex FactFind — Phone");
    expect(csv).toContain("0400 000 111");
    expect(csv).toContain("FAMILY");
    expect(csv).toContain("Partner");
    expect(csv).toContain("Sam FactFind");
    expect(csv).toContain("IDENTIFICATION");
    expect(csv).toContain("Driver's licence");
    expect(csv).toContain("ASSETS & LIABILITIES");
    expect(csv).toContain("Total assets");
    expect(csv).toContain("INSURANCE");
    expect(csv).toContain("Life cover");
    expect(csv).toContain("PROFESSIONAL ADVISERS");
    expect(csv).toContain("Legal Eagles");
    expect(csv).toContain("LOAN OBJECTIVES");
    expect(csv).toContain("YOUR FINANCIAL POSITION");

    // No secret values: driver's licence number, policy number, mother's
    // maiden name, or the bank account number.
    expect(csv).not.toContain("12345678");
    expect(csv).not.toContain("L-000111");
    expect(csv).not.toContain("Wentworth");
    expect(csv).not.toContain("Ashworth");
    expect(csv).not.toContain("99988877");

    // The generated pack route offers and includes it.
    const preview = await agent.get(`/api/document-packs/preview?entityId=${alex.entityId}`);
    expect(preview.body.generated.some((g: { key: string }) => g.key === "FACT_FIND")).toBe(true);

    const gen = await agent
      .post("/api/document-packs/generate")
      .send({ entityId: alex.entityId, categories: [], generated: ["FACT_FIND"] })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(gen.status).toBe(200);
    expect((gen.body as Buffer).length).toBeGreaterThan(0);
    void house; void account;
  });
});
