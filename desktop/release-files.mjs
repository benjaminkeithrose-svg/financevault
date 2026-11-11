// The files a GitHub release carries for automatic updates:
//
//   Financial-Vault-Setup-<version>.exe   the Setup (GitHub turns spaces in
//                                         file names into dots, so hyphens)
//   update.json                           its version, size, SHA-512 checksum
//                                         and what's new
//   release-notes.md                      what's new, for the release page
//
//   node desktop/release-files.mjs <Setup.exe> <version> <out folder>
//
// The installed program downloads update.json first and only uses a Setup
// that matches it (server/src/services/onlineUpdate.ts).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The newest section of RELEASE-NOTES.md ("## 1.8.0 — …" and its bullets). */
export function latestNotes(text) {
  const start = text.search(/^## /m);
  if (start < 0) return null;
  const rest = text.slice(start);
  const next = rest.slice(3).search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next + 3)).trim();
}

export function sha512(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("hex");
}

export function setupName(version) {
  return `Financial-Vault-Setup-${version}.exe`;
}

export function manifest(setupFile, version, notes) {
  return { version, file: setupName(version), size: fs.statSync(setupFile).size, sha512: sha512(setupFile), notes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [setup, version, out] = process.argv.slice(2);
  if (!setup || !version || !out) {
    console.error("Usage: node desktop/release-files.mjs <Setup.exe> <version> <out folder>");
    process.exit(2);
  }
  const notes = latestNotes(fs.readFileSync(path.join(ROOT, "RELEASE-NOTES.md"), "utf8"));
  if (!notes?.startsWith(`## ${version} `)) {
    console.error(`RELEASE-NOTES.md doesn't start with a section for ${version}.`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(setup, path.join(out, setupName(version)));
  fs.writeFileSync(path.join(out, "update.json"), JSON.stringify(manifest(setup, version, notes), null, 2));
  fs.writeFileSync(path.join(out, "release-notes.md"), notes.split("\n").slice(1).join("\n").trim() + "\n");
  console.log(`Release files for ${version} are in ${out}`);
}
