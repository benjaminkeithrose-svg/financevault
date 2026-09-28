// Makes the installable Financial Vault program.
//
//   cd desktop && npm install && npx install-electron --no   (once)
//   node build.mjs --win      → dist/Financial Vault Setup <version>.exe
//   node build.mjs --linux    → dist/linux-unpacked (used to test the program here)
//
// The program is the folder version's files, built, with only the libraries
// the app runs on (copied from this checkout, so the same versions as the
// tests used), the database engines for Windows, the language data for
// reading scanned documents, and Electron's main process (main.cjs). Nothing
// is built on the person's computer and Node.js isn't needed there.
//
//   --skip-app-build   use the server/dist and web/dist already built

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const STAGE = path.join(HERE, ".stage");
const APP = path.join(STAGE, "app");
const PROGRAM = path.join(STAGE, "program");
const OUT = path.join(HERE, "dist");
const CACHE = path.join(HERE, ".cache");

const args = new Set(process.argv.slice(2));
const target = args.has("--linux") ? "linux" : "win";
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const say = (m) => console.log(`\n== ${m}`);
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, a, cwd = ROOT, env = process.env) => execFileSync(cmd, a, { cwd, stdio: "inherit", env, shell: process.platform === "win32" });

// ---------------------------------------------------------------------------
// 1. The app, built.

if (!args.has("--skip-app-build")) {
  say("Building the app");
  run(npxCmd, ["--no", "prisma", "generate"], path.join(ROOT, "server"), { ...process.env, CHECKPOINT_DISABLE: "1" });
  run(npmCmd, ["run", "build"]);
}
for (const f of ["server/dist/index.js", "web/dist/index.html", "node_modules/.prisma/client/index.js"]) {
  if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`${f} is missing — build the app first.`);
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });
fs.mkdirSync(PROGRAM, { recursive: true });

function copy(rel, to = rel, filter = () => true) {
  const from = path.join(ROOT, rel);
  fs.cpSync(from, path.join(PROGRAM, to), { recursive: true, filter: (src) => filter(src) });
}

say("Copying the program's files");
copy("server/dist");
copy("server/package.json");
copy("server/prisma/schema.prisma");
copy("server/prisma/migrations");
copy("web/dist");
copy("launcher/lib");
copy("launcher/icons");
copy("reference");
copy("RELEASE-NOTES.md");
// The program's version, and nothing that would make npm treat it as the development workspace.
fs.writeFileSync(path.join(PROGRAM, "package.json"), JSON.stringify({ name: "financevault", version, private: true, description: "Financial Vault (installed program)" }, null, 2));

// The standard lists (financial years, tax categories): the seed script, bundled so it runs without tsx.
say("Bundling the standard lists");
const require = createRequire(path.join(HERE, "package.json"));
const esbuild = require("esbuild");
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "server", "prisma", "seed.ts")],
  outfile: path.join(PROGRAM, "server", "prisma", "seed.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@prisma/client"],
  logLevel: "warning",
});

// ---------------------------------------------------------------------------
// 2. The libraries the app runs on: the server's dependencies and the
//    database tool, with everything they need, copied from this checkout.

say("Copying the libraries the app runs on");
const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "server", "package.json"), "utf8"));
const wanted = [...Object.keys(serverPkg.dependencies), "prisma"];
const found = new Map(); // package dir → true

function resolvePkg(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.resolve(dir) === ROOT) return null;
    dir = path.dirname(dir);
  }
}

function collect(name, fromDir, optional = false) {
  const dir = resolvePkg(name, fromDir);
  if (!dir) {
    if (optional) return;
    throw new Error(`Library ${name} (needed from ${path.relative(ROOT, fromDir) || "."}) isn't installed — run npm install first.`);
  }
  if (found.has(dir)) return;
  found.set(dir, true);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const d of Object.keys(pkg.dependencies ?? {})) collect(d, dir);
  for (const d of Object.keys(pkg.optionalDependencies ?? {})) collect(d, dir, true);
}
for (const name of wanted) collect(name, path.join(ROOT, "server"));

const NATIVE_ENGINE = /(^|[\\/])(lib)?query_engine[^\\/]*\.node$|(^|[\\/])(query-engine|schema-engine)[^\\/]*$|\.(dll|so|dylib)\.node$/;
for (const dir of found.keys()) {
  const rel = path.relative(ROOT, dir);
  fs.cpSync(dir, path.join(PROGRAM, rel), {
    recursive: true,
    // Its own node_modules are copied package by package; engines come from step 3.
    filter: (src) => !path.relative(dir, src).split(path.sep).includes("node_modules") && !NATIVE_ENGINE.test(path.basename(src)),
  });
}
// The database library made for this app's records (prisma generate).
fs.cpSync(path.join(ROOT, "node_modules", ".prisma"), path.join(PROGRAM, "node_modules", ".prisma"), {
  recursive: true,
  filter: (src) => !NATIVE_ENGINE.test(path.basename(src)),
});
console.log(`${found.size} libraries`);

// ---------------------------------------------------------------------------
// 3. The database engines for the target computer, from Prisma's own site
//    (checked against its checksums), and the language data for reading
//    scanned documents.

function download(url, file) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  execFileSync(process.platform === "win32" ? "curl.exe" : "curl", ["-sSfL", "--retry", "3", "-o", part, url], { stdio: "inherit" });
  fs.renameSync(part, file);
  return file;
}

