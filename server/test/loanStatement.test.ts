import { describe, expect, it } from "vitest";
import { readLoanCsv, readLoanStatement } from "../src/services/loanStatement.js";

// Made-up statements in the wording Australian lenders use (as the app reads
// the text out of a PDF: one line per printed line, spacing uneven).

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("reading a loan statement", () => {
  it("a CommBank-style home loan statement", () => {
    const r = readLoanStatement(`
      Home Loan Statement
      Statement period 01/01/2026 to 30/06/2026
      Account number 1234 5678
      Opening balance $412,550.10 DR
      Closing balance $405,221.84 DR
      Interest charged $12,301.77
      Your current interest rate 6.14% p.a. Variable
      Minimum monthly repayment $2,745.00
      Interest rate changed from 6.39% to 6.14% on 18 Feb 2026
    `);
    expect(r).toMatchObject({
      periodStart: d("2026-01-01"),
      periodEnd: d("2026-06-30"),
      asAt: d("2026-06-30"),
      balance: 405_221.84,
      interestRate: 6.14,
      repayment: 2_745,
      repaymentFrequency: "MONTHLY",
      interestCharged: 12_301.77,
      rateChanges: [{ date: d("2026-02-18"), rate: 6.14 }],
    });
    expect(r.financialYear).toBeNull(); // half a year only
  });

  it("an end-of-year interest statement (for tax)", () => {
    const r = readLoanStatement(`
      Westpac
      Home loan interest statement
      For the period 1 July 2024 to 30 June 2025
      Loan balance as at 30 June 2025   $388,004.12
      Interest charged 2024/25   $24,880.45
      Interest rate 6.29%
    `);
    expect(r.periodStart).toEqual(d("2024-07-01"));
    expect(r.asAt).toEqual(d("2025-06-30"));
    expect(r.balance).toBe(388_004.12);
    expect(r.financialYear).toEqual({ fyLabel: "2024-25", interest: 24_880.45 });
    expect(r.interestRate).toBe(6.29);
  });

  it("a whole July-to-June statement's interest counts as the year's", () => {
    const r = readLoanStatement(`
      NAB Investment Loan
      Statement Period: 01-Jul-2025 - 30-Jun-2026
      Closing Balance
      -$601,300.00
      Total interest debited $38,410.02
      Interest rate 6.49 % p.a.
      Repayment amount (fortnightly) $1,650.00
    `);
    expect(r.balance).toBe(601_300);
    expect(r.financialYear).toEqual({ fyLabel: "2025-26", interest: 38_410.02 });
    expect(r.repaymentFrequency).toBe("FORTNIGHTLY");
    expect(r.repayment).toBe(1_650);
  });

  it("rate changes listed as their own lines", () => {
    const r = readLoanStatement(`
      ING Orange Advantage
      Statement period 1 Oct 2025 to 31 Mar 2026
      12 Nov 2025  Interest rate change  6.24%
      20 Feb 2026  Interest rate change  5.99%
      Balance at 31 Mar 2026  $299,100.55
    `);
    expect(r.rateChanges).toEqual([
      { date: d("2025-11-12"), rate: 6.24 },
      { date: d("2026-02-20"), rate: 5.99 },
    ]);
    expect(r.interestRate).toBe(5.99);
    expect(r.asAt).toEqual(d("2026-03-31"));
    expect(r.balance).toBe(299_100.55);
  });

  it("says what it couldn't find", () => {
    const r = readLoanStatement("A letter about something else entirely, dated 3 March 2026.");
    expect(r.found).toEqual([]);
    expect(r.balance).toBeNull();
    expect(r.interestRate).toBeNull();
  });
});

describe("reading a loan account's CSV", () => {
  it("adds up interest by financial year and takes the latest balance", () => {
    const csv = [
      "Date,Description,Debit,Credit,Balance",
      ...["2025-07-31", "2025-08-31", "2025-09-30", "2025-10-31", "2025-11-30", "2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"].map(
        (date, i) => `${date.split("-").reverse().join("/")},Interest charged,2000.00,,${(-(400000 - i * 500)).toFixed(2)}`
      ),
      "15/07/2026,Repayment,,2700.00,-394000.00",
      "31/07/2026,Interest charged,1950.50,,-395950.50",
    ].join("\n");
    const r = readLoanCsv(csv);
    expect(r.interestByYear).toEqual([
      { fyLabel: "2025-26", interest: 24_000, complete: true },
      { fyLabel: "2026-27", interest: 1_950.5, complete: false },
    ]);
    expect(r.balance).toBe(395_950.5);
    expect(r.asAt).toEqual(d("2026-07-31"));
  });
});
