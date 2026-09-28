// The installed Financial Vault program (Windows Setup): Electron's main
// process. It does what launcher/launch.mjs does for the folder version,
// without needing Node.js installed or a build on this computer:
//
// 1. finds the records in the data folder (Documents > Financial Vault Data),
//    offering to copy them in from an older copy of the program if they're
//    only there;
// 2. after a new version is installed, backs the records up and notes what's
//    new (shown in the app);
// 3. brings the records up to this version's layout and sets up the
//    standard lists;
// 4. runs the app (server/dist, on the Node.js built into Electron) and
//    shows it in its own window — closing the window stops it.
//
// The program's files are in resources/program, laid out like the folder
// version, so the app finds everything where it always has. Nothing here
// goes online: links to websites open in the normal browser.
//
//   FV_SMOKE_TEST=1   start, check the app answers and shows its first
//                     screen, write the result to FV_SMOKE_RESULT, and quit.

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const zlib = require("node:zlib");

const PROGRAM_DIR = process.env.FV_PROGRAM_DIR ? path.resolve(process.env.FV_PROGRAM_DIR) : path.join(process.resourcesPath, "program");
const PORT = Number(process.env.FV_PORT || 4000);
const HOME = `http://localhost:${PORT}`;
const SMOKE = process.env.FV_SMOKE_TEST === "1";
const RESTART_CODE = 75;
const ICON = path.join(PROGRAM_DIR, "launcher", "icons", process.platform === "win32" ? "financevault.ico" : "financevault.png");

let win = null;
let server = null;
let quitting = false;
let logFn = (m) => console.log(m);
const log = (m) => logFn(m);

/** The folder version's own helpers (launcher/lib), so both find and treat the records the same way. */
const lib = (name) => import(pathToFileURL(path.join(PROGRAM_DIR, "launcher", "lib", name)).href);

// One Financial Vault at a time: starting it again brings the open one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => start().catch((e) => problem(`Financial Vault couldn't start: ${e.message}`)));
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  quitting = true;
  if (server && server.exitCode === null) server.kill();
});

// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page(title, body) {
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:"Segoe UI",system-ui,sans-serif;background:#f6f5fb;color:#1f1b3a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
main{max-width:520px;padding:24px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{color:#5b5775;line-height:1.5}</style>
<main><h1>${esc(title)}</h1><p>${esc(body)}</p></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function status(text) {
  log(text);
  if (win && !win.isDestroyed()) win.loadURL(page("Financial Vault", text)).catch(() => {});
}

const isLocal = (url) => url.startsWith(`${HOME}/`) || url === HOME || url.startsWith(`http://127.0.0.1:${PORT}`);

function createWindow() {
  const w = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    title: "Financial Vault",
    icon: ICON,
    backgroundColor: "#f6f5fb",
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  // The app's own pages (a document opened in a new window) stay here; websites open in the normal browser.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: "allow", overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true } };
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("will-navigate", (e, url) => {
    if (isLocal(url) || url.startsWith("data:")) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
  });
  w.on("closed", () => {
    win = null;
    app.quit();
  });
  return w;
}

function setMenu(l) {
  // Hidden until Alt is pressed, as in most Windows programs.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "&File",
        submenu: [
          { label: "Open the data folder", click: () => void shell.openPath(l.root) },
          { label: "Open the logs folder", click: () => void shell.openPath(l.logs) },
          { type: "separator" },
          { role: "quit", label: "Close Financial Vault" },
        ],
      },
      { label: "&Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      {
        label: "&View",
        submenu: [
          { role: "reload" },
          { type: "separator" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
          { type: "separator" },
          { role: "togglefullscreen" },
          { role: "toggleDevTools", label: "Developer tools" },
        ],
      },
      { label: "&Help", submenu: [{ label: "How Financial Vault works", click: () => win && void win.loadURL(`${HOME}/help`) }] },
    ])
  );
}

/** Something went wrong: say so plainly, point at the log, and close. */
async function problem(message) {
  log(`PROBLEM: ${message}`);
  if (SMOKE) return finishSmoke({ ok: false, problem: message });
  let logs = null;
  try {
    logs = (await lib("paths.mjs")).layout().logs;
  } catch {
    /* no layout */
  }
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: "error",
    title: "Financial Vault",
    message: "Financial Vault couldn't start",
    detail: `${message}\n\nYour records and documents haven't been changed. The details are in the log.`,
    buttons: logs ? ["Open the logs folder", "Close"] : ["Close"],
    defaultId: 0,
  });
  if (logs && response === 0) await shell.openPath(logs);
  quitting = true;
  app.quit();
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/vault/status`, { timeout: 1500 }, (res) => {
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

/** Runs a script on the Node.js built into Electron; its output goes to the log. */
function runNode(label, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: path.join(PROGRAM_DIR, "server"), env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("exit", (code) => {
      if (out.trim()) log(`${label}:\n${out.trim().slice(-4000)}`);
      if (code === 0) resolve();
      else reject(new Error(`${label} didn't work (code ${code})`));
    });
  });
}

