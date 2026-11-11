import { describe, expect, it } from "vitest";
import { convertRows, inspectCsv, parseAmount, parseDate } from "../src/services/bankCsv.js";

const iso = (date: Date) => date.toISOString().slice(0, 10);

function importAll(csv: string) {
  const { proposed } = inspectCsv(csv);
  return { proposed, ...convertRows(csv, proposed) };
}

describe("real Australian bank export layouts", () => {
  it("CommBank: no header row, credits written with a leading +", () => {
    const { proposed, rows, skipped } = importAll(
      `08/03/2024,-25.50,"EFTPOS WOOLWORTHS 1234",+1250.00\n` +
        `09/03/2024,+3200.00,"SALARY ACME PTY LTD",+4450.00\n` +
        `15/03/2024,-1850.00,"RENT PAYMENT",+2600.00\n`
    );
    expect(proposed.hasHeaderRow).toBe(false);
    expect(skipped).toHaveLength(0);
    expect(rows.map((r) => [iso(r.date), r.amount, r.description])).toEqual([
      ["2024-03-08", -25.5, "EFTPOS WOOLWORTHS 1234"],
      ["2024-03-09", 3200, "SALARY ACME PTY LTD"],
      ["2024-03-15", -1850, "RENT PAYMENT"],
    ]);
  });

  it("Westpac: money out and in split across two columns", () => {
    const { proposed, rows } = importAll(
      `Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance\n` +
        `123-456,08/03/2024,WOOLWORTHS METRO,25.50,,1250.00\n` +
        `123-456,09/03/2024,SALARY ACME,,3200.00,4450.00\n`
    );
    expect(proposed.amountColumn).toBeNull();
    expect(rows.map((r) => r.amount)).toEqual([-25.5, 3200]);
    expect(rows[0].description).toBe("WOOLWORTHS METRO");
  });

  it("NAB: picks Transaction Details (the merchant) over Transaction Type", () => {
    const { rows } = importAll(
      `Date,Amount,Account Number,Transaction Type,Transaction Details,Balance\n` +
        `08 Mar 2024,-25.50,123456,EFTPOS,WOOLWORTHS METRO,1250.00\n`
    );
    expect(rows[0].description).toBe("WOOLWORTHS METRO");
    expect(iso(rows[0].date)).toBe("2024-03-08");
  });

  it("ISO dates and accounting-style negatives", () => {
    const { proposed, rows } = importAll(`Date,Description,Amount\n2024-03-08,Woolworths,(25.50)\n2024-03-09,Salary,3200.00\n`);
    expect(proposed.dateFormat).toBe("YMD");
    expect(rows.map((r) => r.amount)).toEqual([-25.5, 3200]);
  });
});

describe("amounts", () => {
  it.each([
    ["+1,234.56", 1234.56],
    ["-25.50", -25.5],
    ["$1,000", 1000],
    ["(12.00)", -12],
    ["", null],
    ["abc", null],
  ])("%s -> %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
});

describe("dates", () => {
  it("is day-first for Australian exports", () => {
    expect(iso(parseDate("03/04/2024", "DMY")!)).toBe("2024-04-03");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("31/02/2024", "DMY")).toBeNull();
  });
  it("reads two-digit years as this century", () => {
    expect(iso(parseDate("08/03/24", "DMY")!)).toBe("2024-03-08");
  });
  it("reads named months regardless of format hint", () => {
    expect(iso(parseDate("14 Oct 2024", "MDY")!)).toBe("2024-10-14");
  });
});

describe("the sign flip option", () => {
  it("inverts every amount for banks that export spending as positive", () => {
    const csv = `Date,Description,Amount\n08/03/2024,Coffee,4.50\n`;
    const { proposed } = inspectCsv(csv);
    expect(convertRows(csv, { ...proposed, invertSign: true }).rows[0].amount).toBe(-4.5);
  });
});

describe("unreadable rows", () => {
  it("are reported with their line number rather than dropped silently", () => {
    const csv = `Date,Description,Amount\n08/03/2024,Coffee,-4.50\nnot a date,Mystery,-1.00\n`;
    const { proposed } = inspectCsv(csv);
    const { rows, skipped } = convertRows(csv, proposed);
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([expect.objectContaining({ line: 3, reason: "Couldn't read a date" })]);
  });
});
