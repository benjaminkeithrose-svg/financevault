import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "./log.mjs";

/**
 * A "Financial Vault" icon on the desktop (and, on Windows, in the Start
 * menu). It starts Financial Vault with no terminal window: on Windows
 * through a small hidden-window script, on a Mac as a little app. Made the
 * first time Financial Vault starts, and made again if the program folder
 * moves. Both point at this computer's own copy of Node.js.
 */

const run = (cmd, args, env) =>
  new Promise((resolve, reject) => execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true }, (err, out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(out))));

function windowsShortcut(programDir, l) {
  const launcherDir = path.join(l.root, ".launcher");
  fs.mkdirSync(launcherDir, { recursive: true });
  const vbs = path.join(launcherDir, "Start Financial Vault.vbs");
  // Runs the launcher with its window hidden (0). Paths are fixed when the icon is made.
  const q = (s) => s.replace(/"/g, '""');
  fs.writeFileSync(
    vbs,
    [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${q(programDir)}"`,
      `sh.Run """${q(process.execPath)}"" ""${q(path.join(programDir, "launcher", "launch.mjs"))}"" --hidden", 0, False`,
      "",
    ].join("\r\n")
  );
  const script = `
$ws = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $s = $ws.CreateShortcut((Join-Path $folder 'Financial Vault.lnk'))
  $s.TargetPath = Join-Path $env:SystemRoot 'System32\\wscript.exe'
  $s.Arguments = '"' + $env:FV_VBS + '"'
  $s.WorkingDirectory = $env:FV_PROGRAM
  $s.IconLocation = $env:FV_ICON
  $s.Description = 'Financial Vault'
  $s.Save()
}`;
  return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    FV_VBS: vbs,
    FV_PROGRAM: programDir,
    FV_ICON: path.join(programDir, "launcher", "icons", "financevault.ico"),
  });
}

function macApp(programDir) {
  const app = path.join(os.homedir(), "Desktop", "Financial Vault.app");
  fs.rmSync(app, { recursive: true, force: true });
  const contents = path.join(app, "Contents");
  fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  fs.mkdirSync(path.join(contents, "Resources"), { recursive: true });
  fs.copyFileSync(path.join(programDir, "launcher", "icons", "financevault.icns"), path.join(contents, "Resources", "financevault.icns"));
  fs.writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Financial Vault</string>
  <key>CFBundleDisplayName</key><string>Financial Vault</string>
  <key>CFBundleIdentifier</key><string>local.financevault.launcher</string>
  <key>CFBundleExecutable</key><string>financevault</string>
  <key>CFBundleIconFile</key><string>financevault</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`
  );
  const sh = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const exe = path.join(contents, "MacOS", "financevault");
  fs.writeFileSync(exe, `#!/bin/bash\ncd ${sh(programDir)}\nexec ${sh(process.execPath)} launcher/launch.mjs --hidden\n`);
  fs.chmodSync(exe, 0o755);
}

/** Makes the icon if it isn't there yet for this program folder. Never stops Financial Vault starting. */
export async function ensureDesktopIcon(programDir, l) {
  let made = "";
  try {
    made = fs.readFileSync(l.iconMade, "utf8").trim();
  } catch {
    /* not yet */
  }
  if (made === programDir) return false;
  try {
    if (process.platform === "win32") await windowsShortcut(programDir, l);
    else if (process.platform === "darwin") macApp(programDir);
    else return false;
    fs.writeFileSync(l.iconMade, programDir);
    log("Put a Financial Vault icon on the desktop — use it to start Financial Vault from now on.");
    return true;
  } catch (e) {
    log(`Couldn't make the desktop icon (${e.message}). Start Financial Vault from its folder instead.`);
    return false;
  }
}
