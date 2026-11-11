import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Deleting a property with items recorded under it used to turn the items
// into separate assets without saying so. Now it's refused, like other assets.

describe("deleting a property", () => {
  const agent = request.agent(app);
  async function post(p: string, body: unknown) {
    const res = await agent.post(`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "tidy up test passcode" })).status).toBe(201);
  });

  it("is refused while items are recorded under it, and allowed once they're gone", async () => {
    const created = await post("/people", { name: "Terry Tidy" });
    const terry = (await agent.get(`/api/people/${created.id}`)).body;
    const home = await post("/properties", { name: "3 Neat St", address: "3 Neat St, Sydney NSW", entityId: terry.entityId, currentValue: 900_000 });
    const solar = await post("/assets", { name: "Solar panels", assetType: "EQUIPMENT", entityId: terry.entityId, parentAssetId: home.assetId, itemCategory: "SOLAR" });

    const refused = await agent.delete(`/api/properties/${home.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/item recorded under it/);

    await agent.delete(`/api/assets/${solar.id}`).expect(204);
    await agent.delete(`/api/properties/${home.id}`).expect(204);
    expect(await prisma.asset.findUnique({ where: { id: home.assetId } })).toBeNull();
  });
});
