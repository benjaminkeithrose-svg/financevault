import request from "supertest";
import yauzl from "yauzl";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// The four packs for professionals on a property you're considering: a
// summary made from what's recorded, your questions, and a ZIP with the
// documents you choose — never identity documents or secrets.

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

describe("professional packs", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let entityId = "";
  let personId = "";
  let unit = { id: "", assetId: "" };
  const docs = { contract: "", strata: "", licence: "" };

  const upload = async (name: string, text: string) =>
    (await agent.post("/api/documents/upload").attach("file", Buffer.from(text), { filename: name, contentType: "text/plain" })).body
      .document.id as string;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "professional packs test" })).status).toBe(201);
    const person = await send("post", "/people", { name: "Packer Pat", grossSalary: 140_000 });
    personId = person.id;
    entityId = (await agent.get(`/api/people/${person.id}`)).body.entityId;
    await send("put", `/people/${person.id}`, { tfn: "123 456 782" });

    unit = await send("post", "/considering", {
      kind: "RESIDENTIAL",
      address: "4/20 Pack St, Wagga Wagga NSW 2650",
      askingPrice: 480_000,
      entityId,
    });
    await send("put", `/properties/${unit.id}`, {
      weeklyRent: 470,
      councilRates: 1_600,
      strataLevies: 3_200,
      kind: "UNIT",
      titleType: "STRATA",
    });
    await send("put", `/considering/${unit.assetId}/assessment`, { lvrPercent: 80, expectedRatePercent: 6.2 });
    await send("put", `/considering/${unit.assetId}/checks/r.strata-special`, {
      status: "DONE",
      problem: true,
      cost: 12_000,
      findings: "Special levy for the lifts",
    });
    await send("put", `/considering/${unit.assetId}/checks/r.title`, { status: "DONE", checked: true, findings: "Clear title" });

    docs.contract = await upload("contract.txt", "Contract for sale of land");
    docs.strata = await upload("strata-report.txt", "Strata inspection report");
    docs.licence = await upload("licence.txt", "Driver licence scan");
    for (const id of Object.values(docs)) await send("post", `/documents/${id}/links`, { targetType: "PROPERTY", targetId: unit.id });
    const id = await send("post", "/identity", { personId, kind: "DRIVERS_LICENCE", number: "99887766", issuer: "NSW" });
    await send("post", `/documents/${docs.licence}/links`, { targetType: "IDENTITY_RECORD", targetId: id.id });
  });

  it("makes each pack from what's recorded, with your questions", async () => {
    for (const type of ["broker", "accountant", "solicitor", "due-diligence"]) {
      const pack = (await agent.get(`/api/considering/${unit.assetId}/packs/${type}`)).body;
      expect(pack.title).toContain("4/20 Pack St");
      expect(pack.disclaimer).toMatch(/not advice/);
      expect(pack.sections[0].title).toBe("The property");
      // Identity documents are never offered.
      expect(pack.documents.map((d: { id: string }) => d.id).sort()).toEqual([docs.contract, docs.strata].sort());
      expect(pack.documents[0].filePath).toBeUndefined();
      const titles = pack.sections.map((s: { title: string }) => s.title);
      expect(titles).toContain("Problems found");
      if (type === "broker")
        expect(titles).toEqual(expect.arrayContaining(["Buying it", "Equity in what they own", "Can we borrow it? (the app's estimate)"]));
      if (type === "accountant") expect(titles).toContain("Tax");
      if (type === "solicitor") expect(titles).toContain("Title, planning and contract checks");
      if (type === "due-diligence") expect(titles.some((t: string) => t.startsWith("Strata — "))).toBe(true);
    }
    const buying = (await agent.get(`/api/considering/${unit.assetId}/packs/broker`)).body.sections.find(
      (s: { title: string }) => s.title === "Buying it",
    );
    expect(buying.rows).toContainEqual(["Costs of problems found", "$12,000"]);

    await send("put", `/considering/${unit.assetId}/packs/broker/questions`, { questions: "Can we use the offset?\nFixed or variable?" });
    const broker = (await agent.get(`/api/considering/${unit.assetId}/packs/broker`)).body;
    expect(broker.questions).toBe("Can we use the offset?\nFixed or variable?");
    expect(broker.sections.at(-1)).toEqual({ title: "Questions for the broker", lines: ["Can we use the offset?", "Fixed or variable?"] });
    // Each pack keeps its own questions.
    expect((await agent.get(`/api/considering/${unit.assetId}/packs/accountant`)).body.questions).toBe("");
    // Questions aren't checks.
    const dd = (await agent.get(`/api/considering/${unit.assetId}/checks`)).body;
    expect(JSON.stringify(dd)).not.toContain("offset");

    expect((await agent.get(`/api/considering/${unit.assetId}/packs/nonsense`)).status).toBe(404);
  });

  it("zips the summary with only the chosen documents, never identity documents or secrets", async () => {
    const res = await agent
      .get(`/api/considering/${unit.assetId}/packs/solicitor/zip?docs=${docs.contract},${docs.licence}`)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const zip = await readZip(res.body);
    expect([...zip.keys()].sort()).toEqual(["00 Summary.html", "document_index.csv", "documents/contract.txt"]);
    expect(zip.get("documents/contract.txt")).toBe("Contract for sale of land");
    const summary = zip.get("00 Summary.html")!;
    expect(summary).toContain("Solicitor or conveyancer pack");
    expect(summary).toContain("not advice");
    expect(summary).toContain("contract.txt");
    expect(summary).not.toContain("licence");
    for (const secret of ["123 456 782", "123456782", "99887766"]) expect([...zip.values()].join("\n")).not.toContain(secret);

    // Audit log notes the pack, not what's in it.
    const audit = await prisma.auditLog.findFirst({ where: { action: "PROFESSIONAL_PACK" }, orderBy: { timestamp: "desc" } });
    expect(audit?.targetId).toBe(unit.assetId);
    expect(audit?.details).not.toContain("contract");
  });

  it("is only for properties you're considering", async () => {
    const owned = await send("post", "/properties", {
      name: "Mine",
      entityId,
      address: "1 Already Mine Rd, Wagga Wagga NSW 2650",
      currentValue: 600_000,
    });
    expect((await agent.get(`/api/considering/${owned.assetId}/packs/broker`)).status).toBe(404);
  });
});
