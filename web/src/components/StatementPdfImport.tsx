import { useRef, useState } from "react";
import { api, FiledStatement, StatementBatch, StatementSummary } from "../api/client.js";
import { formatCurrencyExact, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

const STATUS: Record<StatementSummary["status"], { label: string; tone: string }> = {
  ADDS_UP: { label: "Adds up", tone: "success" },
  DOESNT_ADD_UP: { label: "Doesn't add up", tone: "warning" },
  NOTHING_TO_CHECK: { label: "Nothing to check against", tone: "warning" },
  NOT_READ: { label: "Not read", tone: "warning" },
};

/**
 * Transactions from PDF statements — many at once. Each statement is read and
 * checked against the balances it prints before anything is saved; the ones
 * that add up are ticked, and transactions already on the account (from an
 * overlapping statement or the bank's CSV) aren't added again.
 */
export function StatementPdfImport({ accountId, onImported }: { accountId: string; onImported: () => void }) {
  const [batch, setBatch] = useState<StatementBatch | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [filed, setFiled] = useState<FiledStatement[] | null>(null);
  const [filedTicked, setFiledTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ statements: number; imported: number; duplicates: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setBatch(null);
    setTicked(new Set());
    setOpen(null);
    setFiled(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run(label: string, action: () => Promise<StatementBatch>) {
    reset();
    setResult(null);
    setBusy(label);
    try {
      const b = await action();
      setBatch(b);
      setTicked(new Set(b.statements.filter((s) => s.suggested).map((s) => s.key)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function showFiled() {
    reset();
    setResult(null);
    try {
      const list = await api.statementImport.filed(accountId);
      setFiled(list);
      setFiledTicked(new Set(list.filter((d) => !d.alreadyRead).map((d) => d.id)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function commit() {
    if (!batch) return;
    setBusy("Bringing them in…");
    setError(null);
    try {
      setResult(await api.statementImport.commit(batch.batchId, [...ticked]));
      reset();
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const chosen = batch?.statements.filter((s) => ticked.has(s.key)) ?? [];
  const newCount = chosen.reduce((n, s) => n + s.newCount, 0);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Import transactions from PDF statements <HelpLink topic="statements" />
      </h3>
      <p className="cap-explain">
        Pick the statements saved from internet banking — a year's or several years' at once. Each one is read and checked against the
        balances it prints before anything is saved. Transactions already here aren't added again.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length)
            void run(`Reading ${files.length} statement${files.length === 1 ? "" : "s"}…`, () =>
              api.statementImport.read(accountId, files),
            );
        }}
      />
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          Choose PDF statements
        </button>
        <button className="btn secondary" disabled={!!busy} onClick={showFiled}>
          Use ones already in Documents
        </button>
        {(batch || filed) && (
          <button className="btn secondary" disabled={!!busy} onClick={reset}>
            Start over
          </button>
        )}
      </div>

      {busy && <div className="message-box info">{busy}</div>}
      {error && <div className="message-box error">{error}</div>}
      {result && (
        <div className="message-box success">
          Brought in {result.imported} transaction{result.imported === 1 ? "" : "s"} from {result.statements} statement
          {result.statements === 1 ? "" : "s"}.{result.duplicates ? ` ${result.duplicates} were already here.` : ""} The statements are
          filed under this account.
        </div>
      )}

      {filed && (
        <div className="sub-form">
          {filed.length === 0 ? (
            <p className="cap-explain">No PDF bank statements in Documents yet that aren't filed under another account.</p>
          ) : (
            <>
              <p className="cap-explain">Bank statements in Documents — filed under this account, or not filed under any account yet.</p>
              <ul className="check-list">
                {filed.map((d) => (
                  <li key={d.id}>
                    <label className="checkbox-row" style={{ margin: 0 }}>
                      <input type="checkbox" checked={filedTicked.has(d.id)} onChange={() => setFiledTicked(toggle(filedTicked, d.id))} />{" "}
                      {d.name}
                      <span className="cap-explain" style={{ margin: "0 0 0 6px" }}>
                        {d.date ? formatDate(d.date) : ""}
                        {d.alreadyRead ? " · already read" : d.filedHere ? " · filed here" : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="toolbar" style={{ marginTop: 8 }}>
                <button
                  className="btn"
                  disabled={!filedTicked.size || !!busy}
                  onClick={() =>
                    run(`Reading ${filedTicked.size} statement${filedTicked.size === 1 ? "" : "s"}…`, () =>
                      api.statementImport.readFiled(accountId, [...filedTicked]),
                    )
                  }
                >
                  Read the ticked ones
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {batch && (
        <>
          {batch.warnings.length > 0 && (
            <div className="message-box warning">
              {batch.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          <ul className="statement-list">
            {batch.statements.map((s) => {
              const st = STATUS[s.status];
              return (
                <li key={s.key} className={ticked.has(s.key) ? "" : "unticked"}>
                  <div className="statement-row">
                    <label className="checkbox-row" style={{ margin: 0, flex: "1 1 220px" }}>
                      <input
                        type="checkbox"
                        disabled={!s.count}
                        checked={ticked.has(s.key)}
                        onChange={() => setTicked(toggle(ticked, s.key))}
                      />{" "}
                      <span>
                        <strong>{s.filename}</strong>
                        <span className="cap-explain" style={{ display: "block", margin: 0 }}>
                          {s.bank ? `${s.bank} · ` : ""}
                          {s.period ? `${formatDate(s.period.from)} – ${formatDate(s.period.to)}` : "dates not found"}
                        </span>
                      </span>
                    </label>
                    <span className={`badge ${st.tone}`}>{st.label}</span>
                  </div>
                  <p className="cap-explain" style={{ margin: "4px 0 0" }}>
                    {s.count
                      ? `${s.count} transactions · ${s.newCount} new${s.duplicates ? ` · ${s.duplicates} already here` : ""} · in ${formatCurrencyExact(s.moneyIn)}, out ${formatCurrencyExact(s.moneyOut)}`
                      : s.message}
                  </p>
                  {s.status !== "ADDS_UP" && s.count > 0 && (
                    <p className="cap-explain warning-text" style={{ margin: "2px 0 0" }}>
                      {s.message}
                    </p>
                  )}
                  {s.otherAccount && (
                    <p className="cap-explain warning-text" style={{ margin: "2px 0 0" }}>
                      The account or card number on it doesn't end like this account's — it may be another account's statement.
                    </p>
                  )}
                  {s.alreadyRead && (
                    <p className="cap-explain" style={{ margin: "2px 0 0" }}>
                      Already brought in before.
                    </p>
                  )}
                  {s.count > 0 && (
                    <button className="link-button" onClick={() => setOpen(open === s.key ? null : s.key)}>
                      {open === s.key ? "Hide the transactions" : "Show the transactions"}
                    </button>
                  )}
                  {open === s.key && (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th style={{ textAlign: "right" }}>Amount</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {s.transactions.map((t, i) => (
                            <tr key={i} className={t.isNew ? "" : "dealt"}>
                              <td>{formatDate(t.date)}</td>
                              <td>{t.description}</td>
                              <td style={{ textAlign: "right" }}>{formatCurrencyExact(t.amount)}</td>
                              <td className="cap-explain">{t.isNew ? "" : "already here"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="toolbar" style={{ flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn" disabled={!chosen.length || !!busy} onClick={commit}>
              Bring in {chosen.length} statement{chosen.length === 1 ? "" : "s"} ({newCount} new transaction{newCount === 1 ? "" : "s"})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
