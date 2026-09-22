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
