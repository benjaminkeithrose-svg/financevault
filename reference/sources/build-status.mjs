// Writes reference/SOURCES.md: which link-pack documents are saved, and which are still needed.
// Run: node reference/sources/build-status.mjs
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
const pack = JSON.parse(readFileSync(new URL("../link-pack.json", here), "utf8"));
const idx = JSON.parse(readFileSync(new URL("index.json", here), "utf8"));
const have = new Map();
const partial = new Set();
for (const f of idx.files) {
  for (const id of f.covers) have.set(id, f.file);
  for (const id of f.partial || []) partial.add(id);
}
const url = (l) => (l.urlPattern && l.latestYear ? l.urlPattern.replace("{YEAR}", l.latestYear) : l.url);
const needed = pack.links.filter((l) => !have.has(l.id) && l.kind !== "index");
const got = pack.links.filter((l) => have.has(l.id));
const lines = [
  "# Source documents: received and still needed",
  "",
  `Generated from link-pack.json and sources/index.json. ${got.length} of ${pack.links.filter((l) => l.kind !== "index").length} documents saved (index pages don't need saving).`,
  "",
  "## Still needed",
  "",
  "Open each link on your own computer, save it as a PDF (for web pages use the page's \"Print\" or \"Print whole section\" option, then \"Save as PDF\"), and upload it.",
  "",
  ...needed.map((l, i) => `${i + 1}. **${l.title}**${partial.has(l.id) ? " (have a summary; full page wanted)" : ""}${idx.notes?.[l.id] ? ` - ${idx.notes[l.id]}` : ""}\n   ${url(l)}`),
  "",
  "## Received",
  "",
  ...idx.files.map((f) => `- \`${f.file}\`${f.covers.length ? ` - covers: ${f.covers.join(", ")}` : ""}${f.note ? ` - ${f.note}` : ""}`),
  "",
];
writeFileSync(new URL("../SOURCES.md", here), lines.join("\n"));
console.log(`saved ${got.length}, still needed ${needed.length}`);
