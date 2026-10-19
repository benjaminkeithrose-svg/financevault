import type { NextFunction, Request, Response } from "express";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  // "[::1]:4000" keeps its brackets; "localhost:4000" drops the port.
  const match = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim().toLowerCase());
  return match ? match[1] : null;
}

/**
 * Refuses any request not addressed to this machine by a loopback name.
 *
 * Binding to loopback stops other devices connecting, but not DNS rebinding:
 * a website can point its own domain at 127.0.0.1, and the browser will then
 * happily send that site's requests here. Those requests still carry the
 * attacker's hostname in the Host header, which is what this checks.
 */
export function requireLoopbackHost(req: Request, res: Response, next: NextFunction) {
  const hostname = hostnameOf(req.headers.host);
  if (!hostname || !LOOPBACK_HOSTNAMES.has(hostname)) {
    res.status(403).json({ error: "Financial Vault only answers requests addressed to this computer." });
    return;
  }
  next();
}

/**
 * Rejects state-changing requests that a different origin tried to make.
 *
 * The session cookie is SameSite=Strict, but "same site" ignores the port —
 * so a page served by some other program on localhost would still count.
 * Browsers always send Origin on cross-origin POST/PUT/DELETE, so comparing
 * it to Host closes that gap.
 */
export function rejectCrossOriginWrites(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    res.status(403).json({ error: "Request refused." });
    return;
  }
  if (originHost !== (req.headers.host ?? "").toLowerCase()) {
    res.status(403).json({ error: "Request refused — it came from another website." });
    return;
  }
  next();
}

/**
 * Stops other sites framing the app (so a passcode can't be typed into a
 * disguised copy of it) and turns off MIME sniffing and referrers.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}
