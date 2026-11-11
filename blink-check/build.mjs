// Builds Blink Check into one self-contained HTML file (works offline; fonts fall back to the system's).
//   node blink-check/build.mjs
//   → dist/blink-check.html  the file to keep and send (Save a copy works here)
//   → dist/artifact.html     the same page without the document wrapper, for publishing on claude.ai
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, "src", f), "utf8");
const head = read("head.html");
const body = read("body.html");
// "</script" can't appear inside an inline script.
const script = (f) => `<script>\n${read(f).replace(/<\/script/gi, "<\\/script")}\n</script>`;
const scripts = `${script("engine.js")}\n${script("app.js")}`;

fs.mkdirSync(path.join(here, "dist"), { recursive: true });
const full = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
${scripts}
</body>
</html>
`;
fs.writeFileSync(path.join(here, "dist", "blink-check.html"), full);
fs.writeFileSync(path.join(here, "dist", "artifact.html"), `${head}\n${body}\n${scripts}\n`);
console.log(`dist/blink-check.html ${(full.length / 1024).toFixed(0)} KB`);
