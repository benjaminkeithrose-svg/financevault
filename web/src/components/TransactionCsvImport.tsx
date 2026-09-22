import { useRef, useState } from "react";
import { api, CsvInspection, CsvColumnMapping, CsvPreview } from "../api/client.js";
import { formatCurrencyExact, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * Bank CSV exports have no common shape, so the file is inspected, a mapping
 * proposed, and nothing written until the preview has been seen and accepted.
 */
export function TransactionCsvImport({ accountId, onImported }: { accountId: string; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<CsvInspection | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setInspection(null);
    setMapping(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function choose(chosen: File | null) {
    if (!chosen) return;
    reset();
    setFile(chosen);
    setBusy(true);
    try {
      const result = await api.transactionImport.inspect(chosen);
      setInspection(result);
      setMapping(result.proposed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(nextMapping: CsvColumnMapping) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.transactionImport.preview(file, accountId, nextMapping));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateMapping(patch: Partial<CsvColumnMapping>) {
    if (!mapping) return;
    const next = { ...mapping, ...patch };
    setMapping(next);
    setPreview(null);
  }

  async function commit() {
    if (!file || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.transactionImport.commit(file, accountId, mapping);
      setResult(res);
      setPreview(null);
      setInspection(null);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const columnCount = inspection
    ? Math.max(inspection.headers?.length ?? 0, ...inspection.sampleRows.map((r) => r.length))
    : 0;
  const columnOptions = Array.from({ length: columnCount }, (_, i) => ({
    value: i,
    label: inspection?.headers?.[i]?.trim() || `Column ${i + 1}`,
  }));

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import transactions from CSV <HelpLink topic="banking" /></h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Export a date range from your bank's website as CSV and load it here. This is far more reliable than reading
        transactions out of PDF statements. Nothing is written until you've seen the preview, and anything already
        imported is skipped, so re-importing an overlapping range is safe.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />
      <div className="toolbar">
        <button className="btn secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy && !inspection ? "Reading…" : "Choose a CSV file"}
        </button>
        {(inspection || result) && (
          <button className="btn secondary" onClick={reset}>
            Start over
          </button>
        )}
      </div>

      {error && <div className="message-box warning">{error}</div>}

      {result && (
        <div className="message-box success">
          Imported {result.imported} transactions. {result.duplicates} were already there
          {result.skipped > 0 && `, ${result.skipped} rows couldn't be read`}.
        </div>
      )}

      {inspection && mapping && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
            Found {inspection.totalRows} rows{inspection.headers ? " with a header row" : " with no header row"}. Check
            the columns below are right.
          </p>

          <div className="grid grid-3">
            <div>
              <label>Date column</label>
              <select
                value={mapping.dateColumn}
                onChange={(e) => updateMapping({ dateColumn: Number(e.target.value) })}
              >
                {columnOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Description column</label>
              <select
                value={mapping.descriptionColumn}
                onChange={(e) => updateMapping({ descriptionColumn: Number(e.target.value) })}
              >
                {columnOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Date format</label>
              <select
                value={mapping.dateFormat}
                onChange={(e) => updateMapping({ dateFormat: e.target.value as CsvColumnMapping["dateFormat"] })}
              >
                <option value="DMY">Day/Month/Year</option>
                <option value="MDY">Month/Day/Year</option>
                <option value="YMD">Year-Month-Day</option>
              </select>
            </div>
          </div>

          <div className="grid grid-3">
            <div>
              <label>Amount column</label>
              <select
                value={mapping.amountColumn ?? ""}
                onChange={(e) =>
                  updateMapping({
                    amountColumn: e.target.value === "" ? null : Number(e.target.value),
                    debitColumn: e.target.value === "" ? mapping.debitColumn : null,
                    creditColumn: e.target.value === "" ? mapping.creditColumn : null,
                  })
                }
              >
                <option value="">Separate money in/out columns</option>
                {columnOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {mapping.amountColumn === null && (
              <>
                <div>
                  <label>Money out (debit)</label>
                  <select
                    value={mapping.debitColumn ?? ""}
                    onChange={(e) =>
                      updateMapping({ debitColumn: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  >
                    <option value="">None</option>
                    {columnOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Money in (credit)</label>
                  <select
                    value={mapping.creditColumn ?? ""}
                    onChange={(e) =>
                      updateMapping({ creditColumn: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  >
                    <option value="">None</option>
                    {columnOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={mapping.invertSign ?? false}
              onChange={(e) => updateMapping({ invertSign: e.target.checked })}
              style={{ width: "auto" }}
            />
            Flip the signs — tick this if spending is showing up as money coming in
          </label>

          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" disabled={busy} onClick={() => runPreview(mapping)}>
              {busy ? "Checking…" : "Preview"}
            </button>
          </div>
        </>
      )}

      {preview && (
        <>
          <h3>Preview</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {preview.willImport} to import · {preview.duplicates} already there · {preview.skipped.length} unreadable
            {preview.dateRange && ` · ${formatDate(preview.dateRange.from)} to ${formatDate(preview.dateRange.to)}`}
          </p>

          {preview.preview.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((r, i) => (
                  <tr key={i} style={{ opacity: r.duplicate ? 0.5 : 1 }}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.description}</td>
                    <td>{formatCurrencyExact(r.amount)}</td>
                    <td>{r.duplicate ? "already there" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {preview.skipped.length > 0 && (
            <div className="message-box warning">
              {preview.skipped.length} rows couldn't be read and will be left out — e.g. line {preview.skipped[0].line}:{" "}
              {preview.skipped[0].reason}. If that looks wrong, check the column choices above.
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" disabled={busy || preview.willImport === 0} onClick={commit}>
              {busy ? "Importing…" : `Import ${preview.willImport} transactions`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
