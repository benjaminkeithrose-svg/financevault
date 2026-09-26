import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, Document, LoanAllocation, LoanUse } from "../api/client.js";
import { confirmThenDelete, financialYearLabelForToday, formatCurrency, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";
import { WhyClaimed } from "./WhyClaimed.js";

/**
 * What a loan's money was used for, and the interest each year — the basis
 * for how much of the interest is deductible. It's the use of the money that
 * counts, not what the loan is secured against.
 */

const USE_LABEL: Record<LoanUse, string> = {
  PROPERTY: "Rental or investment property",
  SHARES: "Shares or other investments",
  BUSINESS: "Business",
  PRIVATE: "Private (home, car, holidays…)",
  OTHER: "Other",
};
const DEDUCTIBLE_BY_DEFAULT: Record<LoanUse, boolean> = { PROPERTY: true, SHARES: true, BUSINESS: true, PRIVATE: false, OTHER: false };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const emptyPurpose = { date: "", amount: "", use: "PROPERTY" as LoanUse, deductible: true, assetId: "", description: "", documentId: "" };

export function LoanAllocationCard({ liabilityId }: { liabilityId: string }) {
  const [data, setData] = useState<LoanAllocation | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyPurpose);
  const [interestForm, setInterestForm] = useState({ fyLabel: previousYear(), interestCharged: "", documentId: "" });
  const [addingInterest, setAddingInterest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.debtAllocation.loan(liabilityId).then(setData);
  useEffect(() => {
    load();
    api.assets.list().then((all) => setAssets(all.filter((a) => !a.parentAssetId && !a.disposalDate)));
    api.documents.list().then(setDocuments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liabilityId]);

  if (!data) return null;
  const { split } = data;

  async function addPurpose() {
    setError(null);
    if (!form.amount || !form.description.trim()) {
      setError("Enter the amount and what it was used for.");
      return;
    }
    try {
      await api.debtAllocation.addPurpose(liabilityId, {
        date: form.date ? new Date(form.date).toISOString() : null,
        amount: Number(form.amount),
        use: form.use,
        deductible: form.deductible,
        assetId: form.assetId || null,
        description: form.description.trim(),
        documentId: form.documentId || null,
      });
      setForm(emptyPurpose);
      setAdding(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveInterest() {
    setError(null);
    if (!/^\d{4}-\d{2}$/.test(interestForm.fyLabel) || interestForm.interestCharged === "") {
      setError("Enter the financial year (e.g. 2025-26) and the interest from the lender's statement.");
      return;
    }
    try {
      await api.debtAllocation.saveInterestYear(liabilityId, {
        fyLabel: interestForm.fyLabel,
        interestCharged: Number(interestForm.interestCharged),
        documentId: interestForm.documentId || null,
      });
      setAddingInterest(false);
      setInterestForm({ fyLabel: previousYear(), interestCharged: "", documentId: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const docOptions = (
    <>
      <option value="">— None —</option>
      {documents.map((d) => (
        <option key={d.id} value={d.id}>
          {d.originalFilename}
        </option>
      ))}
    </>
  );

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        What this loan's money was used for <HelpLink topic="loan-purposes" />
      </h3>
      <p className="cap-explain">
        Interest is deductible by what the borrowed money was used for — not by what the loan is secured against. Record each
        use with its evidence (settlement statement, loan statement).
      </p>

      {split.deductibleShare !== null && (
        <div style={{ marginBottom: 8 }}>
          <strong>{pct(split.deductibleShare)} deductible</strong>
          <span className="cap-explain">
            {" "}
            — {formatCurrency(split.deductible)} of {formatCurrency(split.total)} used to produce income; {formatCurrency(split.private)}{" "}
            private.
          </span>
        </div>
      )}

      {data.purposes.length === 0 ? (
        <p className="empty-state">No uses recorded yet.</p>
      ) : (
        <ul className="plain-list">
          {data.purposes.map((p) => (
            <li key={p.id} className="loan-purpose-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{formatCurrency(p.amount)}</strong> · {p.description}
                {p.asset ? (
                  <>
                    {" "}
                    · <Link to={`/assets/${p.asset.id}`}>{p.asset.name}</Link>
                  </>
                ) : null}
                <div className="cap-explain">
                  {USE_LABEL[p.use]} · {p.deductible ? "interest deductible" : "not deductible"}
                  {p.date ? ` · ${formatDate(p.date)}` : ""}
                  {p.document ? (
                    <>
                      {" "}
                      · <Link to={`/documents/${p.document.id}`}>{p.document.originalFilename}</Link>
                    </>
                  ) : (
                    " · no evidence linked"
                  )}
                </div>
              </div>
              <WhyClaimed targetType="LOAN_PURPOSE" targetId={p.id} hasReason={data.reasonsFor.includes(p.id)} deductible={p.deductible} onChange={load} />
              <button
                className="icon-btn danger"
                aria-label="Delete this use"
                onClick={() => confirmThenDelete(`Delete "${p.description}" from this loan?`, () => api.debtAllocation.removePurpose(p.id)).then((d) => {
                    if (d) load();
                  })}
              >
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label>Date drawn (optional)</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label>Used for</label>
              <select
                value={form.use}
                onChange={(e) => {
                  const use = e.target.value as LoanUse;
                  setForm({ ...form, use, deductible: DEDUCTIBLE_BY_DEFAULT[use] });
                }}
              >
                {data.uses.map((u) => (
                  <option key={u} value={u}>
                    {USE_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>What it paid for (if recorded here)</label>
              <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
                <option value="">— Not recorded —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label>Description</label>
          <input
            placeholder="e.g. Purchase of 4 Rental Ave, incl. stamp duty"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label>Evidence</label>
          <select value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })}>
            {docOptions}
          </select>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.deductible} onChange={(e) => setForm({ ...form, deductible: e.target.checked })} />
            Used to produce income (interest deductible)
          </label>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={addPurpose}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={() => setAdding(true)}>
            Add a use
          </button>
        </div>
      )}

      <h3>Interest each year</h3>
      <p className="cap-explain">From the lender's annual interest statement. The deductible part is worked out from the uses above.</p>
      {data.interestYears.length === 0 ? (
        <p className="empty-state">No interest recorded yet.</p>
      ) : (
        <ul className="plain-list">
          {data.interestYears.map((y) => (
            <li key={y.id} className="loan-purpose-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{y.fyLabel}</strong> · {formatCurrency(y.interestCharged)} charged
                {split.deductibleShare !== null && <> · {formatCurrency(y.interestCharged * split.deductibleShare)} deductible</>}
                <div className="cap-explain">
                  {y.document ? <Link to={`/documents/${y.document.id}`}>{y.document.originalFilename}</Link> : "no statement linked"}
                </div>
              </div>
              <WhyClaimed targetType="LOAN_INTEREST_YEAR" targetId={y.id} hasReason={data.reasonsFor.includes(y.id)} onChange={load} />
              <button
                className="icon-btn danger"
                aria-label={`Delete interest for ${y.fyLabel}`}
                onClick={() => confirmThenDelete(`Delete the ${y.fyLabel} interest figure?`, () => api.debtAllocation.removeInterestYear(y.id)).then((d) => {
                    if (d) load();
                  })}
              >
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}
      {addingInterest ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Financial year</label>
              <input value={interestForm.fyLabel} onChange={(e) => setInterestForm({ ...interestForm, fyLabel: e.target.value })} />
            </div>
            <div>
              <label>Interest charged</label>
              <input
                type="number"
                value={interestForm.interestCharged}
                onChange={(e) => setInterestForm({ ...interestForm, interestCharged: e.target.value })}
              />
            </div>
          </div>
          <label>Lender's interest statement</label>
          <select value={interestForm.documentId} onChange={(e) => setInterestForm({ ...interestForm, documentId: e.target.value })}>
            {docOptions}
          </select>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={saveInterest}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setAddingInterest(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={() => setAddingInterest(true)}>
            Add a year's interest
          </button>
        </div>
      )}
    </div>
  );
}

/** Last financial year — the one whose interest statement has just arrived. */
function previousYear(): string {
  const now = financialYearLabelForToday();
  const start = Number(now.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