/** The database engines for this computer, shipped in resources/program/engines. */
function engineEnv() {
  try {
    const e = JSON.parse(fs.readFileSync(path.join(PROGRAM_DIR, "engines", "engines.json"), "utf8"));
    return {
      PRISMA_QUERY_ENGINE_LIBRARY: path.join(PROGRAM_DIR, "engines", e.queryEngine),
      PRISMA_SCHEMA_ENGINE_BINARY: path.join(PROGRAM_DIR, "engines", e.schemaEngine),
    };
  } catch {
    return {};
  }
}

/**
 * Records only in an older copy of the program (from before the data
 * folder): offered, one copy at a time. The originals are left as they are.
 */
async function ensureRecords(l) {
  const data = await lib("data.mjs");
  const found = await data.ensureDataMoved(l, { interactive: false });
  if (found !== "fresh" || SMOKE) return;
  for (const other of data.findOtherCopies()) {
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      title: "Financial Vault",
      message: "Found earlier Financial Vault records",
      detail: `In ${other.dir}\n\nCopy them into this Financial Vault? The originals are left as they are.`,
      buttons: ["Copy them in", "Not these"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      data.moveLegacyData(other.legacy, l, { renameOld: false });
      return;
    }
  }
}

/**
 * The language data for reading scanned documents: shipped compressed with
 * the program, unpacked once into the data folder. Unpacked here, not by the
 * OCR library: it hangs unpacking it on Electron's Node.js.
 */
function ensureOcrData(l) {
  const dir = path.join(l.root, ".ocr-language-data");
  const shipped = path.join(PROGRAM_DIR, "tessdata", "eng.traineddata.gz");
  const target = path.join(dir, "eng.traineddata");
  const stampFile = path.join(dir, "unpacked-from.txt");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(shipped)) return dir;
  const from = `${fs.statSync(shipped).size}`;
  const done = fs.existsSync(target) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8").trim() === from;
  if (!done) {
    fs.writeFileSync(`${target}.part`, zlib.gunzipSync(fs.readFileSync(shipped)));
    fs.renameSync(`${target}.part`, target);
    fs.writeFileSync(stampFile, from);
    log("Unpacked the language data for reading scanned documents.");
  }
  return dir;
}

