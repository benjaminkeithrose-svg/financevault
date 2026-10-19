import { describe, expect, it } from "vitest";
import { isValidTfn, maskTfn, redactTfns } from "../src/services/tfn.js";

describe("TFN checksum", () => {
  it("accepts a valid nine-digit TFN in any spacing", () => {
    expect(isValidTfn("123 456 782")).toBe(true);
    expect(isValidTfn("123456782")).toBe(true);
    expect(isValidTfn("123-456-782")).toBe(true);
  });

  it("rejects a single mistyped digit", () => {
    expect(isValidTfn("123 456 789")).toBe(false);
    expect(isValidTfn("123 456 783")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidTfn("1234567")).toBe(false);
    expect(isValidTfn("1234567890")).toBe(false);
  });
});

describe("masking", () => {
  it("keeps only the last three digits", () => {
    expect(maskTfn("123456782")).toBe("••• ••• 782");
  });
});

describe("redacting TFNs from document text", () => {
  it("masks a TFN printed in the usual grouping", () => {
    const { text, count } = redactTfns("Tax file number: 123 456 782");
    expect(text).toBe("Tax file number: [TFN ••• ••• 782]");
    expect(count).toBe(1);
  });

  it("masks an ungrouped TFN when it's labelled on the same line", () => {
    expect(redactTfns("TFN 123456782").text).toBe("TFN [TFN ••• ••• 782]");
  });

  it("leaves an invoice number alone even though it happens to pass the checksum", () => {
    // 876543210 passes the TFN checksum by chance (about 1 in 11 numbers do).
    // It sits under a "Tax file number" line, which is exactly the case that
    // was wrongly redacted before the label had to be on the same line.
    const input = "Tax file number: 123 456 782\nInvoice no. 876543210 paid";
    expect(redactTfns(input).text).toBe("Tax file number: [TFN ••• ••• 782]\nInvoice no. 876543210 paid");
  });

  it("leaves numbers that fail the checksum alone", () => {
    expect(redactTfns("Reference 123 456 789").text).toBe("Reference 123 456 789");
  });

  it("doesn't match inside longer numbers such as phone numbers", () => {
    expect(redactTfns("Call 0412345678 or 61123456782").text).toBe("Call 0412345678 or 61123456782");
  });
});
