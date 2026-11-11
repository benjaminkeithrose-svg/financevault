/**
 * Tax file number handling: validation, display masking, and removal from
 * free text.
 *
 * TFNs carry a check digit scheme published by the ATO — each digit is
 * multiplied by a fixed weight and the total must divide evenly by 11. That
 * catches almost every mistyped digit, and it is also what lets TFNs be
 * picked out of document text without redacting every nine-digit number.
 */

const WEIGHTS_9 = [1, 4, 3, 7, 5, 8, 6, 9, 10];
// Older eight-digit TFNs, still valid for people issued one long ago.
const WEIGHTS_8 = [10, 7, 8, 4, 6, 3, 5, 1];

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidTfn(value: string): boolean {
  const digits = digitsOnly(value);
  const weights = digits.length === 9 ? WEIGHTS_9 : digits.length === 8 ? WEIGHTS_8 : null;
  if (!weights) return false;
  const sum = weights.reduce((total, weight, i) => total + weight * Number(digits[i]), 0);
  return sum % 11 === 0;
}

/** "123456782" -> "••• ••• 782": enough to tell TFNs apart, not enough to use one. */
export function maskTfn(value: string): string {
  const digits = digitsOnly(value);
  return `••• ••• ${digits.slice(-3)}`;
}

/** Stored and compared as bare digits, whatever spacing it was typed with. */
export function normaliseTfn(value: string): string {
  return digitsOnly(value);
}

const NEAR_KEYWORD = /(tax\s*file\s*(number|no\.?)|\bTFN\b)/i;

/**
 * Replaces tax file numbers in document text with a masked form.
 *
 * A nine-digit number has roughly a one-in-eleven chance of passing the
 * checksum by accident, so a checksum match alone would also eat invoice and
 * reference numbers. A number is only treated as a TFN if it passes the
 * checksum AND either is written in the "123 456 782" grouping TFNs are
 * printed in, or sits close to the words "tax file number" / "TFN".
 */
export function redactTfns(text: string): { text: string; count: number } {
  let count = 0;
  const redacted = text.replace(/\b\d{3}[ -]?\d{3}[ -]?\d{2,3}\b/g, (match, offset: number) => {
    if (!isValidTfn(match)) return match;
    const grouped = /^\d{3}[ -]\d{3}[ -]\d{2,3}$/.test(match);
    // The label has to come just before the number on the same line. A wider
    // window reaches into the line above, so a "Tax file number" label would
    // also claim the invoice number printed underneath it.
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const labelBefore = text.slice(Math.max(lineStart, offset - 40), offset);
    if (!grouped && !NEAR_KEYWORD.test(labelBefore)) return match;
    count += 1;
    return `[TFN ${maskTfn(match)}]`;
  });
  return { text: redacted, count };
}