function startServer(env, l) {
  const out = fs.openSync(path.join(l.logs, "server.log"), "a");
  return spawn(process.execPath, [path.join(PROGRAM_DIR, "server", "dist", "index.js")], {
    cwd: path.join(PROGRAM_DIR, "server"),
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
}

async function waitUntilUp(exited, seconds = 90) {
  let gone = false;
  exited.then(() => (gone = true));
  for (let i = 0; i < seconds * 2 && !gone; i++) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function start() {
  const { layout, ensureFolders, programVersion, stamp } = await lib("paths.mjs");
  const logging = await lib("log.mjs");
  const { latestNotes, writeJson } = await lib("update.mjs");
  const l = layout();
  ensureFolders(l);
  logging.openLog(l.logs);
  logFn = logging.log;
  const version = programVersion(PROGRAM_DIR);
  log(`Financial Vault ${version} (installed program) — data folder: ${l.root}`);

  setMenu(l);
  win = createWindow();
  status("Starting Financial Vault…");

  if (await ping()) {
    return problem(
      "Another Financial Vault is already open — probably the earlier version, started from its folder. Close its window, wait a minute, then start Financial Vault again."
    );
  }

  await ensureRecords(l);

  // A new version was just installed: a copy of the records before their layout changes.
  const marker = path.join(l.root, ".installed-version");
  const before = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : null;
  const hadRecords = fs.existsSync(l.db) && fs.statSync(l.db).size > 0;
  if (before !== version && hadRecords) {
    fs.mkdirSync(l.backups, { recursive: true });
    const backup = path.join(l.backups, `financevault-before-installing-${version}-${stamp()}.db`);
    fs.copyFileSync(l.db, backup);
    log(`Backed up your records to ${backup}`);
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    DATABASE_URL: `file:${l.db.replace(/\\/g, "/")}`,
    STORAGE_DIR: l.documents,
    FV_DATA_DIR: l.root,
    FV_SUPERVISED: "1",
    FV_INSTALLED: "1",
    // The window closing is what stops it here.
    FV_EXIT_WHEN_CLOSED: "0",
    FV_TESSDATA_DIR: ensureOcrData(l),
    // The database tools otherwise report their use to Prisma over the internet.
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    ...engineEnv(),
  };

  try {
    status(hadRecords ? "Bringing your records up to this version…" : "Setting up your records…");
    const schema = path.join(PROGRAM_DIR, "server", "prisma", "schema.prisma");
    await runNode("Updating the records' layout", [path.join(PROGRAM_DIR, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", schema], env);
    await runNode("Setting up the standard lists", [path.join(PROGRAM_DIR, "server", "prisma", "seed.mjs")], env);
  } catch (e) {
    return problem(`${e.message}. A copy of your records from before is in the Backups folder.`);
  }

  if (before !== version) {
    if (hadRecords) {
      let notes = null;
      try {
        notes = latestNotes(fs.readFileSync(path.join(PROGRAM_DIR, "RELEASE-NOTES.md"), "utf8"));
      } catch {
        /* no notes */
      }
      writeJson(l.lastUpdate, { kind: "UPDATED", from: before ?? "the earlier version", to: version, notes, at: new Date().toISOString(), seen: false });
    }
    fs.writeFileSync(marker, version);
  }

  for (;;) {
    status("Opening Financial Vault…");
    server = startServer(env, l);
    const exited = new Promise((resolve) => server.on("exit", (code) => resolve(code)));
    if (!(await waitUntilUp(exited))) return problem("The app didn't start.");
    log(`Financial Vault is running at ${HOME}`);
    if (!win || win.isDestroyed()) return;
    await win.loadURL(HOME);
    if (SMOKE) return smokeTest(l);
    const code = await exited;
    if (quitting) return;
    if (code === RESTART_CODE) {
      log("Restarting the app…");
      continue;
    }
    return problem(`Financial Vault stopped unexpectedly (code ${code}).`);
  }
}

// ---------------------------------------------------------------------------
// The installer's own check (FV_SMOKE_TEST=1): the first screen shows, a
// passcode can be set, and the records answer.

async function smokeTest(l) {
  const result = { ok: false, dataFolder: l.root, steps: {} };
  try {
    await new Promise((r) => setTimeout(r, 3000));
    const text = await win.webContents.executeJavaScript("document.body.innerText");
    result.steps.firstScreen = text.slice(0, 200);
    const call = async (method, p, body, cookie) => {
      const res = await fetch(`${HOME}/api${p}`, {
        method,
        headers: { "content-type": "application/json", origin: HOME, ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], body: await res.json().catch(() => null) };
    };
    // A new data folder: set a passcode. Existing records (an upgrade test): unlock them.
    const vault = await call("GET", "/vault/status");
    const opened = vault.body?.configured
      ? await call("POST", "/vault/unlock", { passcode: process.env.FV_SMOKE_PASSCODE || "" })
      : await call("POST", "/vault/setup", { passcode: "smoke test passcode" });
    result.steps.opened = opened.status;
    const cookie = opened.cookie;
    const people = await call("GET", "/people", null, cookie);
    result.steps.people = people.status;
    const years = await call("GET", "/financial-years", null, cookie);
    result.steps.financialYears = Array.isArray(years.body) ? years.body.length : years.status;
    const info = await call("GET", "/app/info", null, cookie);
    result.steps.info = info.body;
    result.steps.ocrData = fs.existsSync(path.join(l.root, ".ocr-language-data", "eng.traineddata"));
    result.steps.backups = fs.readdirSync(l.backups);

    // Reading a scanned document: a picture of some words, drawn in the window, uploaded.
    const dataUrl = await win.webContents.executeJavaScript(`(() => {
      const c = document.createElement("canvas"); c.width = 900; c.height = 200;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 900, 200);
      x.fillStyle = "#000"; x.font = "bold 64px Arial, Helvetica, sans-serif"; x.fillText("TAX INVOICE 4821", 30, 120);
      return c.toDataURL("image/png");
    })()`);
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(dataUrl.split(",")[1], "base64")], { type: "image/png" }), `smoke-invoice-${Date.now()}.png`);
    const up = await fetch(`${HOME}/api/documents/upload`, { method: "POST", headers: { origin: HOME, cookie }, body: form });
    const uploaded = await up.json().catch(() => null);
    result.steps.upload = up.status;
    const doc = uploaded?.document ? await call("GET", `/documents/${uploaded.document.id}`, null, cookie) : null;
    result.steps.ocrText = String(doc?.body?.ocrText ?? "").slice(0, 100);
    result.ok =
      /passcode/i.test(text) &&
      [200, 201].includes(opened.status) &&
      people.status === 200 &&
      result.steps.financialYears > 0 &&
      info.body?.installed === true &&
      result.steps.ocrData &&
      /INVOICE\s*4821/i.test(result.steps.ocrText);
  } catch (e) {
    result.error = String(e && e.stack ? e.stack : e);
  }
  finishSmoke(result);
}

function finishSmoke(result) {
  const out = process.env.FV_SMOKE_RESULT;
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  quitting = true;
  if (server && server.exitCode === null) server.kill();
  app.exit(result.ok ? 0 : 1);
}
