import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { log } from "./log.mjs";
import { run } from "./run.mjs";

const hashOf = (file) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return "none";
  }
};
const readStamp = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
};

/** The newest change time of any file under these folders. */
function newestChange(dirs) {
  let newest = 0;
  const walk = (dir) => {
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      newest = Math.max(newest, fs.statSync(dir).mtimeMs);
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  dirs.forEach(walk);
  return newest;
}

/**
 * Gets the program ready to run: installs what's needed (only when the list
 * of libraries changed — this is the one step that needs the internet),
 * brings the database up to this version's layout, and builds the app when
 * its files changed. Each step is skipped when nothing changed, so a normal
 * start takes seconds.
 */
/** Runs one step; a failure says which step, in plain words. */
async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    const err = new Error(`${label} didn't work`);
    err.details = e.message;
    log(`${label} failed: ${e.message}`);
    throw err;
  }
}

export async function prepareProgram(programDir, env) {
  const lockHash = hashOf(path.join(programDir, "package-lock.json"));
  const lockStamp = path.join(programDir, "node_modules", ".fv-installed");
  if (!fs.existsSync(path.join(programDir, "node_modules")) || readStamp(lockStamp) !== lockHash) {
    log("Installing the libraries this version needs (this needs the internet, once)…");
    await step("Installing the libraries it needs (this needs the internet)", () => run("npm", ["install", "--no-audit", "--no-fund"], { cwd: programDir, env }));
    fs.writeFileSync(lockStamp, lockHash);
  }

  const server = path.join(programDir, "server");
  const schemaHash = hashOf(path.join(server, "prisma", "schema.prisma"));
  const generated = path.join(programDir, "node_modules", ".fv-prisma-generated");
  if (readStamp(generated) !== schemaHash) {
    await step("Preparing the database library", () => run("npx", ["prisma", "generate"], { cwd: server, env }));
    fs.writeFileSync(generated, schemaHash);
  }

  log("Bringing your records up to this version's layout…");
  await step("Updating your records to the new layout", () => run("npx", ["prisma", "migrate", "deploy"], { cwd: server, env }));
  await step("Setting up the standard lists", () => run("npx", ["tsx", "prisma/seed.ts"], { cwd: server, env, quiet: true }));

  const built = path.join(programDir, "server", "dist", ".fv-built");
  const sources = [path.join(server, "src"), path.join(programDir, "web", "src"), path.join(programDir, "web", "index.html")];
  const builtAt = fs.existsSync(built) && fs.existsSync(path.join(programDir, "web", "dist", "index.html")) ? fs.statSync(built).mtimeMs : 0;
  if (!builtAt || newestChange(sources) > builtAt || readStamp(built) !== lockHash + schemaHash) {
    log("Building the app…");
    await step("Building the app", () => run("npm", ["run", "build"], { cwd: programDir, env }));
    fs.writeFileSync(built, lockHash + schemaHash);
  }
}
