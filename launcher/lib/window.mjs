import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "./log.mjs";

/**
 * Opens Financial Vault in its own window — no tabs, no address bar — using
 * Edge or Chrome's "app" mode (Edge is on every Windows computer). Its own
 * browser profile inside the data folder keeps it separate from your
 * everyday browsing. Without Edge or Chrome, it opens in the normal browser.
 */
function candidates() {
  if (process.env.FV_BROWSER) return [process.env.FV_BROWSER];
  if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES(X86)"], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [
      path.join(r, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(r, "Google", "Chrome", "Application", "chrome.exe"),
    ]);
  }
  if (process.platform === "darwin") {
    const apps = ["/Applications", path.join(os.homedir(), "Applications")];
    return apps.flatMap((a) => [
      path.join(a, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      path.join(a, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
      path.join(a, "Chromium.app", "Contents", "MacOS", "Chromium"),
    ]);
  }
  return ["/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

export function findAppBrowser() {
  return candidates().find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function openInDefaultBrowser(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

/** Opens the window. Returns "app-window" or "browser-tab". */
export function openWindow(url, profileDir) {
  const browser = findAppBrowser();
  if (browser) {
    try {
      fs.mkdirSync(profileDir, { recursive: true });
      spawn(
        browser,
        [`--app=${url}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900"],
        { detached: true, stdio: "ignore", windowsHide: false }
      ).unref();
      log(`Opened Financial Vault in its own window (${path.basename(browser)}).`);
      return "app-window";
    } catch (e) {
      log(`Couldn't open an app window (${e.message}); using the normal browser.`);
    }
  }
  openInDefaultBrowser(url);
  log("Opened Financial Vault in your browser.");
  return "browser-tab";
}
