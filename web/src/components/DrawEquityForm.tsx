import { useEffect, useState } from "react";
import { api, EquityDrawPreview, LoanUse } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { DEDUCTIBLE_BY_DEFAULT, USE_LABEL } from "./LoanAllocationCard.js";

const USES: LoanUse[] = ["PROPERTY", "SHARES", "BUSINESS", "PRIVATE", "OTHER"];
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Drawing equity from a property: how much, what it's for, and whether it's
 * a new split under the same facility or a redraw on a loan already there.
 * "Check it" shows what will happen and anything to watch for; "Draw it"
 * records it — the loan, and what its money was used for.
 */
export function DrawEquityForm({
  assetId,
  properties,
  defaults,
  planEquityDrawId,
  onDone,
  onCancel,
}: {
  /** The property, when drawn from its own page. */
  assetId?: string;
  /** Otherwise, the properties to choose from (by asset id). */
  properties?: Array<{ assetId: string; name: string }>;
  defaults?: { amount?: number; description?: string; use?: LoanUse };
  planEquityDrawId?: string;
  onDone: (loanId: string) => void;
  onCancel: () => void;
}) {
  const [propertyId, setPropertyId] = useState(assetId ?? properties?.[0]?.assetId ?? "");
  const [amount, setAmount] = useState(defaults?.amount ? String(defaults.amount) : "");
  const [date, setDate] = useState(today());
  const [use, setUse] = useState<LoanUse>(defaults?.use ?? "PROPERTY");
  const [deductible, setDeductible] = useState(DEDUCTIBLE_BY_DEFAULT[defaults?.use ?? "PROPERTY"]);
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [mode, setMode] = useState<"NEW_SPLIT" | "EXISTING_LOAN">("NEW_SPLIT");
  const [loanId, setLoanId] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<EquityDrawPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Anything changed after checking: check again before drawing.
  useEffect(() => setPreview(null), [propertyId, amount, date, use, deductible, description, mode, loanId]);

  const body = () => ({
    assetId: propertyId,
    amount: Number(amount),
    date,
    use,
    deductible,
    description: description.trim(),
    mode,
    loanId: mode === "EXISTING_LOAN" ? loanId || null : null,
    name: name.trim() || null,
    planEquityDrawId: planEquityDrawId ?? null,
  });

  async function check() {
    setError(null);
    if (!propertyId) return setError("Choose the property to draw from.");
    if (!(Number(amount) > 0)) return setError("Enter how much to draw.");
    if (!description.trim()) return setError("Say what the money is for.");
    if (mode === "EXISTING_LOAN" && !loanId) return setError("Choose the loan to redraw or increase.");
    setBusy(true);
    try {
      const p = await api.debtAllocation.previewDraw(body());
      setPreview(p);
      if (!name) setName(p.mode === "NEW_SPLIT" ? p.loanName : "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function draw() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.debtAllocation.draw(body());
      onDone(r.loanId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The loans on the chosen property, for a redraw (from the last check, or fetched).
  const [loans, setLoans] = useState<EquityDrawPreview["securedLoans"]>([]);
  useEffect(() => {
    if (!propertyId) return;
    api.debtAllocation
      .usableEquity(propertyId)
      .then((u) => setLoans(u.loans.map((l) => ({ id: l.id, name: l.name, currentBalance: l.currentBalance ?? null, facility: null }))))
      .catch(() => setLoans([]));
  }, [propertyId]);

  return (
    <div className="sub-form draw-equity">
      {!assetId && properties && (
        <>
          <label htmlFor="draw-property">Draw from</label>
          <select id="draw-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.assetId} value={p.assetId}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="grid grid-2">
        <div>
          <label htmlFor="draw-amount">How much</label>
          <input id="draw-amount" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="draw-date">When</label>
          <input id="draw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="draw-use">What it's for</label>
          <select
            id="draw-use"
            value={use}
            onChange={(e) => {
              const u = e.target.value as LoanUse;
              setUse(u);
              setDeductible(DEDUCTIBLE_BY_DEFAULT[u]);
            }}
          >
            {USES.map((u) => (
              <option key={u} value={u}>
                {USE_LABEL[u]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="draw-description">In a few words</label>
          <input id="draw-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deposit on 12 Next St" />
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} /> Used to produce income (interest deductible)
      </label>

      <label>How it's borrowed</label>
      <div className="segmented" role="group" aria-label="How it's borrowed">
        <button type="button" className={mode === "NEW_SPLIT" ? "selected" : ""} aria-pressed={mode === "NEW_SPLIT"} onClick={() => setMode("NEW_SPLIT")}>
          A new split (keeps purposes apart)
        </button>
        <button
          type="button"
          className={mode === "EXISTING_LOAN" ? "selected" : ""}
          aria-pressed={mode === "EXISTING_LOAN"}
          onClick={() => setMode("EXISTING_LOAN")}
          disabled={loans.length === 0}
        >
          A redraw or increase on a loan
        </button>
      </div>
      {mode === "EXISTING_LOAN" ? (
        <>
          <label htmlFor="draw-loan">Which loan</label>
          <select id="draw-loan" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
            <option value="">Choose…</option>
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.currentBalance != null ? ` — ${formatCurrency(l.currentBalance)} owing` : ""}
              </option>
            ))}
          </select>
        </>
      ) : (
        preview && (
          <>
            <label htmlFor="draw-name">The new split's name</label>
            <input id="draw-name" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )
      )}

      {preview && (
        <div className="draw-preview">
          <p>
            <strong>{preview.mode === "NEW_SPLIT" ? `A new split, "${name || preview.loanName}"` : `A redraw on "${preview.loanName}"`}</strong>
            {preview.facility && preview.mode === "NEW_SPLIT" ? ` under ${preview.facility}` : ""}, {formatCurrency(Number(amount))}
            {preview.resultShare !== null ? ` — ${Math.round(preview.resultShare * 100)}% of that loan deductible afterwards.` : "."}
          </p>
          {preview.warnings.length === 0 ? (
            <p className="cap-explain">Nothing to watch for.</p>
          ) : (
            preview.warnings.map((w) => (
              <div key={w} className="message-box warning">
                {w}
              </div>
            ))
          )}
        </div>
      )}
      {error && <div className="message-box warning">{error}</div>}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
        {preview ? (
          <button className="btn" disabled={busy} onClick={draw}>
            {busy ? "Saving…" : "Draw it"}
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={check}>
            {busy ? "Checking…" : "Check it"}
          </button>
        )}
        <button className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="cap-explain">
        This records the borrowing in Financial Vault — it doesn't contact your lender. Draw it here once the lender has
        approved it and the money's there.
      </p>
    </div>
  );
}
