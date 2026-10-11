import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { nextDue } from "../src/services/reminders.js";

// The in-app calendar: the person's own reminders and the dates the app
// works out, each a task that stays until it's marked complete.

describe("repeats", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const iso = (x: Date | null) => x?.toISOString().slice(0, 10);
  it("moves on by the repeat, keeping month-ends", () => {
    expect(iso(nextDue(d("2026-01-31"), "MONTHLY"))).toBe("2026-02-28");
    expect(iso(nextDue(d("2026-11-30"), "QUARTERLY"))).toBe("2027-02-28");
    expect(iso(nextDue(d("2028-02-29"), "YEARLY"))).toBe("2029-02-28");
    expect(iso(nextDue(d("2026-10-01"), "WEEKLY"))).toBe("2026-10-08");
    expect(nextDue(d("2026-10-01"), "NONE")).toBeNull();
  });
});

describe("through the app", () => {
  const agent = request.agent(app);
  async function send(p: string, body: unknown, method: "post" | "put" = "post") {
    const res = await agent[method](`/api${p}`).send(body as object);
    if (res.status >= 300) throw new Error(`${p} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  type Task = { key: string; title: string; date: string; done: boolean; reminderId: string | null; canRollForward: boolean };
  const tasks = async (from: string, to: string): Promise<Task[]> => (await agent.get(`/api/calendar/tasks?from=${from}&to=${to}`)).body;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "reminders test passcode" })).status).toBe(201);
  });

  it("keeps a reminder about a vehicle, with its form attached, until it's done — and brings back a yearly one", async () => {
    const owner = (await agent.get(`/api/people/${(await send("/people", { name: "Reminder Rita" })).id}`)).body;
    const ute = await send("/assets", { name: "Rita's Ranger", assetType: "VEHICLE", vehicleType: "CAR", entityId: owner.entityId });
    const r = await send("/reminders", { title: "Yearly service", dueDate: "2026-11-15", repeat: "YEARLY", targetType: "ASSET", targetId: ute.id });
    expect(r.target).toEqual({ name: "Rita's Ranger", route: `/assets/${ute.id}` });

    // The form attached to the reminder files under the ute as well.
    const doc = (await agent.post("/api/documents/upload").attach("file", Buffer.from("Service booking form for the Ranger, reminders test"), { filename: "service-form.txt", contentType: "text/plain" })).body.document;
    await send(`/documents/${doc.id}/links`, { targetType: "REMINDER", targetId: r.id });
    const onUte = (await agent.get(`/api/documents/by-target?targetType=ASSET&targetId=${ute.id}`)).body;
    expect(onUte.map((l: { documentId: string }) => l.documentId)).toContain(doc.id);
    expect((await agent.get(`/api/reminders/${r.id}`)).body.fileCount).toBe(1);

    // On the ute's page, and in the calendar.
    const forUte = (await agent.get(`/api/reminders?targetType=ASSET&targetId=${ute.id}&open=1`)).body;
    expect(forUte.map((x: { id: string }) => x.id)).toEqual([r.id]);
    const inCalendar = (await tasks("2026-11-01", "2026-11-30")).find((t) => t.reminderId === r.id)!;
    expect(inCalendar).toMatchObject({ title: "Yearly service — Rita's Ranger", date: "2026-11-15", done: false });

    // Still there, overdue, when looking at a later month — until it's done.
    expect((await tasks("2027-01-01", "2027-01-31")).some((t) => t.reminderId === r.id)).toBe(true);
    const { next } = await send(`/reminders/${r.id}/complete`, { note: "Done at Ford, $420" });
    expect(next.dueDate.slice(0, 10)).toBe("2027-11-15");
    expect((await tasks("2027-01-01", "2027-01-31")).some((t) => t.reminderId === r.id)).toBe(false);
    expect((await tasks("2026-11-01", "2026-11-30")).find((t) => t.reminderId === r.id)?.done).toBe(true);

    // Reopened: back on the list, and the repeat it made is taken away.
    await send(`/reminders/${r.id}/reopen`, {});
    expect(await prisma.reminder.findUnique({ where: { id: next.id } })).toBeNull();

    // Deleted: the attached form stays in Documents, still under the ute.
    expect((await agent.delete(`/api/reminders/${r.id}`)).status).toBe(204);
    expect(await prisma.documentLink.count({ where: { targetType: "REMINDER", targetId: r.id } })).toBe(0);
    expect(await prisma.documentLink.count({ where: { documentId: doc.id, targetType: "ASSET" } })).toBe(1);
  });

  it("marks a policy renewal done and moves it on a year; the calendar file leaves done ones out", async () => {
    const owner = (await agent.get(`/api/people/${(await send("/people", { name: "Renewal Ron" })).id}`)).body;
    const car = await send("/assets", { name: "Ron's Camry", assetType: "VEHICLE", vehicleType: "CAR", entityId: owner.entityId });
    const policy = await send("/insurance", { kind: "MOTOR", insurer: "Renewal Mutual", assetId: car.id, renewalDate: "2026-12-01T00:00:00.000Z" });
    const key = `policy-${policy.id}@2026-12-01`;
    const renewal = (await tasks("2026-12-01", "2026-12-31")).find((t) => t.key === key)!;
    expect(renewal).toMatchObject({ done: false, canRollForward: true });

    const done = await send("/calendar/complete", { key, rollForward: true, note: "Renewed online" });
    expect(done.movedTo).toBe("2027-12-01");
    const next = (await tasks("2027-12-01", "2027-12-31")).find((t) => t.key === `policy-${policy.id}@2027-12-01`)!;
    expect(next.done).toBe(false);

    // Undone: the completion goes (the date stays moved — that's on the policy now).
    await send("/calendar/reopen", { key });
    expect(await prisma.calendarCompletion.count({ where: { eventKey: key } })).toBe(0);

    // A date the app works out can't be moved on unless it's a renewal it knows how to move.
    const bad = await agent.post("/api/calendar/complete").send({ key: "estate-review-x@2026-01-01", rollForward: true });
    expect(bad.status).toBe(400);

    // The calendar file: open reminders in, done ones out.
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const open = await send("/reminders", { title: "Send the accountant the rental statements", dueDate: soon });
    const closed = await send("/reminders", { title: "Already lodged the BAS", dueDate: soon });
    await send(`/reminders/${closed.id}/complete`, {});
    const ics = (await agent.get("/api/calendar/expiries.ics")).text;
    expect(ics).toContain(`UID:reminder-${open.id}@financial-vault.local`);
    expect(ics).not.toContain(`reminder-${closed.id}`);
  });

  it("won't take a reminder without a title or a proper date", async () => {
    expect((await agent.post("/api/reminders").send({ title: " ", dueDate: "2026-10-01" })).status).toBe(400);
    expect((await agent.post("/api/reminders").send({ title: "Something", dueDate: "soon" })).status).toBe(400);
  });
});
