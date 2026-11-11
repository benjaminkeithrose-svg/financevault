import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataFolder, dataPaths, installed, programVersion } from "./appInfo.js";

/**
 * Automatic updates for the installed program (Financial Vault Setup).
 *
 * Each new version is published on the project's GitHub page as a Release:
 * the Setup file, and update.json saying its version, size and SHA-512
 * checksum. Once a day (a switch in Settings turns it off), the program asks
 * GitHub "what's the latest release?" — nothing else is sent, and nothing
 * about the person or their records. When there's a newer version, it waits
 * for "Download and install": the Setup is downloaded from GitHub only,
 * checked against its size and checksum, the records are backed up, and the
 * program hands over to the desktop part (desktop/main.cjs), which checks
 * the file again, runs it silently and starts the new version.
 *
 * Only a newer version is ever offered, so an older release can't be pushed
 * back on. The folder version still updates from a ZIP.
 */

export const REPO = "benjaminkeithrose-svg/financevault";
/** The update check can be pointed elsewhere for the installer's own tests. */
const FEED = () => process.env.FV_UPDATE_FEED || `https://api.github.com/repos/${REPO}/releases/latest`;
/** Exit code asking the desktop part to run the downloaded Setup. */
export const INSTALL_CODE = 76;

const DAY = 24 * 60 * 60 * 1000;

export interface Available {
  version: string;
  notes: string | null;
  size: number;
  sha512: string;
  setupUrl: string;
  releaseUrl: string | null;
}

interface Stored {
  autoCheck: boolean;
  checkedAt: string | null;
  available: Available | null;
  laterFor: string | null; // "Later" pressed for this version: no reminder banner for it
  error: string | null;
}

export interface InstallRequest {
  version: string;
  file: string;
  size: number;
  sha512: string;
  requestedAt: string;
}

type Job = { state: "idle" } | { state: "checking" } | { state: "downloading"; received: number; total: number } | { state: "installing" } | { state: "failed"; error: string };
let job: Job = { state: "idle" };

function files() {
  const root = dataFolder();
  if (!root) return null;
  const updates = dataPaths(root).updates;
  return { root, updates, state: path.join(updates, "online-update.json"), request: path.join(updates, "install-setup.request.json") };
}

function readStored(): Stored {
  const f = files();
  const empty: Stored = { autoCheck: true, checkedAt: null, available: null, laterFor: null, error: null };
  if (!f) return empty;
  try {
    return { ...empty, ...(JSON.parse(fs.readFileSync(f.state, "utf8")) as Partial<Stored>) };
  } catch {
    return empty;
  }
}

function writeStored(patch: Partial<Stored>): Stored {
  const f = files();
  const next = { ...readStored(), ...patch };
  if (!f) return next;
  fs.mkdirSync(f.updates, { recursive: true });
  fs.writeFileSync(f.state, JSON.stringify(next, null, 2));
  return next;
}

/** "1.10.2" > "1.9.9": numbers compared part by part. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Downloads come from GitHub's release files for this project only (or the test feed's own address). */
function allowedDownload(url: string): boolean {
  const feed = process.env.FV_UPDATE_FEED;
  if (feed) return url.startsWith(new URL(feed).origin + "/");
  return url.startsWith(`https://github.com/${REPO}/releases/download/`);
}

const headers = () => ({ "user-agent": "Financial-Vault-updater", accept: "application/vnd.github+json" });

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

/** Asks GitHub for the latest release; remembers what it found. */
export async function checkNow(): Promise<Stored> {
  if (!installed()) throw new Error("Automatic updates are for the installed program.");
  job = { state: "checking" };
  try {
    const release = (await getJson(FEED())) as {
      tag_name?: string;
      body?: string | null;
      html_url?: string;
      assets?: Array<{ name: string; browser_download_url: string; size: number }>;
    } | null;
    let available: Available | null = null;
    const manifestAsset = release?.assets?.find((a) => a.name === "update.json");
    if (release && manifestAsset && allowedDownload(manifestAsset.browser_download_url)) {
      const manifest = (await getJson(manifestAsset.browser_download_url)) as { version?: string; file?: string; size?: number; sha512?: string; notes?: string } | null;
      const setup = release.assets?.find((a) => a.name === manifest?.file);
      if (
        manifest?.version &&
        manifest.sha512 &&
        /^[0-9a-f]{128}$/.test(manifest.sha512) &&
        setup &&
        setup.size === manifest.size &&
        allowedDownload(setup.browser_download_url) &&
        isNewer(manifest.version, programVersion())
      ) {
        available = {
          version: manifest.version,
          notes: manifest.notes ?? release.body ?? null,
          size: setup.size,
          sha512: manifest.sha512,
          setupUrl: setup.browser_download_url,
          releaseUrl: release.html_url ?? null,
        };
      }
    }
    job = { state: "idle" };
    return writeStored({ checkedAt: new Date().toISOString(), available, error: null });
  } catch (e) {
    const error = `Couldn't reach GitHub to check for a new version (${(e as Error).message}). It'll try again later.`;
    job = { state: "idle" };
    return writeStored({ checkedAt: new Date().toISOString(), error });
  }
}

