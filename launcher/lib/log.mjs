import fs from "node:fs";
import path from "node:path";

let file = null;

/** Messages go to the window (when there is one) and to Logs/launcher.log. */
export function openLog(logsDir) {
  fs.mkdirSync(logsDir, { recursive: true });
  file = path.join(logsDir, "launcher.log");
  // Keep the log from growing forever: start afresh past 1MB.
  try {
    if (fs.statSync(file).size > 1_000_000) fs.renameSync(file, `${file}.old`);
  } catch {
    /* no log yet */
  }
}

export function log(message) {
  const line = `${new Date().toISOString()}  ${message}`;
  console.log(message);
  if (file) {
    try {
      fs.appendFileSync(file, line + "\n");
    } catch {
      /* logging never stops the app */
    }
  }
}
