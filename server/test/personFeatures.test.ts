import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { accountantChecklist } from "../src/services/accountantChecklist.js";
import { expectedChecklist } from "../src/services/expected.js";
import { personFeaturesOff } from "../src/services/personFeatures.js";

// Parts of the app switched off for one person (Show on this page): their
// page hides them, and the checklists stop asking about them for that person.

describe("feature switches for one person", () => {
  const agent = request.agent(app);

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "person features test" })).status).toBe(201);
  });

  it("reads only known switches", () => {
    expect([...personFeaturesOff('["payg","nonsense","super"]')]).toEqual(["payg", "super"]);
    expect(personFeaturesOff(null).size).toBe(0);
    expect(personFeaturesOff("not json").size).toBe(0);
  });

  it("stops the checklists asking about what's switched off for them", async () => {
    const created = await agent.post("/api/people").send({ name: "Switch Sam", grossSalary: 50_000, carAllowance: 8_000 });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const groupFor = async () => (await expectedChecklist()).groups.find((g) => g.target === `person:${id}`);
    const labels = async () => (await groupFor())?.items.map((i) => i.label) ?? [];
    const ids = async () => (await accountantChecklist(new Date("2026-09-28T00:00:00Z"))).map((i) => i.id);

    expect(await labels()).toEqual(expect.arrayContaining(["Life and TPD cover", "Income protection"]));
    expect(await ids()).toEqual(expect.arrayContaining([`car-allowance-${id}`, `co-contribution-${id}`]));

    const put = await agent.put(`/api/people/${id}`).send({ featuresOff: ["insurance", "payg", "super"] });
    expect(put.status).toBe(200);
    expect(JSON.parse(put.body.featuresOff)).toEqual(["insurance", "payg", "super"]);

    expect(await labels()).not.toEqual(expect.arrayContaining(["Life and TPD cover"]));
    expect(await labels()).not.toContain("Income protection");
    // The income statement is still expected: they're still paid.
    expect(await labels()).toContain("Income statement (from myGov)");
    const after = await ids();
    expect(after).not.toContain(`car-allowance-${id}`);
    expect(after).not.toContain(`co-contribution-${id}`);

    // Back on: asked again.
    await agent.put(`/api/people/${id}`).send({ featuresOff: [] });
    expect((await prisma.person.findUnique({ where: { id } }))!.featuresOff).toBeNull();
    expect(await labels()).toContain("Income protection");

    // Only known sections.
    expect((await agent.put(`/api/people/${id}`).send({ featuresOff: ["everything"] })).status).toBe(400);
  });
});
