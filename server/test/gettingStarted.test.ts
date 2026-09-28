import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Getting started: steps in the order records are built up, ticking
// themselves off; Loans and Reports appear once there's something for them;
// steps can be skipped (and un-skipped); "What do you have?" is answered once.

describe("getting started", () => {
  const agent = request.agent(app);
  const steps = async () => (await agent.get("/api/dashboard")).body.gettingStarted;
  const step = (gs: { steps: Array<{ key: string }> }, key: string) =>
    gs.steps.find((s) => s.key === key) as Record<string, unknown> | undefined;
  let featuresBefore: string[] = [];

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "getting started test" })).status).toBe(201);
    featuresBefore = (await agent.get("/api/settings")).body.featuresOff;
    await agent.put("/api/settings").send({ checklistDismissed: false, setupHaveDone: false, setupSkipped: [] });
  });

  afterAll(async () => {
    await agent.put("/api/settings").send({ featuresOff: featuresBefore, setupSkipped: [] });
  });

  it("walks through the steps, skipping and answering What do you have?", async () => {
    let gs = await steps();
    expect(gs.steps.map((s: { key: string }) => s.key)[0]).toBe("have");
    expect(step(gs, "have")?.done).toBe(false);

    // Answered: the features chosen are saved and the step is done.
    const settings = (await agent.put("/api/settings").send({ featuresOff: ["vehicles", "smsf"], setupHaveDone: true })).body;
    expect(settings.featuresOff).toEqual(["vehicles", "smsf"]);
    gs = await steps();
    expect(step(gs, "have")?.done).toBe(true);
    // Switched-off kinds aren't offered under "Add what they own".
    const own = step(gs, "own") as { buttons: Array<{ label: string }> };
    expect(own.buttons.map((b) => b.label)).not.toContain("Vehicle or boat");
    expect(own.buttons.map((b) => b.label)).toContain("Bank account");

    // Skipping, and taking it back.
    await agent.put("/api/settings").send({ setupSkipped: ["papers"] });
    // (Only counts as skipped while not done — other test files may have added documents.)
    gs = await steps();
    expect(step(gs, "papers")?.skipped).toBe(!step(gs, "papers")?.done);
    expect((await agent.get("/api/settings")).body.setupSkipped).toEqual(["papers"]);
    await agent.put("/api/settings").send({ setupSkipped: [] });
    expect(step(await steps(), "papers")?.skipped).toBe(false);
    expect((await agent.put("/api/settings").send({ setupSkipped: ["Not A Key!"] })).status).toBe(400);
  });

  it("brings in Loans once there's a property, and Reports once there are assets and loans", async () => {
    const owner = (await agent.get(`/api/people/${(await agent.post("/api/people").send({ name: "Setup Sam" })).body.id}`)).body;
    await agent
      .post("/api/properties")
      .send({ name: "Setup House", address: "1 Setup St, Orange NSW", state: "NSW", entityId: owner.entityId, use: "HOME" });
    let gs = await steps();
    expect(step(gs, "loans")).toBeDefined();
    await agent
      .post("/api/liabilities")
      .send({ name: "Setup loan", liabilityType: "HOME_LOAN", entityId: owner.entityId, currentBalance: 100_000 });
    gs = await steps();
    expect(step(gs, "reports")).toMatchObject({ done: false, skipped: false });
    // Looking at the reports counts as done with it.
    await agent.put("/api/settings").send({ setupSkipped: ["reports"] });
    expect(step(await steps(), "reports")?.skipped).toBe(true);
  });
});
