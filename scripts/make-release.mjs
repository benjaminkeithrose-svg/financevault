// Makes the download for a new version: financevault-<version>.zip, holding
// everything committed, in a "financevault" folder. That ZIP is what goes on
// Settings → Install an update (or in the data folder's Updates folder).
// Bump "version" in package.json and add a section to RELEASE-NOTES.md first.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const notes = fs.readFileSync(path.join(root, "RELEASE-NOTES.md"), "utf8");
if (!notes.includes(`## ${version}`)) {
  console.error(`RELEASE-NOTES.md has no "## ${version}" section yet.`);
  process.exit(1);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  console.warn("Note: there are uncommitted changes — only committed files go in the ZIP.");
}
const out = path.join(root, `financevault-${version}.zip`);
execFileSync("git", ["archive", "--format=zip", "--prefix=financevault/", "-o", out, "HEAD"], { cwd: root });
console.log(`Made ${path.basename(out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
