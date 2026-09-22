import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  EmailAccount,
  EmailSyncResult,
  Entity,
  ImportedEmailAttachment,
} from "../api/client.js";
import { formatDate, confirmThenDelete } from "../utils.js";

const OUTCOME_LABELS: Record<string, string> = {
  IMPORTED: "Imported",
  DUPLICATE: "Already had it",
  SKIPPED_UNSUPPORTED_TYPE: "Skipped — not a document",
  SKIPPED_TOO_LARGE: "Skipped — too large",
};

const EXAMPLE_RULES = [
  { name: "Bank statements", gmailQuery: "from:commbank.com.au has:attachment filename:pdf" },
  { name: "Insurance renewals", gmailQuery: "subject:(renewal OR policy) has:attachment filename:pdf" },
  { name: "Rates notices", gmailQuery: "subject:(rates notice) has:attachment" },
];

export function EmailImport() {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [history, setHistory] = useState<ImportedEmailAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [ruleForm, setRuleForm] = useState({
    name: "",
    gmailQuery: "",
    suggestedDocumentType: "",
    suggestedEntityId: "",
  });
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<EmailSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function load() {
    const [accounts, ents] = await Promise.all([api.emailImport.listAccounts(), api.entities.list()]);
    const first = accounts[0] ?? null;
    setAccount(first);
    setEntities(ents);
    if (first) setHistory(await api.emailImport.history(first.id));
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  async function connect() {
    setConnectError(null);
    setConnecting(true);
    try {
      await api.emailImport.connect({ emailAddress: emailAddress.trim(), appPassword });
      setAppPassword("");
      setEmailAddress("");
      await load();
    } catch (e) {
      setConnectError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!account) return;
    if (!confirm("Disconnect this mailbox? Documents already imported are kept — only the connection is removed.")) {
      return;
    }
    await api.emailImport.disconnect(account.id);
    setHistory([]);
    setSyncResult(null);
    await load();
  }

  async function addRule() {
    if (!account) return;
    setRuleError(null);
    try {
      await api.emailImport.addRule(account.id, {
        name: ruleForm.name.trim(),
        gmailQuery: ruleForm.gmailQuery.trim(),
        suggestedDocumentType: ruleForm.suggestedDocumentType.trim() || null,
        suggestedEntityId: ruleForm.suggestedEntityId || null,
      });
      setRuleForm({ name: "", gmailQuery: "", suggestedDocumentType: "", suggestedEntityId: "" });
      await load();
    } catch (e) {
      setRuleError((e as Error).message);
    }
  }

  async function removeRule(ruleId: string) {
    const deleted = await confirmThenDelete(
      "Delete this import rule? Documents it already imported are kept.",
      () => api.emailImport.removeRule(ruleId)
    );
    if (!deleted) return;
    await load();
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    await api.emailImport.updateRule(ruleId, { enabled });
    await load();
  }

  async function runSync() {
    if (!account) return;
    setSyncError(null);
    setSyncResult(null);
    setSyncing(true);
    try {
      const result = await api.emailImport.sync(account.id);
      setSyncResult(result);
      await load();
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Email import</h2>
          <p>
            Pull financial documents out of Gmail as attachments. Nothing is sent, deleted or changed in your mailbox —
            attachments are only ever copied out, and an import only runs when you ask for one.
          </p>
        </div>
      </div>

      {!account ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Connect a Gmail mailbox</h3>
          <p style={{ color: "var(--text-muted)" }}>
            This uses an <strong>app password</strong> rather than a normal Google sign-in, so the app never sees your
            real password and you can revoke its access at any time without changing it.
          </p>
          <ol style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
            <li>
              Turn on 2-Step Verification at <code>myaccount.google.com/security</code> if it isn't already on — Google
              only offers app passwords once it is.
            </li>
            <li>
              Go to <code>myaccount.google.com/apppasswords</code>, name it something like "Financial Vault", and click
              Create.
            </li>
            <li>Copy the 16-character password it shows you and paste it below. Google won't show it again.</li>
          </ol>

          <div className="grid grid-2">
            <div>
              <label>Gmail address</label>
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="you@gmail.com"
              />
            </div>
            <div>
              <label>App password</label>
              <input
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="16 characters, spaces optional"
              />
            </div>
          </div>

          {connectError && <div className="message-box warning">{connectError}</div>}

          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" disabled={connecting || !emailAddress.trim() || !appPassword.trim()} onClick={connect}>
              {connecting ? "Checking…" : "Connect mailbox"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{account.emailAddress}</h3>
            <p style={{ color: "var(--text-muted)", margin: "4px 0 12px" }}>
              {account.lastSyncAt ? (
                <>
                  Last import {formatDate(account.lastSyncAt)}
                  {account.lastSyncStatus === "ERROR" && " — it failed"}
                </>
              ) : (
                "No import run yet."
              )}
            </p>
            {account.lastSyncStatus === "ERROR" && account.lastSyncError && (
              <div className="message-box warning">{account.lastSyncError}</div>
            )}
            <div className="toolbar">
              <button className="btn" onClick={runSync} disabled={syncing || account.rules.length === 0}>
                {syncing ? "Importing…" : "Import now"}
              </button>
              <button className="btn danger secondary" onClick={disconnect}>
                Disconnect
              </button>
            </div>
            {account.rules.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
                Add at least one import rule below before running an import.
              </p>
            )}
            {syncError && <div className="message-box warning">{syncError}</div>}
            {syncResult && (
              <div className="message-box info">
                <strong>
                  {syncResult.imported} imported, {syncResult.duplicates} already had, {syncResult.skipped} skipped.
                </strong>
                {syncResult.imported > 0 && (
                  <>
                    {" "}
                    New documents are waiting in the <Link to="/inbox">Inbox</Link> for you to confirm — nothing was
                    filed automatically.
                  </>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Import rules</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Each rule is an ordinary Gmail search — whatever works in Gmail's own search box works here. A rule can
              also propose a document type and entity, which is only applied where the classifier couldn't work it out
              from the document itself, and never marks anything confirmed.
            </p>

            {account.rules.length === 0 ? (
              <p className="empty-state">No rules yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Gmail search</th>
                    <th>Proposes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {account.rules.map((r) => (
                    <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                      <td>{r.name}</td>
                      <td>
                        <code style={{ fontSize: 12 }}>{r.gmailQuery}</code>
                      </td>
                      <td>
                        {r.suggestedDocumentType || "—"}
                        {r.suggestedEntity ? ` · ${r.suggestedEntity.name}` : ""}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn secondary" onClick={() => toggleRule(r.id, !r.enabled)}>
                          {r.enabled ? "Disable" : "Enable"}
                        </button>{" "}
                        <button className="btn danger secondary" onClick={() => removeRule(r.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>Add a rule</h3>
            <div className="grid grid-2">
              <div>
                <label>Name</label>
                <input
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="Bank statements"
                />
              </div>
              <div>
                <label>Gmail search</label>
                <input
                  value={ruleForm.gmailQuery}
                  onChange={(e) => setRuleForm({ ...ruleForm, gmailQuery: e.target.value })}
                  placeholder="from:commbank.com.au has:attachment"
                />
              </div>
              <div>
                <label>Propose document type (optional)</label>
                <input
                  value={ruleForm.suggestedDocumentType}
                  onChange={(e) => setRuleForm({ ...ruleForm, suggestedDocumentType: e.target.value })}
                  placeholder="Bank Statement"
                />
              </div>
              <div>
                <label>Propose entity (optional)</label>
                <select
                  value={ruleForm.suggestedEntityId}
                  onChange={(e) => setRuleForm({ ...ruleForm, suggestedEntityId: e.target.value })}
                >
                  <option value="">None</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="chip-row" style={{ marginTop: 8 }}>
              {EXAMPLE_RULES.map((ex) => (
                <button
                  key={ex.name}
                  className="chip"
                  onClick={() => setRuleForm({ ...ruleForm, name: ex.name, gmailQuery: ex.gmailQuery })}
                >
                  {ex.name}
                </button>
              ))}
            </div>

            {ruleError && <div className="message-box warning">{ruleError}</div>}

            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn" disabled={!ruleForm.name.trim() || !ruleForm.gmailQuery.trim()} onClick={addRule}>
                Add rule
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Import history</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Every attachment seen so far. An attachment already listed here is never imported a second time, no matter
              how often you run an import.
            </p>
            {history.length === 0 ? (
              <p className="empty-state">Nothing imported yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Attachment</th>
                    <th>From</th>
                    <th>Subject</th>
                    <th>Result</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.documentId ? (
                          <Link to={`/documents/${h.documentId}`}>{h.attachmentFilename}</Link>
                        ) : (
                          h.attachmentFilename
                        )}
                      </td>
                      <td>{h.fromAddress || "—"}</td>
                      <td>{h.subject || "—"}</td>
                      <td>{OUTCOME_LABELS[h.outcome] || h.outcome}</td>
                      <td>{formatDate(h.importedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
