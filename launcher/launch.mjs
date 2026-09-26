// Starts Financial Vault: the double-click files and the desktop icon all
// run this. It keeps the records in their own data folder, installs an
// update waiting in the Updates folder, gets the program ready, runs it,
// and opens it in its own window. It watches the running app: when an
// update is installed from inside the app, the app stops, this installs it
// and starts the new version; when the window is closed, everything stops.
//
//   --hidden        started from the desktop icon, with no terminal window
//   --continue      carrying on after an update replaced this launcher
//   --window-open   the app window is already open (don't open another)

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline/promises";
import { ensureDataMoved } from "./lib/data.mjs";
import { log, openLog } from "./lib/log.mjs";
import { ensureFolders, layout, PROGRAM_DIR, programVersion } from "./lib/paths.mjs";
import { prepareProgram } from "./lib/prepare.mjs";
import { ensureDesktopIcon } from "./lib/shortcut.mjs";
import { applyUpdate, pendingUpdates, putBackPrevious, readJson, writeJson } from "./lib/update.mjs";
import { openWindow } from "./lib/window.mjs";

const args = new Set(process.argv.slice(2));
const hidden = args.has("--hidden");
let windowOpen = args.has("--window-open");
const RESTART_CODE = 75;

const l = layout();
ensureFolders(l);
openLog(l.logs);

const port = Number(process.env.FV_PORT || process.env.PORT || 4000);
const url = `http://localhost:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  // Prisma reads the records from here, whatever server/.env says.
  DATABASE_URL: `file:${l.db.replace(/\\/g, "/")}`,
  STORAGE_DIR: l.documents,
  FV_DATA_DIR: l.root,
  FV_SUPERVISED: "1",
  FV_EXIT_WHEN_CLOSED: process.env.FV_EXIT_WHEN_CLOSED ?? "1",
};

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/vault/status`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntilUp(seconds = 90) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Something went wrong: say so plainly, in the window or (with no window) on a page in the browser. */
async function problem(message) {
  log(`PROBLEM: ${message}`);
  if (hidden) {
    const page = path.join(l.logs, "problem.html");
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    fs.writeFileSync(
      page,
      `<!doctype html><meta charset="utf-8"><title>Financial Vault couldn't start</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
<h1>Financial Vault couldn't start</h1><p>${esc(message)}</p>
<p>Your records and documents haven't been changed. They're in:<br><code>${esc(l.root)}</code></p>
<p>To see more, open the Financial Vault folder and double-click <b>Start Financial Vault</b> — it shows what happens as it starts.
The full log is in <code>${esc(path.join(l.logs, "launcher.log"))}</code>.</p></body>`
    );
    const [cmd, a] = process.platform === "win32" ? ["cmd", ["/c", "start", "", page]] : process.platform === "darwin" ? ["open", [page]] : ["xdg-open", [page]];
    spawn(cmd, a, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("\nPress Enter to close this window...");
    rl.close();
  }
  process.exit(1);
}

/** Runs the (new) launcher in place of this one, and finishes when it does. */
function handOver() {
  const next = [path.join(PROGRAM_DIR, "launcher", "launch.mjs"), "--continue"];
  if (hidden) next.push("--hidden");
  if (windowOpen) next.push("--window-open");
  const child = spawn(process.execPath, next, { stdio: "inherit", env: process.env, cwd: PROGRAM_DIR, windowsHide: true });
  child.on("exit", (code) => process.exit(code ?? 0));
}

/**
 * A request to put the previous version back, or an update ZIP in the
 * Updates folder. Returns true when the program was changed (and the new
 * one should take over).
 */
async function handlePending() {
  if (fs.existsSync(l.rollbackRequest)) {
    fs.rmSync(l.rollbackRequest);
    const from = programVersion();
    try {
      const to = putBackPrevious(PROGRAM_DIR, l);
      writeJson(l.lastUpdate, { kind: "ROLLED_BACK", from, to, at: new Date().toISOString(), seen: false });
      return true;
    } catch (e) {
      log(e.message);
      return false;
    }
  }
  const updates = await pendingUpdates(l, programVersion());
  if (!updates.length) return false;
  await applyUpdate(PROGRAM_DIR, l, updates[0]);
  return true;
}

async function prepare() {
  const inProgress = readJson(l.inProgress);
  try {
    await prepareProgram(PROGRAM_DIR, env);
  } catch (e) {
    if (!inProgress) throw e;
    // The new version couldn't be made ready: put the old one back, records and all, and carry on with it.
    log(`Version ${inProgress.to} couldn't be installed: ${e.message}`);
    putBackPrevious(PROGRAM_DIR, l, { restoreRecords: inProgress.backup });
    fs.rmSync(l.inProgress, { force: true });
    writeJson(l.lastUpdate, {
      kind: "FAILED",
      from: inProgress.from,
      to: inProgress.to,
      error: String(e.message).split("\n")[0].slice(0, 300),
      at: new Date().toISOString(),
      seen: false,
    });
    return "handed-over";
  }
  if (inProgress) {
    fs.rmSync(l.inProgress, { force: true });
    writeJson(l.lastUpdate, { kind: "UPDATED", from: inProgress.from, to: inProgress.to, notes: inProgress.notes, at: new Date().toISOString(), seen: false });
    log(`Updated to version ${inProgress.to}.`);
  }
  return "ready";
}

function startServer() {
  const serverDir = path.join(PROGRAM_DIR, "server");
  const out = hidden ? fs.openSync(path.join(l.logs, "server.log"), "a") : "inherit";
  return spawn(process.execPath, [path.join(serverDir, "dist", "index.js")], {
    cwd: serverDir,
    env,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
}

async function main() {
  log(`Financial Vault ${programVersion()} — data folder: ${l.root}`);

  // Already running (a second double-click): just show it.
  if (!args.has("--continue") && (await ping())) {
    openWindow(url, l.browserProfile);
    return;
  }

  if (!args.has("--continue")) {
    await ensureDataMoved(l, { interactive: !hidden && process.stdin.isTTY });
    if (await handlePending()) return handOver();
  }

  try {
    if ((await prepare()) === "handed-over") return handOver();
  } catch (e) {
    return problem(`Getting Financial Vault ready failed: ${String(e.message).split("\n")[0]}`);
  }

  for (;;) {
    const server = startServer();
    const exited = new Promise((resolve) => server.on("exit", (code) => resolve(code)));
    const up = await Promise.race([waitUntilUp(), exited.then(() => false)]);
    if (!up) return problem("The app didn't start. The details are in the log.");
    log(`Financial Vault is running at ${url}`);
    if (!windowOpen) {
      openWindow(url, l.browserProfile);
      windowOpen = true;
      if (!hidden) {
        console.log("\nFinancial Vault is open in its own window. Closing that window stops it.");
        console.log("Keep this window open while you use it.");
      }
    }
    await ensureDesktopIcon(PROGRAM_DIR, l);

    const code = await exited;
    if (code === RESTART_CODE) {
      log("Restarting to install an update or put back the previous version…");
      if (await handlePending()) return handOver();
      continue;
    }
    if (code === 0) {
      log("Financial Vault closed.");
      return;
    }
    return problem(`Financial Vault stopped unexpectedly (code ${code}). The details are in the log.`);
  }
}

main().catch((e) => problem(e.message));
