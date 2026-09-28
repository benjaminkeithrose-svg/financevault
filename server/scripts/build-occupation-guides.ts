import fs from "node:fs";
import path from "node:path";
import { PAGE_BREAK, parseGuide, SHIPPED_FILE, type Guide } from "../src/services/occupationGuides.js";

/**
 * Builds reference/occupation-guides.json — the checklists that ship with
 * the app — from a "Reference downloads" folder saved by the app's
 * downloader (Settings → Reference library → Download and check for updates).
 *
 *   npx tsx scripts/build-occupation-guides.ts "<path to Reference downloads>"
 *
 * Reads ATO/Occupation guides: a text file for each guide, or (downloads
 * before 1.5.0) a folder for each guide with a file for each section.
 */

const root = process.argv[2];
if (!root) {
  console.error('Usage: npx tsx scripts/build-occupation-guides.ts "<path to Reference downloads>"');
  process.exit(1);
}
const base = path.join(root, "ATO", "Occupation guides");

function textFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? textFiles(path.join(dir, e.name)) : e.name.endsWith(".txt") ? [path.join(dir, e.name)] : []));
}

const guides: Guide[] = [];
for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  const full = path.join(base, entry.name);
  const sectionFolder = entry.isDirectory() && fs.readdirSync(full).every((f) => f.startsWith("Occupation guide — "));
  const sources = sectionFolder
    ? [{ title: entry.name, files: fs.readdirSync(full).filter((f) => f.endsWith(".txt")).sort().map((f) => path.join(full, f)) }]
    : (entry.isDirectory() ? textFiles(full) : entry.name.endsWith(".txt") ? [full] : []).map((f) => ({
        title: path.basename(f, ".txt").replace(/^Occupation guide — /, ""),
        files: [f],
      }));
  for (const s of sources) {
    const text = s.files.map((f) => fs.readFileSync(f, "utf8")).join(PAGE_BREAK);
    const guide = parseGuide(text, s.title);
    if (!guide) continue;
    guides.push(guide);
    console.log(`${guide.items.length.toString().padStart(3)}  ${guide.title}`);
  }
}
guides.sort((a, b) => a.title.localeCompare(b.title));
fs.writeFileSync(SHIPPED_FILE, JSON.stringify({ builtFrom: path.basename(root), guides }, null, 1) + "\n");
console.log(`\n${guides.length} guides written to ${SHIPPED_FILE}`);