say("Fetching the database engines for this kind of computer");
const enginesVersion = createRequire(path.join(ROOT, "server", "package.json"))("@prisma/engines-version").enginesVersion;
const ENGINE_FILES = {
  win: { dir: "windows", query: ["query_engine.dll.node", "query_engine-windows.dll.node"], schema: ["schema-engine.exe", "schema-engine-windows.exe"] },
  linux: {
    dir: "debian-openssl-3.0.x",
    query: ["libquery_engine.so.node", "libquery_engine-debian-openssl-3.0.x.so.node"],
    schema: ["schema-engine", "schema-engine-debian-openssl-3.0.x"],
  },
}[target];
const enginesDir = path.join(PROGRAM, "engines");
fs.mkdirSync(enginesDir, { recursive: true });
for (const [remote, local] of [ENGINE_FILES.query, ENGINE_FILES.schema]) {
  const base = `https://binaries.prisma.sh/all_commits/${enginesVersion}/${ENGINE_FILES.dir}/${remote}`;
  const gz = download(`${base}.gz`, path.join(CACHE, "engines", enginesVersion, ENGINE_FILES.dir, `${remote}.gz`));
  const sums = download(`${base}.sha256`, path.join(CACHE, "engines", enginesVersion, ENGINE_FILES.dir, `${remote}.sha256`));
  const bytes = zlib.gunzipSync(fs.readFileSync(gz));
  const expected = fs.readFileSync(sums, "utf8").trim().split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (expected !== actual) throw new Error(`${remote} doesn't match Prisma's checksum — delete desktop/.cache and try again.`);
  fs.writeFileSync(path.join(enginesDir, local), bytes, { mode: 0o755 });
}
fs.writeFileSync(path.join(enginesDir, "engines.json"), JSON.stringify({ version: enginesVersion, queryEngine: ENGINE_FILES.query[1], schemaEngine: ENGINE_FILES.schema[1] }, null, 2));

say("Adding the language data for reading scanned documents");
const localOcr = path.join(ROOT, "server", "storage", "tessdata", "eng.traineddata.gz");
const ocr = fs.existsSync(localOcr)
  ? localOcr
  : download("https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", path.join(CACHE, "tessdata", "eng.traineddata.gz"));
fs.mkdirSync(path.join(PROGRAM, "tessdata"), { recursive: true });
fs.copyFileSync(ocr, path.join(PROGRAM, "tessdata", "eng.traineddata.gz"));

// ---------------------------------------------------------------------------
// 4. Electron's side: the main process, and the Setup file.

fs.copyFileSync(path.join(HERE, "main.cjs"), path.join(APP, "main.cjs"));
fs.writeFileSync(
  path.join(APP, "package.json"),
  JSON.stringify(
    {
      name: "financial-vault",
      productName: "Financial Vault",
      version,
      description: "Financial Vault — private, local-first personal finance and documents",
      author: "Financial Vault",
      license: "UNLICENSED",
      main: "main.cjs",
    },
    null,
    2
  )
);

say(`Making the ${target === "win" ? "Windows Setup file" : "Linux test build"}`);
const { build, Platform, Arch } = require("electron-builder");
const electronVersion = JSON.parse(fs.readFileSync(path.join(HERE, "node_modules", "electron", "package.json"), "utf8")).version;
const icons = path.join(ROOT, "launcher", "icons");
const localElectron = path.join(HERE, "node_modules", "electron", "dist");
const sameKind = (target === "win") === (process.platform === "win32") && fs.existsSync(localElectron);
await build({
  targets: target === "win" ? Platform.WINDOWS.createTarget(["nsis"], Arch.x64) : Platform.LINUX.createTarget(["dir"], Arch.x64),
  config: {
    appId: "au.financevault.app",
    productName: "Financial Vault",
    copyright: "Financial Vault",
    directories: { app: APP, output: OUT },
    electronVersion,
    ...(sameKind ? { electronDist: localElectron } : {}),
    asar: true,
    // English only: Chromium's other 50-odd languages add about 45MB.
    electronLanguages: ["en-US", "en-GB"],
    compression: "maximum",
    npmRebuild: false,
    nodeGypRebuild: false,
    // From the stage folder, not the program folder itself: electron-builder leaves out a node_modules at the top of what it copies.
    extraResources: [{ from: STAGE, to: ".", filter: ["program/**/*"] }],
    win: { target: [{ target: "nsis", arch: ["x64"] }], icon: path.join(icons, "financevault.ico") },
    nsis: {
      // Double-click and it's installed, for this Windows user, with no questions and no administrator password.
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: "always",
      createStartMenuShortcut: true,
      shortcutName: "Financial Vault",
      runAfterFinish: true,
      deleteAppDataOnUninstall: false,
      installerIcon: path.join(icons, "financevault.ico"),
      uninstallerIcon: path.join(icons, "financevault.ico"),
      uninstallDisplayName: "Financial Vault",
      artifactName: "Financial Vault Setup ${version}.${ext}",
    },
    linux: { target: [{ target: "dir", arch: ["x64"] }], icon: path.join(icons, "financevault.png"), executableName: "financial-vault", category: "Office" },
    publish: null,
  },
});
say(`Done: ${OUT}`);
