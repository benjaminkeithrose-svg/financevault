import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { PAGE_BREAK, parseGuide, shippedGuides, suggestGuide } from "../src/services/occupationGuides.js";

// The ATO occupation guides as deduction checklists: read from the text the
// downloader saves, shipped with the app, chosen for a person's job, and
// ticked off through the year.

const GUIDE = "https://www.ato.gov.au/x/guides-for-occupations-and-industries/l-q/test-workers-income-and-work-related-deductions";
const text = (updated: string, items: string) =>
  [
    `Occupation guide — Test workers\nSource: ${GUIDE}\nSaved: 2026-09-27\n\nTest workers – income and work-related deductions\n${GUIDE}\n\nTest workers – income and work-related deductions\nLast updated ${updated}\nPrint or Download\nWhat test workers can claim.`,
    `Deductions for work expenses\n${GUIDE}/deductions-for-work-expenses\n\nDeductions for work expenses\nLast updated ${updated}\nPrint or Download\nTo claim a deduction you must meet the 3 golden rules:\nTest worker expenses A–F\nDetails on claiming test worker expenses.\nQC 1`,
    `Test worker expenses A–F\n${GUIDE}/deductions-for-work-expenses/test-worker-expenses-a-f\n\nTest worker expenses A–F\nDetails on claiming test worker expenses.\nLast updated ${updated}\nPrint or Download\n${items}\nTest worker expenses G–O\nTest worker expenses P–S\nQC 1\nPrint or Download`,
  ].join(`\n${PAGE_BREAK}\n`);

const ITEMS = [
  "Annual practising certificate fees",
  "You can claim a deduction for the cost of renewing your annual practising certificate.",
  "You can't claim the cost of your first certificate.",
  "Example: renewing",
  "Ana renews her certificate each year.",
  "End of example",
  "Car expenses",
  "You can&#x27;t claim normal trips between home and work.",
  "You can claim trips between 2 workplaces:",
  "directly between separate jobs on the same day",
  "Child care, school fees and other education expenses",
  "You can’t claim a deduction for child care.",
  "Clothing and uniform expenses (including footwear)",
  "With a few exceptions, clothing can't be claimed.",
  "Compulsory uniforms",
  "You can claim a compulsory uniform.",
  "Protective clothing",
  "You can claim protective clothing.",
  "Education loans",
  "You can't claim repayments of:",
  "Higher Education Loan Program (HELP)",
  "VET Student Loans (VSL)",
  "Student Start-up Loan (SSL).",
  "First aid courses",
  "You can claim a deduction for first aid training if you're the designated first aid person.",
].join("\n");

