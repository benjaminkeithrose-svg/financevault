import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, LayoutRecord, LayoutShareStatus } from "../api/client.js";
import { formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

const RESULT: Record<string, string> = {
  ADDS_UP: "Read, adds up",
  DOESNT_ADD_UP: "Read, doesn't add up",
  NOTHING_TO_CHECK: "Read, nothing to check",
  NOT_READ: "Not read",
};

/**
 * Settings → Statement layouts: how each PDF that came in is laid out (never
 * its contents), and sending those records to your own private GitHub
 * repository once a day.
 */
export function StatementLayouts() {
  const [records, setRecords] = useState<LayoutRecord[]>([]);
  const [share, setShare] = useState<LayoutShareStatus | null>(null);
  const [all, setAll] = useState(false);
  const [repo, setRepo] = useState("");
  const [key, setKey] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.layoutRecords
      .list()
      .then((r) => {
        setRecords(r.records);
        setShare(r.share);
        setRepo((current) => current || r.share.repo || "");
      })
      .catch(() => setShare(null));
  useEffect(() => {
    void load();
  }, []);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      void load();
    }
  }

  if (!share) return null;
  const shown = all ? records : records.slice(0, 8);

  return (
    <div className="card" id="statement-layouts">
      <h3 style={{ marginTop: 0 }}>
        Statement layouts <HelpLink topic="statement-layouts" />
      </h3>
      <p className="cap-explain">
        How each PDF that comes in is laid out — its column headings, where the columns sit, its date and amount formats, and whether it
        read. Never a figure, a description, a name or an account number. They help improve the statement reader.
      </p>
      <p style={{ margin: "4px 0 8px" }}>
        {share.total} recorded{share.total ? ` · ${share.unsent} not sent` : ""}
      </p>

      {records.length > 0 && (
        <div className="table-scroll">
          <table className="layout-records">
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Kind</th>
                <th>From</th>
                <th>Pages</th>
                <th>Result</th>
                <th>Sent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.recordedOn)}</td>
                  <td>{r.kind}</td>
                  <td>{r.issuer ?? "—"}</td>
                  <td>{r.pages}</td>
                  <td>{r.result ? (RESULT[r.result] ?? r.result) : r.textLayer ? "—" : "Scan"}</td>
                  <td>{r.sentAt ? formatDate(r.sentAt) : "—"}</td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(JSON.stringify(r, null, 2));
                        setNote({ tone: "info", text: "Copied — paste it to Claude if a statement didn't read properly." });
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {records.length > 8 && (
        <button className="link-button" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${records.length}`}
        </button>
      )}

      <h4 style={{ marginBottom: 4 }}>Send them to my private GitHub repository</h4>
      <p className="cap-explain">
        Once a day, new records go to a private repository of your own, so they can be used to improve the reader without sending files back
        and forth. Only these records go — never a document. Nothing is sent to a public repository.{" "}
        <Link to="/help#statement-layouts">How to set this up</Link>
      </p>
      <div className="grid grid-2">
        <div>
          <label>Repository</label>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="your-name/financevault-layouts" />
        </div>
        <div>
          <label>Key (GitHub token)</label>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={share.hasKey ? "A key is saved — paste a new one to replace it" : "Paste the key from GitHub"}
          />
        </div>
      </div>
      <div className="toolbar" style={{ flexWrap: "wrap", marginTop: 8 }}>
        <button
          className="btn"
          disabled={busy || (!key.trim() && repo.trim() === (share.repo ?? ""))}
          onClick={() =>
            act(async () => {
              await api.layoutRecords.saveShare({ repo: repo.trim() || null, ...(key.trim() ? { token: key.trim() } : {}) });
              setKey("");
              const check = await api.layoutRecords.check();
              setNote({ tone: check.ok ? "success" : "error", text: `Saved. ${check.message}` });
            })
          }
        >
          Save
        </button>
        <button
          className="btn secondary"
          disabled={busy || !share.hasKey || !share.repo}
          onClick={() =>
            act(async () => {
              const check = await api.layoutRecords.check();
              setNote({ tone: check.ok ? "success" : "error", text: check.message });
            })
          }
        >
          Check the connection
        </button>
        <button
          className="btn secondary"
          disabled={busy || !share.hasKey || !share.repo || !share.unsent}
          onClick={() =>
            act(async () => {
              const r = await api.layoutRecords.send();
              setNote(
                r.error ? { tone: "error", text: r.error } : { tone: "success", text: `Sent ${r.sent} record${r.sent === 1 ? "" : "s"}.` },
              );
            })
          }
        >
          Send now
        </button>
      </div>
      <label className="checkbox-row" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={share.on}
          disabled={busy || (!share.on && (!share.hasKey || !share.repo))}
          onChange={(e) => act(async () => void (await api.layoutRecords.saveShare({ on: e.target.checked })))}
        />{" "}
        Send new records once a day
      </label>
      <p className="cap-explain" style={{ margin: "2px 0 0" }}>
        {share.lastSentAt ? `Last sent ${formatDate(share.lastSentAt)}.` : "Nothing sent yet."}
        {share.hasKey && (
          <>
            {" "}
            <button
              className="link-button"
              disabled={busy}
              onClick={() => act(async () => void (await api.layoutRecords.saveShare({ on: false, token: null })))}
            >
              Remove the key
            </button>
          </>
        )}
      </p>
      {share.error && !note && <div className="message-box error">{share.error}</div>}
      {note && <div className={`message-box ${note.tone}`}>{note.text}</div>}
    </div>
  );
}
