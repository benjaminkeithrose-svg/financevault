import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma, prismaAll } from "../src/db.js";

// Due diligence on a property being considered: checks picked by the kind of
// property and title; state, evidence and due dates; problems found (open
// ones cost money in the assessment's cash needed); your own checks, issues
// on their own, and development ideas that are never "approved" until an
// approval document is linked.

describe("due diligence", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put" | "delete", path: string, body: unknown = {}, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  let entityId = "";
  const keys = (dd: { groups: Array<{ checks: Array<{ key: string }> }> }) => dd.groups.flatMap((g) => g.checks.map((c) => c.key));

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "due diligence test" })).status).toBe(201);
    entityId = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Diligent Di", grossSalary: 110_000 })).id}`)).body.entityId;
  });

  it("picks the checks for the kind of property and its title", async () => {
    const unit = await send("post", "/considering", { kind: "RESIDENTIAL", address: "4/10 Strata St, Wagga Wagga NSW 2650", askingPrice: 420_000, entityId });
    await send("put", `/properties/${unit.id}`, { kind: "UNIT" });
    let dd = (await agent.get(`/api/considering/${unit.assetId}/checks`)).body;
    expect(keys(dd)).toContain("r.strata-levies");
    expect(keys(dd)).not.toContain("r.community-levies");
    expect(keys(dd)).not.toContain("r.retaining");

    await send("put", `/properties/${unit.id}`, { kind: "TOWNHOUSE", titleType: "COMMUNITY" });
    dd = (await agent.get(`/api/considering/${unit.assetId}/checks`)).body;
    expect(keys(dd)).toContain("r.community-levies");
    expect(keys(dd)).not.toContain("r.strata-levies");

    await send("put", `/properties/${unit.id}`, { kind: "LAND", titleType: "TORRENS" });
    dd = (await agent.get(`/api/considering/${unit.assetId}/checks`)).body;
    expect(keys(dd)).not.toContain("r.building");
    expect(keys(dd)).toContain("r.zoning");

    const shop = await send("post", "/considering", { kind: "COMMERCIAL", address: "7 Market St, Wagga Wagga NSW 2650", askingPrice: 900_000, entityId });
    dd = (await agent.get(`/api/considering/${shop.assetId}/checks`)).body;
    expect(dd.groups.map((g: { name: string }) => g.name)).toEqual(
      expect.arrayContaining(["Legal, title and planning", "Building", "Leases and tenants", "Environmental and safety"])
    );
  });

  it("keeps each check's state, due date and problems, and counts open problems in cash needed", async () => {
    const house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "12 Check Rd, Bathurst NSW 2795", askingPrice: 600_000, entityId });
    await send("put", `/considering/${house.assetId}/assessment`, { lvrPercent: 80 });
    const cashBefore = (await agent.get(`/api/considering/${house.assetId}/assessment`)).body.purchase.cashNeeded;

    let dd = await send("put", `/considering/${house.assetId}/checks/r.building`, {
      status: "DONE",
      findings: "Roof sheeting rusted through on the back verandah",
      cost: 8_000,
      who: "Inspector",
      checked: true,
      problem: true,
    });
    const check = dd.groups.flatMap((g: { checks: unknown[] }) => g.checks).find((c: { key: string }) => c.key === "r.building");
    expect(check).toMatchObject({ status: "DONE", cost: 8_000, checked: true, problem: true });
    expect(dd.openIssues.map((c: { key: string }) => c.key)).toEqual(["r.building"]);
    expect(dd.openIssueCosts).toBe(8_000);
    expect((await agent.get(`/api/considering/${house.assetId}/assessment`)).body.purchase).toMatchObject({ openIssueCosts: 8_000, cashNeeded: cashBefore + 8_000 });

    // An issue on its own.
    dd = await send("post", `/considering/${house.assetId}/checks`, { kind: "ISSUE", label: "Neighbour's tree over the boundary", cost: 1_500 });
    expect(dd.openIssueCosts).toBe(9_500);

    // Resolved: kept, no longer counted.
    dd = await send("put", `/considering/${house.assetId}/checks/r.building`, { resolved: true, resolution: "Vendor replaced the sheeting before exchange" });
    expect(dd.openIssueCosts).toBe(1_500);
    expect(dd.resolvedIssues[0]).toMatchObject({ key: "r.building", resolution: "Vendor replaced the sheeting before exchange" });

    // A due date is a calendar reminder about the property; done with the check, done with the reminder.
    await send("put", `/considering/${house.assetId}/checks/r.pest`, { dueDate: "2026-10-15T00:00:00.000Z" });
    const row = await prismaAll.dueDiligenceCheck.findUnique({ where: { assetId_key: { assetId: house.assetId, key: "r.pest" } } });
    const reminder = await prisma.reminder.findUnique({ where: { id: row!.reminderId! } });
    expect(reminder).toMatchObject({ title: "Due diligence: Pest (termite) inspection", targetType: "PROPERTY", targetId: house.id });
    await send("put", `/considering/${house.assetId}/checks/r.pest`, { status: "DONE" });
    expect((await prisma.reminder.findUnique({ where: { id: row!.reminderId! } }))?.completedAt).not.toBeNull();

    // Group counts: done and not-applicable both count as dealt with.
    await send("put", `/considering/${house.assetId}/checks/r.pool`, { status: "NA" });
    dd = (await agent.get(`/api/considering/${house.assetId}/checks`)).body;
    expect(dd.groups.find((g: { name: string }) => g.name === "Building and condition").done).toBe(3);
  });

  it("adds your own checks, and development ideas that aren't approved without an approval document", async () => {
    const house = await send("post", "/considering", { kind: "RESIDENTIAL", address: "3 Own Way, Orange NSW 2800", askingPrice: 700_000, entityId });
    let dd = await send("post", `/considering/${house.assetId}/checks`, { kind: "CHECK", label: "Ask the neighbours about noise", group: "Title and planning" });
    const own = dd.groups.find((g: { name: string }) => g.name === "Title and planning").checks.find((c: { own: boolean }) => c.own);
    expect(own.label).toBe("Ask the neighbours about noise");
    expect((await agent.delete(`/api/considering/${house.assetId}/checks/r.title`)).status).toBe(400);
    await send("delete", `/considering/${house.assetId}/checks/${own.key}`);

    dd = await send("post", `/considering/${house.assetId}/checks`, { kind: "DEVELOPMENT", label: "Granny flat out the back" });
    const idea = dd.development[0];
    expect(idea.approved).toBe(false);
    // Ticked as approved but no document: still not approved.
    dd = await send("put", `/considering/${house.assetId}/checks/${idea.key}`, { checked: true });
    expect(dd.development[0].approved).toBe(false);
    // The approval, linked as evidence (it also files under the property).
    const doc = await prisma.document.create({
      data: { originalFilename: "cdc-approval.pdf", storedFilename: "cdc.pdf", filePath: "/nowhere/cdc.pdf", mimeType: "application/pdf", fileSize: 1, fileHash: `dd-${Date.now()}` },
    });
    expect((await agent.post(`/api/documents/${doc.id}/links`).send({ targetType: "DD_CHECK", targetId: dd.development[0].id })).status).toBe(201);
    expect(await prisma.documentLink.count({ where: { documentId: doc.id, targetType: "PROPERTY", targetId: house.id } })).toBe(1);
    dd = (await agent.get(`/api/considering/${house.assetId}/checks`)).body;
    expect(dd.development[0]).toMatchObject({ approved: true, evidence: 1 });
  });
});
