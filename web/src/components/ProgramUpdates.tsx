import { useEffect, useRef, useState } from "react";
import { api, AppInfo } from "../api/client.js";
import { waitForRestart } from "../appWindow.js";
import { HelpLink } from "./HelpLink.js";

/** "## 1.1.0 — 12 October 2026" and "- line" bullets, as a heading and a list. */
export function ReleaseNotes({ notes }: { notes: string }) {
  const lines = notes.split(/\r?\n/).filter((l) => l.trim());
  const heading = lines[0]?.startsWith("## ") ? lines.shift()!.slice(3) : null;
  return (
    <div className="release-notes">
      {heading && <strong>{heading}</strong>}
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{l.replace(/^\s*[-*]\s*/, "")}</li>
        ))}
      </ul>
    </div>
  );
}

/** Covers the page while the launcher installs and restarts. */
export function Restarting({ title }: { title: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    void waitForRestart(setSeconds);
  }, []);
  return (
    <div className="overlay restarting" role="status">
      <div className="card lock-card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p>Your records were backed up first. This window comes back by itself when it's done — usually within a minute or two.</p>
        <p className="cap-explain">{seconds ? `${seconds} seconds so far…` : "Starting…"}</p>
        {seconds > 300 && (
          <p className="cap-explain">
            Taking a long time? Close this window, then start Financial Vault again from its desktop icon. If an update couldn't be
            installed, the previous version is put back automatically.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → Program and updates: the version, where the data folder is,
 * installing a new version from its ZIP, and putting the previous one back.
 */
export function ProgramUpdates() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.app.info().then(setInfo).catch((e: Error) => setError(e.message));
  }, []);

  async function install(file: File) {
    setError(null);
    setMessage(null);
    try {
      const r = await api.app.install(file);
      if (r.restarting) setRestarting(`Installing version ${r.version}…`);
      else setMessage(`Version ${r.version} is ready to install. Close Financial Vault and start it again to finish.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function rollback() {
    if (!info?.previousVersion) return;
    if (!window.confirm(`Put back version ${info.previousVersion}? Your records stay as they are now. Financial Vault restarts.`)) return;
    try {
      const r = await api.app.rollback();
      if (r.restarting) setRestarting(`Putting back version ${r.version}…`);
      else setMessage("Close Financial Vault and start it again to finish putting the previous version back.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (restarting) return <Restarting title={restarting} />;
  return (
    <div className="card" id="updates">
      <h3 style={{ marginTop: 0 }}>
        Program and updates <HelpLink topic="updates" />
      </h3>
      {info && (
        <>
          <p style={{ marginTop: 0 }}>
            Version <strong>{info.version}</strong>
            {info.dataFolder && (
              <>
                {" "}
                · your records, documents and backups are in <code className="path">{info.dataFolder}</code>
              </>
            )}
          </p>
          {info.canUpdate ? (
            <>
              <p style={{ color: "var(--text-muted)" }}>
                To update, download the new version's ZIP and choose it here — don't unzip it. Your records are backed up first, the
                program is replaced (never your records or documents), and Financial Vault restarts. If anything goes wrong, the
                previous version is put back automatically. Nothing is downloaded by the app itself.
              </p>
              <div className="toolbar" style={{ flexWrap: "wrap" }}>
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  Install an update
                </button>
                {info.previousVersion && (
                  <button className="btn secondary" onClick={rollback}>
                    Put back version {info.previousVersion}
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && install(e.target.files[0])}
              />
            </>
          ) : (
            <p className="cap-explain">
              Updates are installed when Financial Vault is started from its desktop icon or its Start Financial Vault file.
            </p>
          )}
        </>
      )}
      {message && <div className="message-box success">{message}</div>}
      {error && <div className="message-box warning">{error}</div>}
    </div>
  );
}
