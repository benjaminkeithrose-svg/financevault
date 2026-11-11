import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, OnlineUpdate } from "../api/client.js";
import { ReleaseNotes } from "./ProgramUpdates.js";

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

function when(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Covers the page while the new version downloads and installs. */
function Installing({ status }: { status: OnlineUpdate }) {
  const job = status.job;
  const downloading = job.state === "downloading";
  const pct = downloading && job.total ? Math.min(100, Math.round((job.received / job.total) * 100)) : 0;
  return (
    <div className="overlay restarting" role="status">
      <div className="card lock-card">
        <h3 style={{ marginTop: 0 }}>{downloading ? `Downloading version ${status.available?.version}…` : `Installing version ${status.available?.version}…`}</h3>
        {downloading ? (
          <>
            <div className="progress" aria-label="Downloaded">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <p className="cap-explain">
              {mb(job.received)} of {mb(job.total)}. You can keep this window open while it downloads.
            </p>
          </>
        ) : (
          <p>
            Your records were backed up first. Financial Vault closes, installs the new version and opens again by itself — usually
            within a minute or two.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → Program and updates, in the installed program: checks the
 * project's GitHub page once a day (a switch), and installs a newer version
 * when asked.
 */
export function AutomaticUpdates() {
  const [status, setStatus] = useState<OnlineUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.app.online().then(setStatus).catch(() => setStatus(null));
  }, []);

  // While downloading or installing, follow along.
  const active = status?.job.state === "downloading" || status?.job.state === "installing";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      api.app
        .online()
        .then(setStatus)
        .catch(() => {
          /* closing to install: the window goes */
        });
    }, 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!status?.enabled) return null;
  if (active) return <Installing status={status} />;

  async function run(action: () => Promise<OnlineUpdate>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const a = status.available;
  return (
    <div style={{ marginTop: 8 }}>
      {a ? (
        <div className="message-box info">
          <strong>Version {a.version} is ready to install</strong> ({mb(a.size)} download).
          {a.notes && <ReleaseNotes notes={a.notes} />}
          <div className="toolbar" style={{ flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn" disabled={busy} onClick={() => run(api.app.installOnline)}>
              Download and install
            </button>
          </div>
          <p className="cap-explain" style={{ marginBottom: 0 }}>
            Your records are backed up first, and they and your documents stay where they are. Financial Vault closes and opens again
            on the new version.
          </p>
        </div>
      ) : (
        <p style={{ marginTop: 0 }}>
          {status.checkedAt && !status.error ? `You have the latest version (checked ${when(status.checkedAt)}).` : "Not checked for a new version yet."}
        </p>
      )}
      {status.job.state === "failed" && <div className="message-box error">{status.job.error}</div>}
      {status.error && <div className="message-box warning">{status.error}</div>}
      {error && <div className="message-box error">{error}</div>}
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <button className="btn secondary" disabled={busy} onClick={() => run(api.app.checkOnline)}>
          {busy ? "Checking…" : "Check for updates now"}
        </button>
      </div>
      <label className="checkbox-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={status.autoCheck} onChange={(e) => run(() => api.app.setAutoCheck(e.target.checked))} />
        Check for a new version once a day
      </label>
      <p className="cap-explain">
        Checking asks the project's GitHub page what the latest version is — nothing about you or your records is sent. Nothing is
        installed until you press Download and install. Switch this off and Financial Vault never goes online by itself.
      </p>
    </div>
  );
}

/** A reminder at the top of the app when a newer version is ready. */
export function UpdateAvailable() {
  const [status, setStatus] = useState<OnlineUpdate | null>(null);
  useEffect(() => {
    api.app.online().then(setStatus).catch(() => setStatus(null));
  }, []);
  if (!status?.enabled || !status.remind || !status.available) return null;
  const version = status.available.version;
  return (
    <div className="card update-notice">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Version {version} of Financial Vault is ready to install</h3>
        <div className="toolbar">
          <Link className="btn" to="/settings#updates">
            See what's new
          </Link>
          <button
            className="btn secondary"
            onClick={() => {
              setStatus(null);
              void api.app.remindLater(version).catch(() => {});
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
