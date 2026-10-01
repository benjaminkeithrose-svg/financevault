/**
 * The app window's link to the program. While a window is open, Financial
 * Vault keeps running; when the last one closes, it stops (when started by
 * the launcher). The browser reconnects by itself after an update restart.
 */
export function keepPresence() {
  if (typeof EventSource === "undefined") return;
  new EventSource("/api/app-window/presence");
}

/**
 * After an update is handed to the launcher: waits for the program to stop
 * and come back (as the new version, or the old one put back), then reloads.
 */
export async function waitForRestart(onTick?: (seconds: number) => void): Promise<void> {
  let wentDown = false;
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    onTick?.(Math.round((Date.now() - started) / 1000));
    try {
      const res = await fetch("/api/app-window/version", { cache: "no-store" });
      if (res.ok && wentDown) break;
      if (!res.ok) wentDown = true;
    } catch {
      wentDown = true;
    }
  }
  try {
    sessionStorage.setItem(RESTARTED, "1");
  } catch {
    /* only changes a message */
  }
  window.location.reload();
}

const RESTARTED = "fv-just-restarted";

/** True once, on the lock screen straight after an update restart. */
export function justRestarted(): boolean {
  try {
    const was = sessionStorage.getItem(RESTARTED) === "1";
    sessionStorage.removeItem(RESTARTED);
    return was;
  } catch {
    return false;
  }
}
