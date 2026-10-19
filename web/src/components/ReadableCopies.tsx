import { useEffect, useState } from "react";
import { api, MirrorStatus } from "../api/client.js";
import { HelpLink } from "./HelpLink.js";

/**
 * Settings → Readable copies of your documents: a normal folder, arranged
 * like the asset tree, for OneDrive backup and for checking by hand.
 */
export function ReadableCopies() {
  const [status, setStatus] = useState<MirrorStatus | null>(null);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = (s: MirrorStatus) => {
    setStatus(s);
    setFolder(s.custom ? (s.folder ?? "") : "");
  };
  useEffect(() => {
    api.mirror.status().then(show).catch((e: Error) => setError(e.message));
  }, []);

  async function save(body: { enabled?: boolean; folder?: string | null }) {
    setError(null);
    try {
      show(await api.mirror.update(body));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      show(await api.mirror.sync());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return error ? <div className="message-box warning">{error}</div> : null;
  const last = status.last;
  return (
    <div className="card" id="readable-copies">
      <h3 style={{ marginTop: 0 }}>
        Readable copies of your documents <HelpLink topic="readable-copies" />
      </h3>
      <p style={{ color: "var(--text-muted)" }}>
        Every document is also copied, not encrypted, into ordinary folders arranged like the asset tree — each person, trust or
        company, then what they own, then the financial year. Point it at a folder inside OneDrive and they're backed up as you go.
        ID documents are never copied. The encrypted originals stay in the vault.
      </p>
      <div className="message-box warning">
        Anyone who can open this folder — or your OneDrive — can read these documents. Keep OneDrive's own sign-in secure.
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={status.enabled} onChange={(e) => save({ enabled: e.target.checked })} disabled={!status.folder} /> Keep readable
        copies
      </label>

      {status.folder ? (
        <p>
          Folder: <code className="path">{status.folder}</code>
        </p>
      ) : (
        <p className="cap-explain">Choose a folder below to switch this on.</p>
      )}

      <label>Use a different folder (for example, inside OneDrive)</label>
      <input placeholder="e.g. C:\Users\you\OneDrive\Financial Vault" value={folder} onChange={(e) => setFolder(e.target.value)} />
      <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={syncNow} disabled={busy || !status.enabled}>
          {busy ? "Updating… (can take a minute)" : "Update the folder now"}
        </button>
        <button className="btn secondary" onClick={() => save({ folder: folder.trim() || null, enabled: true })} disabled={!folder.trim() || folder.trim() === status.folder}>
          Use this folder
        </button>
        {status.custom && (
          <button className="btn secondary" onClick={() => save({ folder: null })}>
            Back to the usual folder
          </button>
        )}
      </div>
      <p className="cap-explain">
        It updates by itself a few seconds after each change. Changing the folder starts a new set of copies there; the old folder is
        left as it is for you to delete.
      </p>

      {last && (
        <div className={`message-box ${last.problems.length ? "warning" : "success"}`}>
          Last updated {new Date(last.at).toLocaleString("en-AU")}: {last.files} file{last.files === 1 ? "" : "s"}
          {last.written ? `, ${last.written} copied` : ""}
          {last.removed ? `, ${last.removed} removed` : ""}.{last.recordsBackup ? " Today's records backup is there too." : ""}
          {last.problems.length > 0 && (
            <ul>
              {last.problems.slice(0, 10).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <div className="message-box warning">{error}</div>}
    </div>
  );
}
