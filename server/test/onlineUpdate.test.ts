import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkNow, isNewer, onlineStatus, prepareInstall, remindLater, setAutoCheck } from "../src/services/onlineUpdate.js";
import { programVersion } from "../src/services/appInfo.js";

// Automatic updates for the installed program, against a pretend GitHub
// release: only a newer version is offered, only a file that matches its
// checksum is used, and downloads come from the release's own address.

describe("automatic updates from GitHub releases", () => {
  let server: http.Server;
  let base = "";
  let dataDir = "";
  const saved = { ...process.env };
  const setup = Buffer.from("pretend Setup file ".repeat(5000));
  let release: { version: string; file: Buffer; tamper?: boolean; setupUrl?: string } = { version: "99.1.0", file: setup };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const name = `Financial-Vault-Setup-${release.version}.exe`;
      const sha512 = crypto.createHash("sha512").update(release.file).digest("hex");
      if (req.url === "/releases/latest") {
        res.end(
          JSON.stringify({
            tag_name: `v${release.version}`,
            body: "notes",
            html_url: `${base}/r`,
            assets: [
              { name: "update.json", browser_download_url: `${base}/download/update.json`, size: 1 },
              { name, browser_download_url: release.setupUrl ?? `${base}/download/${name}`, size: release.file.length },
            ],
          })
        );
      } else if (req.url === "/download/update.json") {
        res.end(JSON.stringify({ version: release.version, file: name, size: release.file.length, sha512, notes: `## ${release.version}\n- New things` }));
      } else if (req.url === `/download/${name}`) {
        const body = Buffer.from(release.file);
        if (release.tamper) body[10] ^= 0xff;
        res.end(body);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-online-"));
    process.env.FV_INSTALLED = "1";
    process.env.FV_DATA_DIR = dataDir;
    process.env.FV_UPDATE_FEED = `${base}/releases/latest`;
    release = { version: "99.1.0", file: setup };
  });

  afterAll(() => {
    server.close();
    for (const k of ["FV_INSTALLED", "FV_DATA_DIR", "FV_UPDATE_FEED"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("compares versions number by number", () => {
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("v2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("1.7.1", "1.7.1")).toBe(false);
    expect(isNewer("1.7.0", "1.7.1")).toBe(false);
  });

  it("offers a newer version, downloads it, checks it and leaves it for the desktop part to run", async () => {
    await checkNow();
    let s = onlineStatus();
    expect(s).toMatchObject({ enabled: true, autoCheck: true, error: null, remind: true, available: { version: "99.1.0", size: setup.length } });

    // "Later" hides the reminder for this version only.
    remindLater("99.1.0");
    expect(onlineStatus().remind).toBe(false);

    const backups: string[] = [];
    const request = await prepareInstall(async (v) => {
      backups.push(v);
      return "backup.db";
    });
    expect(backups).toEqual(["99.1.0"]);
    expect(fs.readFileSync(request.file)).toEqual(setup);
    expect(path.basename(request.file)).toBe("Financial Vault Setup 99.1.0.exe");
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, "Updates", "install-setup.request.json"), "utf8"));
    expect(saved).toMatchObject({ version: "99.1.0", size: setup.length });
    expect(onlineStatus().job.state).toBe("installing");

    // The switch.
    setAutoCheck(false);
    s = onlineStatus();
    expect(s.autoCheck).toBe(false);
  });

  it("never uses a file that doesn't match its checksum", async () => {
    release = { version: "99.2.0", file: setup, tamper: true };
    await checkNow();
    await expect(prepareInstall(async () => "b")).rejects.toThrow(/didn't match its checksum/);
    expect(fs.existsSync(path.join(dataDir, "Updates", "Financial Vault Setup 99.2.0.exe"))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "Updates", "install-setup.request.json"))).toBe(false);
    expect(onlineStatus().job).toMatchObject({ state: "failed" });
  });

  it("offers nothing that isn't newer, or that downloads from somewhere else", async () => {
    release = { version: programVersion(), file: setup };
    await checkNow();
    expect(onlineStatus().available).toBeNull();

    release = { version: "99.3.0", file: setup, setupUrl: "https://example.com/Financial-Vault-Setup-99.3.0.exe" };
    await checkNow();
    expect(onlineStatus().available).toBeNull();
  });

  it("says so, quietly, when GitHub can't be reached", async () => {
    process.env.FV_UPDATE_FEED = "http://127.0.0.1:9/releases/latest";
    await checkNow();
    expect(onlineStatus().error).toMatch(/Couldn't reach GitHub/);
  });
});