/** Once a day, when switched on. Quiet when offline. */
export function startDailyCheck() {
  if (!installed() || !dataFolder()) return;
  const tick = () => {
    const s = readStored();
    const last = s.checkedAt ? Date.parse(s.checkedAt) : 0;
    if (s.autoCheck && Date.now() - last > DAY - 60 * 60 * 1000) void checkNow().catch(() => {});
  };
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}

export function setAutoCheck(on: boolean) {
  return writeStored({ autoCheck: on });
}

export function remindLater(version: string) {
  return writeStored({ laterFor: version });
}

export function onlineStatus() {
  const s = readStored();
  const current = programVersion();
  // Installed since the check: nothing to offer.
  const available = s.available && isNewer(s.available.version, current) ? s.available : null;
  return {
    enabled: installed() && !!dataFolder(),
    autoCheck: s.autoCheck,
    checkedAt: s.checkedAt,
    error: s.error,
    available: available && { version: available.version, notes: available.notes, size: available.size, releaseUrl: available.releaseUrl },
    remind: !!available && s.laterFor !== available.version,
    job,
  };
}

async function sha512Of(file: string): Promise<string> {
  const hash = crypto.createHash("sha512");
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file)
      .on("data", (c) => hash.update(c))
      .on("end", () => resolve())
      .on("error", reject);
  });
  return hash.digest("hex");
}

/** The file matches what the release said: its size and SHA-512 checksum. */
export async function matches(file: string, size: number, sha512: string): Promise<boolean> {
  if (!fs.existsSync(file) || fs.statSync(file).size !== size) return false;
  return (await sha512Of(file)) === sha512;
}

/**
 * Downloads the Setup (unless it's already here and checks out), checks it,
 * backs up the records with `backup`, and leaves a request for the desktop
 * part to run it. Returns once it's ready; the caller then exits.
 */
export async function prepareInstall(backup: (version: string) => Promise<string>): Promise<InstallRequest> {
  const f = files();
  const s = readStored();
  const a = s.available;
  if (!installed() || !f) throw new Error("Automatic updates are for the installed program.");
  if (!a || !isNewer(a.version, programVersion())) throw new Error("There's no newer version to install. Check again first.");
  if (!allowedDownload(a.setupUrl)) throw new Error("That download isn't from this project's GitHub page.");
  if (job.state === "downloading" || job.state === "installing") throw new Error("An update is already being installed.");

  const file = path.join(f.updates, `Financial Vault Setup ${a.version}.exe`);
  job = { state: "downloading", received: 0, total: a.size };
  try {
    fs.mkdirSync(f.updates, { recursive: true });
    if (!(await matches(file, a.size, a.sha512))) {
      const res = await fetch(a.setupUrl, { headers: { "user-agent": "Financial-Vault-updater" }, signal: AbortSignal.timeout(30 * 60_000) });
      if (!res.ok || !res.body) throw new Error(`the download failed (GitHub answered ${res.status})`);
      const part = `${file}.part`;
      const out = fs.createWriteStream(part);
      let received = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        received += chunk.length;
        if (received > a.size) throw new Error("the download was bigger than it should be");
        if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
        job = { state: "downloading", received, total: a.size };
      }
      await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
      if (!(await matches(part, a.size, a.sha512))) {
        fs.rmSync(part, { force: true });
        throw new Error("the downloaded file didn't match its checksum, so it wasn't used");
      }
      fs.renameSync(part, file);
    }
    job = { state: "installing" };
    await backup(a.version);
    const request: InstallRequest = { version: a.version, file, size: a.size, sha512: a.sha512, requestedAt: new Date().toISOString() };
    fs.writeFileSync(f.request, JSON.stringify(request, null, 2));
    return request;
  } catch (e) {
    const error = `Version ${a.version} couldn't be installed: ${(e as Error).message}. Nothing was changed.`;
    job = { state: "failed", error };
    throw new Error(error);
  }
}