describe("reading a guide", () => {
  const guide = parseGuide(text("11 May 2026", ITEMS))!;

  it("finds each expense, what can and can't be claimed, and leaves the worked examples out", () => {
    expect(guide).toMatchObject({ key: "test-workers-income-and-work-related-deductions", title: "Test workers", url: GUIDE, updated: "11 May 2026" });
    expect(guide.items.map((i) => i.name)).toEqual([
      "Annual practising certificate fees",
      "Car expenses",
      "Child care, school fees and other education expenses",
      "Clothing and uniform expenses (including footwear)",
      "Compulsory uniforms",
      "Education loans",
      "First aid courses",
    ]);
    const cert = guide.items[0];
    expect(cert).toMatchObject({ key: "annual-practising-certificate-fees", verdict: "CAN", category: "MEMBERSHIPS" });
    expect(cert.cant).toEqual(["You can't claim the cost of your first certificate."]);
    expect(cert.text).not.toMatch(/Ana renews/);
    // Its sub-heading out of alphabetical order joins the item above it; the list of loans stays in its item.
    expect(guide.items[4].text).toMatch(/Protective clothing/);
    expect(guide.items[5].text).toMatch(/VET Student Loans/);
  });

  it("says whether each is generally claimable, and what kind of claim it is", () => {
    const by = Object.fromEntries(guide.items.map((i) => [i.key, i]));
    expect(by["car-expenses"]).toMatchObject({ verdict: "DEPENDS", category: "CAR" });
    expect(by["car-expenses"].cant[0]).toBe("You can't claim normal trips between home and work.");
    expect(by["child-care-school-fees-and-other-education-expenses"].verdict).toBe("CANT");
    expect(by["clothing-and-uniform-expenses"]).toMatchObject({ verdict: "DEPENDS", category: "CLOTHING" });
    expect(by["first-aid-courses"]).toMatchObject({ verdict: "CAN", category: "SELF_EDUCATION" });
  });

  it("suggests the guide for a job title", () => {
    const guides = shippedGuides();
    const key = (title: string) => guides.find((g) => g.title === title)!.key;
    expect(suggestGuide("Registered nurse", guides)).toBe(key("Nurses and midwives"));
    expect(suggestGuide("Primary school teacher", guides)).toBe(key("Teachers and education professionals"));
    expect(suggestGuide("Sales rep", guides)).toBe(key("Sales and marketing managers"));
    expect(suggestGuide("Electrician (tradesperson)", guides)).toBe(key("Tradesperson"));
    expect(suggestGuide("Astronaut", guides)).toBeNull();
    expect(suggestGuide(null, guides)).toBeNull();
  });

  it("ships with the ATO's guides read", () => {
    const guides = shippedGuides();
    expect(guides.length).toBeGreaterThanOrEqual(40);
    const nurses = guides.find((g) => g.title === "Nurses and midwives")!;
    expect(nurses.items.length).toBeGreaterThan(20);
    expect(nurses.items.find((i) => i.key === "laundry-and-maintenance")).toMatchObject({ verdict: "CAN", category: "CLOTHING" });
    expect(nurses.items.every((i) => !/&#x27;/.test(i.text))).toBe(true);
  });
});

describe("a person's checklist, through the app", () => {
  const agent = request.agent(app);
  const nursesKey = () => shippedGuides().find((g) => g.title === "Nurses and midwives")!.key;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "occupation checklist test" })).status).toBe(201);
  });

  it("suggests a guide, then ticks off what's claimed through the year", async () => {
    const person = (await agent.post("/api/people").send({ name: "Checklist Chris", occupation: "Registered nurse" })).body;
    const before = (await agent.get(`/api/payg/people/${person.id}/checklist?fy=2026-27`)).body;
    expect(before).toMatchObject({ guide: null, suggested: nursesKey(), suggestedTitle: "Nurses and midwives" });

    expect((await agent.put(`/api/people/${person.id}`).send({ occupationGuide: nursesKey() })).status).toBe(200);
    expect((await agent.put(`/api/payg/people/${person.id}/checklist/laundry-and-maintenance`).send({ choice: "CLAIM" })).status).toBe(200);
    await agent.put(`/api/payg/people/${person.id}/checklist/union-and-professional-association-fees`).send({ choice: "CLAIM" });
    await agent.put(`/api/payg/people/${person.id}/checklist/agency-commissions-and-agency-fees`).send({ choice: "NOT_FOR_ME" });

    let list = (await agent.get(`/api/payg/people/${person.id}/checklist?fy=2026-27`)).body;
    expect(list.guide).toMatchObject({ title: "Nurses and midwives", source: "SHIPPED" });
    expect(list.summary).toEqual({ claimed: 2, recorded: 0, toRecord: 2, withoutRecord: 0 });
    expect(list.items.find((i: { key: string }) => i.key === "agency-commissions-and-agency-fees").choice).toBe("NOT_FOR_ME");

    const claim = await agent
      .post(`/api/payg/people/${person.id}/deductions`)
      .send({ fyLabel: "2026-27", category: "CLOTHING", description: "Laundry and maintenance", amount: 150, checklistItem: "laundry-and-maintenance" });
    expect(claim.status).toBe(201);
    list = (await agent.get(`/api/payg/people/${person.id}/checklist?fy=2026-27`)).body;
    expect(list.summary).toEqual({ claimed: 2, recorded: 1, toRecord: 1, withoutRecord: 1 });
    expect(list.items.find((i: { key: string }) => i.key === "laundry-and-maintenance")).toMatchObject({ total: 150, claims: [{ amount: 150, hasRecord: false }] });
    // A new year: what's claimed most years is still to record.
    expect((await agent.get(`/api/payg/people/${person.id}/checklist?fy=2027-28`)).body.summary).toMatchObject({ claimed: 2, toRecord: 2 });

    // Undoing a choice.
    await agent.put(`/api/payg/people/${person.id}/checklist/union-and-professional-association-fees`).send({ choice: null });
    expect((await agent.get(`/api/payg/people/${person.id}/checklist?fy=2026-27`)).body.summary.claimed).toBe(1);
    expect((await agent.put(`/api/payg/people/${person.id}/checklist/x`).send({ choice: "MAYBE" })).status).toBe(400);
  });

  it("uses a newer copy from the reference library, and lists new guides found there", async () => {
    const person = (await agent.post("/api/people").send({ name: "Library Lee", occupation: "Nurse" })).body;
    await agent.put(`/api/people/${person.id}`).send({ occupationGuide: nursesKey() });
    const url = `https://www.ato.gov.au/x/l-q/${nursesKey()}`;
    const newJob = "https://www.ato.gov.au/x/a-d/drone-pilots-income-and-work-related-deductions";
    const doc = (url: string, ocrText: string, n: number) => ({
      originalFilename: `Occupation guide — ${n === 1 ? "Nurses and midwives" : "Drone pilots – income and work-related deductions"} — saved 2027-08-01.txt`,
      storedFilename: `lib-${n}.txt`,
      filePath: `missing/lib-${n}.txt`,
      mimeType: "text/plain",
      fileSize: 1,
      fileHash: `occupation-library-${n}-${Date.now()}`,
      documentType: "Tax Reference",
      referenceLinkId: `occupation:test-${n}`,
      sourceUrl: url,
      ocrText,
    });
    const nurses = text("1 August 2027", "Agency commissions and agency fees\nYou can claim a deduction for commissions paid to a nursing agency.").replaceAll(GUIDE, url);
    const saved = await prisma.document.create({ data: doc(url, nurses, 1) });
    const drone = await prisma.document.create({ data: doc(newJob, "", 2) });
    try {
      const list = (await agent.get(`/api/payg/people/${person.id}/checklist?fy=2026-27`)).body;
      expect(list.guide).toMatchObject({ source: "LIBRARY", documentId: saved.id, updated: "1 August 2027" });
      expect(list.items.map((i: { key: string }) => i.key)).toEqual(["agency-commissions-and-agency-fees"]);
      const guides = (await agent.get("/api/payg/guides")).body;
      expect(guides.find((g: { title: string }) => g.title === "Drone pilots")).toMatchObject({ items: 0 });
    } finally {
      await prisma.document.deleteMany({ where: { id: { in: [saved.id, drone.id] } } });
    }
  });
});
