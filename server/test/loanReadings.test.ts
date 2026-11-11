import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Reading a loan statement into the loan: propose, apply what's ticked, keep
// the history for the graphs — and never let an older statement wind the
// loan's figures back.

describe("loan statements and rate history", () => {
  const agent = request.agent(app);
  const send = async (method: "post" | "put", path: string, body: unknown, status = method === "post" ? 201 : 200) => {
    const res = await agent[method](`/api${path}`).send(body as object);
    if (res.status !== status) throw new Error(`${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const upload = async (text: string, filename: string, contentType = "text/plain") =>
    (await agent.post("/api/documents/upload").attach("file", Buffer.from(text), { filename, contentType })).body.document;

  beforeAll(async () => {
    await prisma.vault.deleteMany();
    expect((await agent.post("/api/vault/setup").send({ passcode: "loan readings test" })).status).toBe(201);
  });

  it("reads a statement, applies what's ticked, and keeps the history", async () => {
    const owner = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Rate Ruth" })).id}`)).body;
    const loan = await send("post", "/liabilities", { name: "Ruth home loan", liabilityType: "HOME_LOAN", entityId: owner.entityId, currentBalance: 420_000, interestRate: 6.39 });
    // Created with figures: a first point, and the balance's date.
    expect((await prisma.liability.findUnique({ where: { id: loan.id } }))!.balanceAsAt).not.toBeNull();

    const doc = await upload(
      `Home Loan Statement\nStatement period 01/01/2026 to 30/06/2026\nClosing balance $405,221.84 DR\nYour current interest rate 6.14% p.a.\nMinimum monthly repayment $2,745.00\nInterest rate changed from 6.39% to 6.14% on 18 Feb 2026\nruth-1`,
      "ruth-statement.txt"
    );
    const proposal = await send("post", `/liabilities/${loan.id}/statements/read`, { documentId: doc.id }, 200);
    expect(proposal.kind).toBe("STATEMENT");
    expect(proposal.statement).toMatchObject({ balance: 405_221.84, interestRate: 6.14, repayment: 2_745 });
    expect(proposal.current).toMatchObject({ balance: 420_000, interestRate: 6.39 });

    // The statement's date is later than the balance typed in today? No — it's June 2026, before today's date in the test run,
    // so pretend the loan's balance is older.
    await prisma.liability.update({ where: { id: loan.id }, data: { balanceAsAt: new Date("2025-12-31T00:00:00Z") } });
    const applied = await send(
      "post",
      `/liabilities/${loan.id}/statements/apply`,
      {
        documentId: doc.id,
        balance: { value: 405_221.84, asAt: "2026-06-30" },
        interestRate: { value: 6.14, asAt: "2026-06-30" },
        repayment: { value: 2_745, frequency: "MONTHLY" },
        rateChanges: [{ date: "2026-02-18", rate: 6.14 }],
        interestYears: [],
      },
      200
    );
    expect(applied.changed).toEqual(["balance", "interest rate", "repayment"]);
    const after = (await prisma.liability.findUnique({ where: { id: loan.id } }))!;
    expect(after).toMatchObject({ currentBalance: 405_221.84, interestRate: 6.14, repaymentAmount: 2_745 });
    expect(after.balanceAsAt!.toISOString().slice(0, 10)).toBe("2026-06-30");

    // Filed with the loan.
    const links = (await agent.get(`/api/documents/by-target?targetType=LIABILITY&targetId=${loan.id}`)).body;
    expect(links.map((l: { document: { id: string } }) => l.document.id)).toContain(doc.id);

    // An older statement: history only.
    const old = await upload(`Statement period 01/07/2024 to 31/12/2024\nClosing balance $431,000.00\nInterest rate 6.59%\nruth-2`, "ruth-old.txt");
    const older = await send("post", `/liabilities/${loan.id}/statements/apply`, { documentId: old.id, balance: { value: 431_000, asAt: "2024-12-31" }, interestRate: { value: 6.59, asAt: "2024-12-31" } }, 200);
    expect(older).toMatchObject({ changed: [], olderThanRecorded: true });
    expect((await prisma.liability.findUnique({ where: { id: loan.id } }))!.interestRate).toBe(6.14);

    // A rate remembered from before, and a change made on the page.
    await send("post", `/liabilities/${loan.id}/readings`, { asAt: "2023-05-01", interestRate: 5.89 });
    await send("put", `/liabilities/${loan.id}`, { interestRate: 5.99 });

    const history = (await agent.get(`/api/liabilities/${loan.id}/readings`)).body;
    const rates = history.readings.filter((r: { interestRate: number | null }) => r.interestRate != null).map((r: { asAt: string; interestRate: number; source: string }) => [r.asAt.slice(0, 10), r.interestRate, r.source]);
    expect(rates.slice(0, 4)).toEqual([
      ["2023-05-01", 5.89, "RECORDED"],
      ["2024-12-31", 6.59, "STATEMENT"],
      ["2026-02-18", 6.14, "RATE_CHANGE"],
      ["2026-06-30", 6.14, "STATEMENT"],
    ]);
    expect(rates.map((r: unknown[]) => r[2])).toContain("EDITED");
    expect(history.current.interestRate).toBe(5.99);

    // A point can be removed.
    const first = history.readings[0];
    expect((await agent.delete(`/api/liabilities/readings/${first.id}`)).status).toBe(204);
  });

  it("takes a year's interest from a CSV, filed as the proof", async () => {
    const owner = (await agent.get(`/api/people/${(await send("post", "/people", { name: "Csv Carl" })).id}`)).body;
    const loan = await send("post", "/liabilities", { name: "Carl investment loan", liabilityType: "INVESTMENT_LOAN", entityId: owner.entityId });
    const months = ["2025-07-31", "2025-08-31", "2025-09-30", "2025-10-31", "2025-11-30", "2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];
    const csv = ["Date,Description,Debit,Credit,Balance", ...months.map((m) => `${m.split("-").reverse().join("/")},Interest charged,1500.00,,-300000.00`)].join("\n");
    const doc = await upload(csv, "carl-loan.csv", "text/csv");
    const proposal = await send("post", `/liabilities/${loan.id}/statements/read`, { documentId: doc.id }, 200);
    expect(proposal.kind).toBe("CSV");
    expect(proposal.csv.interestByYear).toEqual([{ fyLabel: "2025-26", interest: 18_000, complete: true }]);
    await send("post", `/liabilities/${loan.id}/statements/apply`, { documentId: doc.id, interestYears: [{ fyLabel: "2025-26", interest: 18_000 }] }, 200);
    const year = await prisma.loanInterestYear.findUnique({ where: { liabilityId_fyLabel: { liabilityId: loan.id, fyLabel: "2025-26" } } });
    expect(year).toMatchObject({ interestCharged: 18_000, documentId: doc.id });
  });

  it("shares a statement's layout with every figure, name and address blanked out", async () => {
    await send("post", "/people", { name: "Layla Quokka" });
    const doc = await upload(
      "Westpac Home Loan Statement\nMrs Layla Quokka\n12 Wattle Street Orange NSW 2800\nlayla@example.com\nAccount 032-123 4567 8901\nClosing balance $405,221.84\nInterest rate 6.14% p.a.\nlayout-1",
      "layla.txt"
    );
    const r = (await agent.get(`/api/documents/${doc.id}/layout`)).body;
    expect(r.filename).toBe("layout-layla.txt");
    const body = r.text.split("----\n")[1];
    expect(body).toContain("Westpac Home Loan Statement");
    expect(body).toContain("Closing balance $000,000.00");
    expect(body).toContain("Interest rate 0.00% p.a.");
    expect(body).not.toMatch(/Layla|Quokka|Wattle|example\.com|[1-9]/);
    expect(r.text).toMatch(/found: balance, interest rate/);
  });
});
