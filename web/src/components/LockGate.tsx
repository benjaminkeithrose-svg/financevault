import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

type Status = { configured: boolean; unlocked: boolean; minPasscodeLength: number; idleLockMinutes: number };
type Screen = "loading" | "setup" | "recoveryKey" | "unlock" | "recover" | "unlocked";

const LOCK_EVENT = "fv-locked";

// Any API call answered 401 means the server has locked (idle timeout,
// another tab pressed Lock, or a restart). Catching it here, once, covers
// every fetch in the app — including the raw upload/download calls that
// don't go through the shared request helper.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await originalFetch(input, init);
  if (res.status === 401) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.origin).pathname;
    if (path.startsWith("/api/") && !path.startsWith("/api/vault/")) {
      window.dispatchEvent(new Event(LOCK_EVENT));
    }
  }
  return res;
};

async function vaultPost(path: string, body?: unknown) {
  const res = await originalFetch(`/api/vault/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const wait = data.retryAfterSeconds ? ` (${data.retryAfterSeconds}s)` : "";
    throw new Error((data.error || `Request failed: ${res.status}`) + wait);
  }
  return data;
}

export async function lockApp() {
  await vaultPost("lock").catch(() => {});
  window.dispatchEvent(new Event(LOCK_EVENT));
}

/**
 * Nothing inside renders until the vault is unlocked. Locking unmounts the
 * whole app, so figures that were on screen are gone rather than sitting
 * behind an overlay.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [issuedRecoveryKey, setIssuedRecoveryKey] = useState<string | null>(null);
  const [savedIt, setSavedIt] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastInput = useRef(Date.now());

  const refresh = useCallback(async () => {
    const res = await originalFetch("/api/vault/status");
    const s: Status = await res.json();
    setStatus(s);
    setScreen(!s.configured ? "setup" : s.unlocked ? "unlocked" : "unlock");
  }, []);

  useEffect(() => {
    refresh().catch(() => setError("Couldn't reach Financial Vault. Is it still running?"));
  }, [refresh]);

  useEffect(() => {
    const onLocked = () => {
      setPasscode("");
      setConfirmPasscode("");
      setError(null);
      setScreen((current) => (current === "unlocked" ? "unlock" : current));
    };
    window.addEventListener(LOCK_EVENT, onLocked);
    return () => window.removeEventListener(LOCK_EVENT, onLocked);
  }, []);

  // Idle handling runs on both sides. The browser locks after the idle
  // period of no input, clearing the screen; while there IS input, it pings
  // the server so reading a page for a while isn't mistaken for being away.
  useEffect(() => {
    if (screen !== "unlocked" || !status) return;
    const markInput = () => {
      lastInput.current = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, markInput, { passive: true }));

    let lastPing = Date.now();
    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastInput.current;
      if (idleMs > status.idleLockMinutes * 60_000) {
        void lockApp();
        return;
      }
      if (lastInput.current > lastPing) {
        lastPing = Date.now();
        void originalFetch("/api/vault/status");
      }
    }, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markInput));
      window.clearInterval(timer);
    };
  }, [screen, status]);

  const minLength = status?.minPasscodeLength ?? 8;

  async function submitSetup() {
    if (passcode.length < minLength) return setError(`Use at least ${minLength} characters.`);
    if (passcode !== confirmPasscode) return setError("Those two passcodes don't match.");
    setBusy(true);
    setError(null);
    try {
      const { recoveryKey } = await vaultPost("setup", { passcode });
      setIssuedRecoveryKey(recoveryKey);
      setPasscode("");
      setConfirmPasscode("");
      setScreen("recoveryKey");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitUnlock() {
    setBusy(true);
    setError(null);
    try {
      await vaultPost("unlock", { passcode });
      setPasscode("");
      lastInput.current = Date.now();
      setScreen("unlocked");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRecover() {
    if (passcode.length < minLength) return setError(`Use at least ${minLength} characters.`);
    if (passcode !== confirmPasscode) return setError("Those two passcodes don't match.");
    setBusy(true);
    setError(null);
    try {
      await vaultPost("recover", { recoveryKey: recoveryKeyInput, newPasscode: passcode });
      setPasscode("");
      setConfirmPasscode("");
      setRecoveryKeyInput("");
      lastInput.current = Date.now();
      setScreen("unlocked");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (screen === "unlocked") return <>{children}</>;

  return (
    <div className="lock-screen">
      <div className="card lock-card">
        <h2 style={{ marginTop: 0 }}>Financial Vault</h2>

        {screen === "loading" && <p className="empty-state">{error ?? "Loading…"}</p>}

        {screen === "setup" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitSetup();
            }}
          >
            <p>Set a passcode to open Financial Vault.</p>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              It locks the app, and it's also the key that encrypts your tax file numbers and email app password.
              It's never stored anywhere — so choose something you'll remember, at least {minLength} characters. A
              short phrase works well.
            </p>
            <label>Passcode</label>
            <input type="password" autoFocus autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <label>Type it again</label>
            <input type="password" autoComplete="new-password" value={confirmPasscode} onChange={(e) => setConfirmPasscode(e.target.value)} />
            {error && <div className="message-box warning">{error}</div>}
            <button className="btn full" type="submit" disabled={busy} style={{ marginTop: 12 }}>
              {busy ? "Setting up…" : "Set passcode"}
            </button>
          </form>
        )}

        {screen === "recoveryKey" && issuedRecoveryKey && (
          <>
            <p>
              <strong>Write down this recovery key.</strong> If you ever forget your passcode, it's the only way back in
              without losing your encrypted details. It won't be shown again.
            </p>
            <div className="recovery-key">
              {/* Each group is unbreakable so a wrap can only fall between groups. */}
              {issuedRecoveryKey.split("-").map((group, i) => (
                <span key={i} style={{ whiteSpace: "nowrap" }}>
                  {i > 0 && "-"}
                  {group}
                </span>
              ))}
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                className="btn secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(issuedRecoveryKey).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              Keep it somewhere separate from this computer — on paper, or in a password manager. Anyone with this key
              can reset your passcode.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={savedIt} onChange={(e) => setSavedIt(e.target.checked)} />
              I've saved my recovery key
            </label>
            <button
              className="btn full"
              disabled={!savedIt}
              style={{ marginTop: 12 }}
              onClick={() => {
                setIssuedRecoveryKey(null);
                lastInput.current = Date.now();
                setScreen("unlocked");
              }}
            >
              Continue
            </button>
          </>
        )}

        {screen === "unlock" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitUnlock();
            }}
          >
            <p>Locked. Enter your passcode to continue.</p>
            <label>Passcode</label>
            <input type="password" autoFocus autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            {error && <div className="message-box warning">{error}</div>}
            <button className="btn full" type="submit" disabled={busy || !passcode} style={{ marginTop: 12 }}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              className="btn secondary full"
              style={{ marginTop: 8 }}
              onClick={() => {
                setError(null);
                setPasscode("");
                setScreen("recover");
              }}
            >
              Forgot passcode?
            </button>
          </form>
        )}

        {screen === "recover" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitRecover();
            }}
          >
            <p>Use the recovery key you saved when you set your passcode, and choose a new passcode.</p>
            <label>Recovery key</label>
            <input
              autoFocus
              autoComplete="off"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
            />
            <label>New passcode</label>
            <input type="password" autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <label>Type it again</label>
            <input type="password" autoComplete="new-password" value={confirmPasscode} onChange={(e) => setConfirmPasscode(e.target.value)} />
            {error && <div className="message-box warning">{error}</div>}
            <button className="btn full" type="submit" disabled={busy || !recoveryKeyInput} style={{ marginTop: 12 }}>
              {busy ? "Checking…" : "Reset passcode"}
            </button>
            <button
              type="button"
              className="btn secondary full"
              style={{ marginTop: 8 }}
              onClick={() => {
                setError(null);
                setScreen("unlock");
              }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
