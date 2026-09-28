import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Liability } from "../api/client.js";
import { formatCurrency, formatDate, liabilityTypeLabel, monthlyEquivalent, REPAYMENT_FREQUENCIES } from "../utils.js";
import { DocumentLinker } from "./DocumentLinker.js";

type Kind = "residential" | "commercial" | "vehicle";

const TYPES: Record<Kind, string[]> = {
  residential: ["HOME_LOAN", "INVESTMENT_LOAN", "LRBA_LOAN"],
  commercial: ["COMMERCIAL_LOAN", "LRBA_LOAN"],
  vehicle: ["VEHICLE_LOAN", "PERSONAL_LOAN"],
};

const blank = (type: string, name: string) => ({
  name,
  liabilityType: type,
  lender: "",
  currentBalance: "",
  interestRate: "",
  loanType: "variable",
  repaymentAmount: "",
  repaymentFrequency: "MONTHLY",
  interestOnly: false,
});

/**
 * The loans secured on a property or vehicle, on its own page: each with its
 * documents, and "Add a loan" to record one right here — already tied to
 * this property and owed by its owner — then add its documents straight
 * away, so nothing ends up somewhere else by mistake.
 */
export function SecuredLoansCard({
  kind,
  securityId,
  ownerEntityId,
  name,
  defaultType,
  loans,
  onChange,
  title = "Loans",
  bare = false,
}: {
  kind: Kind;
  /** The property's id (residential or commercial), or the vehicle's asset id. */
  securityId: string;
  ownerEntityId: string;
  /** What it's called, for the loan's default name. */
  name: string;
  defaultType?: string;
  loans: Liability[];
  onChange: () => void;
  title?: string;
  /** Inside another card (no box of its own). */
  bare?: boolean;
}) {
  const types = TYPES[kind];
  const startType = defaultType && types.includes(defaultType) ? defaultType : types[0];
  const [form, setForm] = useState(() => blank(startType, `${name} loan`));
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function start() {
    setForm(blank(startType, loans.length ? `${name} loan ${loans.length + 1}` : `${name} loan`));
    setError(null);
    setAdding(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Give the loan a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const loan = await api.liabilities.create({
        name: form.name.trim(),
        liabilityType: form.liabilityType,
        entityId: ownerEntityId,
        lender: form.lender.trim() || null,
        currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
        interestRate: form.interestRate ? Number(form.interestRate) : null,
        loanType: form.loanType || null,
        repaymentAmount: form.repaymentAmount ? Number(form.repaymentAmount) : null,
        repaymentFrequency: form.repaymentFrequency,
        securityPropertyId: kind === "residential" ? securityId : null,
        securityCommercialPropertyId: kind === "commercial" ? securityId : null,
        securityAssetId: kind === "vehicle" ? securityId : null,
        interestOnly: kind === "commercial" ? form.interestOnly : null,
      });
      setAdding(false);
      setJustAdded(loan.id);
      setDocsFor(loan.id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={bare ? undefined : "card"}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!adding && (
          <button className="btn" onClick={start}>
            Add a loan
          </button>
        )}
      </div>

      {adding && (
        <div className="sub-form">
          <p className="cap-explain" style={{ marginTop: 0 }}>
            It's recorded as secured on {name} and owed by its owner. You can change the borrowers on the loan's own page later.
          </p>
          <div className="grid grid-2">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Kind of loan</label>
              <select value={form.liabilityType} onChange={(e) => setForm({ ...form, liabilityType: e.target.value })}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {liabilityTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-3">
            <div>
              <label>Lender</label>
              <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} placeholder="e.g. Westpac" />
            </div>
            <div>
              <label>Owing now ($)</label>
              <input type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} />
            </div>
            <div>
              <label>Interest rate (%)</label>
              <input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-3">
            <div>
              <label>Repayment ($)</label>
              <input type="number" value={form.repaymentAmount} onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })} />
            </div>
            <div>
              <label>How often</label>
              <select value={form.repaymentFrequency} onChange={(e) => setForm({ ...form, repaymentFrequency: e.target.value })}>
                {REPAYMENT_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Rate</label>
              <select value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value })}>
                <option value="variable">Variable</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
          </div>
          {kind === "commercial" && (
            <label className="checkbox-row">
              <input type="checkbox" checked={form.interestOnly} onChange={(e) => setForm({ ...form, interestOnly: e.target.checked })} />
              Interest only
            </label>
          )}
          {error && <div className="message-box error">{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save the loan"}
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loans.length === 0 && !adding ? (
        <p className="empty-state">No loan recorded against it yet.</p>
      ) : (
        <ul className="item-card-list" style={{ marginTop: 12 }}>
          {loans.map((l) => {
            const monthly = monthlyEquivalent(l.repaymentAmount, l.repaymentFrequency);
            const open = docsFor === l.id;
            return (
              <li key={l.id} className="item-card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
                <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", minWidth: 0 }}>
                  <div className="item-card-body">
                    <div className="item-card-title" style={{ whiteSpace: "normal" }}>
                      <Link to={`/liabilities/${l.id}`}>{l.name}</Link>
                    </div>
                    <div className="item-card-subtitle" style={{ whiteSpace: "normal" }}>
                      {[
                        liabilityTypeLabel(l.liabilityType),
                        l.lender,
                        l.currentBalance !== null && l.currentBalance !== undefined ? `${formatCurrency(l.currentBalance)} owing` : "balance not entered",
                        l.interestRate ? `${l.interestRate}%` : null,
                        monthly ? `${formatCurrency(monthly)} a month` : null,
                        l.fixedPeriodEnds ? `fixed until ${formatDate(l.fixedPeriodEnds)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <button className="btn secondary" onClick={() => setDocsFor(open ? null : l.id)} aria-expanded={open}>
                    {open ? "Hide its documents" : "Its documents"}
                  </button>
                </div>
                {open && (
                  <div style={{ marginTop: 8 }}>
                    {justAdded === l.id && (
                      <div className="message-box success">
                        Loan saved. Add its documents here — the loan contract, the latest statement — and they're filed with this loan.
                      </div>
                    )}
                    <DocumentLinker targetType="LIABILITY" targetId={l.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
