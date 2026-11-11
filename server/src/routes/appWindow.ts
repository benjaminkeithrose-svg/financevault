import { Router } from "express";
import { programVersion } from "../services/appInfo.js";

/**
 * Reachable while locked: the app window's open connection, and the version
 * (so a window waiting on an update knows when the new one is up). Neither
 * says anything about the records.
 *
 * When started by the launcher, Financial Vault stops once no window has
 * been open for a little while — closing the window closes the app. The
 * pause covers a page reload, and a computer waking from sleep.
 */
export const appWindowRouter = Router();

const CLOSE_AFTER_MS = Number(process.env.FV_CLOSE_AFTER_MS) || 45_000;
const FIRST_WINDOW_MS = 5 * 60_000;
let open = 0;
let timer: NodeJS.Timeout | null = null;

function scheduleExit(ms: number) {
  if (process.env.FV_EXIT_WHEN_CLOSED !== "1") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (open === 0) {
      console.log("The Financial Vault window was closed — stopping.");
      process.exit(0);
    }
  }, ms);
  timer.unref?.();
}

// Nobody ever opened a window (it failed to open, say): don't run forever.
scheduleExit(FIRST_WINDOW_MS);

appWindowRouter.get("/version", (_req, res) => {
  res.json({ version: programVersion() });
});

appWindowRouter.get("/presence", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write(`data: ${JSON.stringify({ version: programVersion() })}\n\n`);
  open++;
  if (timer) clearTimeout(timer);
  const keepAlive = setInterval(() => res.write(": still here\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    open = Math.max(0, open - 1);
    if (open === 0) scheduleExit(CLOSE_AFTER_MS);
  });
});
