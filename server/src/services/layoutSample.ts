// A document's layout with the personal and financial details blanked out:
// the wording and the way it's laid out stay; every digit, email, known name
// and address goes. Made so a statement's layout can be shared to teach the
// readers a new lender's or form's wording — without sharing its figures.
// Built on this computer and only ever handed to the person to check first.

// A street address: a house number, a street name and its type ("12 Wattle Street", "3/40 Kent St").
const STREET = /\b\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?\s+[A-Za-z' -]{2,40}\s(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Pde|Parade|Cres|Crescent|Ct|Court|Pl|Place|Hwy|Highway|Lane|Ln|Tce|Terrace|Blvd|Boulevard|Way|Close|Cl)\b\.?.*$/gim;
const TITLED_NAME = /\b(Mr|Mrs|Ms|Miss|Dr)\.?[ \t]+[A-Z][a-zA-Z'-]+(?:[ \t]+[A-Z][a-zA-Z'-]+){0,3}/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Words in names that are also ordinary statement wording — never blanked on their own.
const COMMON = new Set(
  "rate rates interest loan loans home balance account accounts statement bank trust family investment investments super fund pty ltd limited property properties company holdings group partners partnership unit units smsf the and for with from total amount repayment payment offset credit debit card personal business estate street road drive house main north south east west".split(" ")
);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function blankLayout(text: string, knownNames: string[]): string {
  let out = text.replace(EMAIL, "[email]");
  // Names and addresses the app knows (people, entities, properties), longest first.
  const names = [...new Set(knownNames.map((n) => n.trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  for (const n of names) {
    out = out.replace(new RegExp(escape(n), "gi"), "[name]");
    // Each word of a person's or entity's name on its own, too (a statement may print "SMITH J").
    for (const w of n.split(/\s+/)) if (w.length >= 4 && /^[A-Za-z'-]+$/.test(w) && !COMMON.has(w.toLowerCase())) out = out.replace(new RegExp(`\\b${escape(w)}\\b`, "gi"), "[name]");
  }
  out = out.replace(TITLED_NAME, "[name]");
  out = out.replace(STREET, "[address]");
  // Every digit: amounts, dates, account and reference numbers keep their shape, not their value.
  out = out.replace(/\d/g, "0");
  return out;
}
