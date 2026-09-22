import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Liability } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { humanize } from "../utils.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function LiabilityDetail() {
  const { id } = useParams<{ id: string }>();
  const [liability, setLiability] = useState<Liability | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function load() {
    if (!id) return;
    api.liabilities.get(id).then((l) => {
      setLiability(l);
      setForm({
        name: l.name,
        lender: l.lender || "",
        currentBalance: l.currentBalance?.toString() || "",
        originalAmount: l.originalAmount?.toString() || "",
        interestRate: l.interestRate?.toString() || "",
        loanType: l.loanType || "variable",
        repaymentAmount: l.repaymentAmount?.toString() || "",
        fixedPeriodEnds: toDateInput(l.fixedPeriodEnds),
        maturityDate: toDateInput(l.maturityDate),
        notes: l.notes || "",
      });
    });
  }

  useEffect(load, [id]);

  if (!liability) return <div className="empty-state">Loading…</div>;

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.liabilities.update(id, {
        name: form.name,
        lender: form.lender || null,
        currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
        originalAmount: form.originalAmount ? Number(form.originalAmount) : null,
        interestRate: form.interestRate ? Number(form.interestRate) : null,
        loanType: form.loanType || null,
        repaymentAmount: form.repaymentAmount ? Number(form.repaymentAmount) : null,
        fixedPeriodEnds: form.fixedPeriodEnds ? new Date(form.fixedPeriodEnds).toISOString() : null,
        maturityDate: form.maturityDate ? new Date(form.maturityDate).toISOString() : null,
        notes: form.notes || null,
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{liability.name}</h2>
          <p>
            {humanize(liability.liabilityType)} · {liability.entity?.name}
          </p>
        </div>
      </div>

      <div className="card">
        {(liability.securityProperty || liability.securityCommercialProperty) && (
          <div className="message-box info">
            Secured by: {liability.securityProperty?.address || liability.securityCommercialProperty?.name}
          </div>
        )}
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Lender</label>
        <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
        <div className="grid grid-2">
          <div>
            <label>Original amount</label>
            <input
              type="number"
              value={form.originalAmount}
              onChange={(e) => setForm({ ...form, originalAmount: e.target.value })}
            />
          </div>
          <div>
            <label>Current balance</label>
            <input
              type="number"
              value={form.currentBalance}
              onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-2">
          <div>
            <label>Interest rate (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
            />
          </div>
          <div>
            <label>Fixed / variable</label>
            <select value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value })}>
              <option value="variable">Variable</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>
        </div>
        <div className="grid grid-2">
          <div>
            <label>Repayment amount</label>
            <input
              type="number"
              value={form.repaymentAmount}
              onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })}
            />
          </div>
          <div>
            <label>Fixed period ends</label>
            <input
              type="date"
              value={form.fixedPeriodEnds}
              onChange={(e) => setForm({ ...form, fixedPeriodEnds: e.target.value })}
            />
          </div>
        </div>
        <label>Maturity date</label>
        <input type="date" value={form.maturityDate} onChange={(e) => setForm({ ...form, maturityDate: e.target.value })} />
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="LIABILITY" targetId={liability.id} />
      </div>
    </div>
  );
}
