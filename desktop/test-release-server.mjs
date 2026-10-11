// A pretend GitHub release, for the Windows installer check: it offers the
// Setup that was just built as "version 99.0.0", the way GitHub's releases
// answer, so the installed program's automatic update can be tried from end
// to end without publishing anything.
//
//   node desktop/test-release-server.mjs <Setup.exe> <port>
//
// Point the program at it with FV_UPDATE_FEED=http://127.0.0.1:<port>/releases/latest

import fs from "node:fs";
import http from "node:http";
import { manifest, setupName } from "./release-files.mjs";

const [setup, port = "4199"] = process.argv.slice(2);
const VERSION = "99.0.0";
const base = `http://127.0.0.1:${port}`;
const update = JSON.stringify(manifest(setup, VERSION, `## ${VERSION} — test\n- A pretend release for the installer check.`));
const size = fs.statSync(setup).size;

http
  .createServer((req, res) => {
    if (req.url === "/releases/latest") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tag_name: `v${VERSION}`,
          body: "A pretend release for the installer check.",
          html_url: `${base}/releases/v${VERSION}`,
          assets: [
            { name: "update.json", browser_download_url: `${base}/download/update.json`, size: update.length },
            { name: setupName(VERSION), browser_download_url: `${base}/download/${setupName(VERSION)}`, size },
          ],
        })
      );
    } else if (req.url === "/download/update.json") {
      res.setHeader("content-type", "application/json");
      res.end(update);
    } else if (req.url === `/download/${setupName(VERSION)}`) {
      res.setHeader("content-length", String(size));
      fs.createReadStream(setup).pipe(res);
    } else {
      res.statusCode = 404;
      res.end();
    }
  })
  .listen(Number(port), "127.0.0.1", () => console.log(`Test release ${VERSION} at ${base}/releases/latest`));
