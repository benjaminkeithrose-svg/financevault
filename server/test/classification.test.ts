import { describe, expect, it } from "vitest";
import { classifyDocument, financialYearLabelFromText } from "../src/services/classification.js";

describe("financial year from a folder or filename", () => {
  it.each([
    ["Tax Returns/2023-24", "2023-24"],
    ["Tax Returns/2023-2024", "2023-24"],
    ["FY24 statements", "2023-24"],
    ["FY2025", "2024-25"],
  ])("%s -> %s", (text, label) => {
    expect(financialYearLabelFromText(text)).toBe(label);
  });

  it("ignores a bare year, which could be either of two financial years", () => {
    expect(financialYearLabelFromText("Statements/2023")).toBeNull();
  });

  it("ignores ranges that aren't consecutive years", () => {
    expect(financialYearLabelFromText("2019-2024 archive")).toBeNull();
  });
});

describe("classification", () => {
  it("matches multi-word keywords in underscore- and hyphen-separated filenames", () => {
    const result = classifyDocument({ filename: "Rates_Notice_2024.pdf", text: "", entities: [] });
    expect(result.documentType).toBe("Council Rates");
  });

  it("uses the folder the file came from", () => {
    const result = classifyDocument({
      filename: "scan_0042.pdf",
      text: "",
      entities: [],
      folderPath: "Bank_Statements/CommBank",
    });
    expect(result.documentType).toBe("Bank Statement");
  });

  it("prefers the folder's financial year over one guessed from dates in the text", () => {
    const result = classifyDocument({
      filename: "return.pdf",
      // A tax return's earliest date is often a prior-year comparative.
      text: "Individual tax return. Prior year figure as at 30/06/2022.",
      entities: [],
      folderPath: "Tax Returns/2023-24",
    });
    expect(result.financialYearLabel).toBe("2023-24");
  });

  it("matches an entity named in the document", () => {
    const result = classifyDocument({
      filename: "statement.pdf",
      text: "Account holder: Rose Family Trust",
      entities: [{ id: "e1", name: "Rose Family Trust" }],
    });
    expect(result.entityId).toBe("e1");
  });
});

describe("statements with a table of transactions", () => {
  // Cells run together, as the PDF text reader gives them.
  const rows = [
    "01/01/23OPENING BALANCE2,000.00",
    "03/01/23DIRECT DEBIT AHM HEALTH INSURANCE 9988776665.731,934.27",
    "05/01/23BPAY ORANGE CITY COUNCIL RATES412.001,522.27",
    "09/01/23DEPOSIT SALARY ACME PTY LTD2,500.004,022.27",
    "12/01/23EFTPOS WOOLWORTHS 1234 ORANGE45.203,977.07",
    "15/01/23VISA DEBIT PURCHASE NRMA CAR INSURANCE88.103,888.97",
    "31/01/23CLOSING BALANCE3,888.97",
  ].join("\n");
  const statement = (letterhead: string) => `${letterhead}\nStatement Period 01/01/2023 - 31/01/2023\nDATETRANSACTION DESCRIPTIONDEBITCREDITBALANCE\n${rows}`;

  it("goes by what's above the table, not the transactions in it", () => {
    expect(classifyDocument({ filename: "stmt.pdf", text: statement("Westpac Banking Corporation\nWestpac Choice"), entities: [] }).documentType).toBe("Bank Statement");
    expect(classifyDocument({ filename: "stmt.pdf", text: statement("Westpac\nHome loan statement"), entities: [] }).documentType).toBe("Loan Statement");
    expect(classifyDocument({ filename: "stmt.pdf", text: statement("Ray White Orange\nRental statement for 12 Smith St"), entities: [] }).documentType).toBe("Rental Statement");
  });

  it("leaves other documents as they were", () => {
    const policy = "AHM Health Insurance\nYour policy schedule\nHospital and extras cover\nPremium $210.00 a month";
    const kind = classifyDocument({ filename: "ahm.pdf", text: policy, entities: [] }).documentType;
    expect(kind).not.toBe("Bank Statement");
    expect(kind).toBeTruthy();
  });
});
