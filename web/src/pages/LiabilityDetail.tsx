import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Asset, Liability } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { describeVehicle, formatCurrency, liabilityTypeLabel, monthlyEquivalent, REPAYMENT_FREQUENCIES } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";

const LOAN_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"];
const VEHICLE_LINKABLE = ["VEHICLE_LOAN", "PERSONAL_LOAN"];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function LiabilityDetail() {
  const { id } = useParams<{ id: string }>();
  const [liability, setLiability] = useState<Liability | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<Asset[]>([]);

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
        repaymentFrequency: l.repaymentFrequency || "MONTHLY",
        creditLimit: l.creditLimit?.toString() || "",
        securityAssetId: l.securityAssetId || "",
        fixedPeriodEnds: toDateInput(l.fixedPeriodEnds),
        maturityDate: toDateInput(l.maturityDate),
        notes: l.notes || "",
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.assets.list().then((all) => setVehicles(all.filter((a) => a.assetType === "VEHICLE")));
  }, []);

  if (!liability) {
    if (loadError) return <LoadFailed message={loadError} backTo="/liabilities" backLabel="Back to loans" />;
    return <div className="empty-state">Loading…</div>;
  }

  const isCard = liability.liabilityType === "CREDIT_CARD";
  const vehicleLinkable = VEHICLE_LINKABLE.includes(liability.liabilityType);
  const monthly = monthlyEquivalent(Number(form.repaymentAmount) || null, form.repaymentFrequency);

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
        repaymentFrequency: isCard ? null : form.repaymentFrequency || null,
        creditLimit: isCard && form.creditLimit ? Number(form.creditLimit) : null,
        ...(vehicleLinkable ? { securityAssetId: form.securityAssetId || null } : {}),
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
            {liabilityTypeLabel(liability.liabilityType)} · {liability.entity?.name}
          </p>
        </div>
      </div>

      <div className="card">
        {(liability.securityProperty || liability.securityCommercialProperty) && (
          <div className="message-box info">
            Secured by: {liability.securityProperty?.address || liability.securityCommercialProperty?.name}
          </div>
        )}
        {isCard && (
          <div className="message-box info">
            Lenders assess a credit card on its limit, not the balance. A lower or cancelled limit can raise how much you
            can borrow.
          </div>
        )}
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Lender</label>
        <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
        <div className="grid grid-2">
          {isCard ? (
            <div>
              <label>Credit limit</label>
              <input
                type="number"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <label>Original amount</label>
              <input
                type="number"
                value={form.originalAmount}
                onChange={(e) => setForm({ ...form, originalAmount: e.target.value })}
              />
            </div>
          )}
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
          {!isCard && (
            <div>
              <label>Fixed / variable</label>
              <select value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value })}>
                <option value="variable">Variable</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
          )}
        </div>
        {!isCard && (
          <>
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
                <label>Paid</label>
                <select
                  value={form.repaymentFrequency}
                  onChange={(e) => setForm({ ...form, repaymentFrequency: e.target.value })}
                >
                  {REPAYMENT_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {monthly !== null && form.repaymentFrequency !== "MONTHLY" && (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>About {formatCurrency(monthly)} a month.</p>
            )}
            <div className="grid grid-2">
              <div>
                <label>Fixed period ends</label>
                <input
                  type="date"
                  value={form.fixedPeriodEnds}
                  onChange={(e) => setForm({ ...form, fixedPeriodEnds: e.target.value })}
                />
              </div>
              <div>
                <label>Maturity date</label>
                <input
                  type="date"
                  value={form.maturityDate}
                  onChange={(e) => setForm({ ...form, maturityDate: e.target.value })}
                />
              </div>
            </div>
          </>
        )}
        {vehicleLinkable && (
          <>
            <label>What it paid for</label>
            <select value={form.securityAssetId} onChange={(e) => setForm({ ...form, securityAssetId: e.target.value })}>
              <option value="">— Not linked to a vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({describeVehicle(v)})
                </option>
              ))}
            </select>
          </>
        )}
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
      <DeleteSection
        title="Delete this loan"
        note="Removes the loan from your records and totals. Linked documents are kept."
        question={`Delete ${liability.name}? This can't be undone.`}
        action={() => api.liabilities.remove(liability.id)}
        redirectTo={LOAN_TYPES.includes(liability.liabilityType) ? "/loans" : "/liabilities"}
      />
    </div>
  );
}
