import { HelpLink } from "../components/HelpLink.js";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Asset, Entity, Liability } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { LoanAllocationCard } from "../components/LoanAllocationCard.js";
import { DEBT_LISTS, debtListFor, describeVehicle, formatCurrency, liabilityTypeLabel, monthlyEquivalent, REPAYMENT_FREQUENCIES } from "../utils.js";
import { useBackTo } from "../hooks/useBackTo.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";

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
  const [trusts, setTrusts] = useState<Entity[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);

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
        holdingTrustEntityId: l.holdingTrustEntityId || "",
        fixedPeriodEnds: toDateInput(l.fixedPeriodEnds),
        maturityDate: toDateInput(l.maturityDate),
        startDate: toDateInput(l.startDate),
        facility: l.facility || "",
        notes: l.notes || "",
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useBackTo(liability ? DEBT_LISTS[debtListFor(liability.liabilityType)].route : null);
  useEffect(() => {
    api.assets.list().then((all) => setVehicles(all.filter((a) => a.assetType === "VEHICLE")));
    api.entities.list().then((all) => {
      setEntities(all);
      setTrusts(all.filter((e) => e.entityType === "HOLDING_TRUST" || e.entityType === "TRUST"));
    });
  }, []);

  if (!liability) {
    if (loadError) return <LoadFailed message={loadError} backTo="/loans" backLabel="Back to loans &amp; cards" />;
    return <div className="empty-state">Loading…</div>;
  }

  const isCard = liability.liabilityType === "CREDIT_CARD";
  const vehicleLinkable = VEHICLE_LINKABLE.includes(liability.liabilityType);
  const isLrba = liability.liabilityType === "LRBA_LOAN";
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
        ...(isLrba ? { holdingTrustEntityId: form.holdingTrustEntityId || null } : {}),
        fixedPeriodEnds: form.fixedPeriodEnds ? new Date(form.fixedPeriodEnds).toISOString() : null,
        maturityDate: form.maturityDate ? new Date(form.maturityDate).toISOString() : null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        ...(isCard ? {} : { facility: form.facility?.trim() || null }),
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
        {!isCard && (
          <>
            <label>Facility (loan splits share one name, e.g. "CBA home loan")</label>
            <input value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })} />
          </>
        )}
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
                <label>{isLrba ? "Date the fund entered into the loan" : "Start date (when the loan was taken out)"}</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
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
        {isLrba && (
          <>
            <label>Holding (bare) trust that holds the property</label>
            <select value={form.holdingTrustEntityId} onChange={(e) => setForm({ ...form, holdingTrustEntityId: e.target.value })}>
              <option value="">— Not recorded —</option>
              {trusts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
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

      {(liability.offsetAccounts ?? []).length > 0 && <OffsetCard liability={liability} />}

      <AssetOwnershipPanel kind="loan" asset={liability} entities={entities} onChange={load} />

      {!isCard && <LoanAllocationCard liabilityId={liability.id} />}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="LIABILITY" targetId={liability.id} />
      </div>
      <DeleteSection
        title="Delete this loan"
        note="Removes the loan from your records and totals. Linked documents are kept."
        question={`Delete ${liability.name}? This can't be undone.`}
        action={() => api.liabilities.remove(liability.id)}
        redirectTo={DEBT_LISTS[debtListFor(liability.liabilityType)].route}
      />
    </div>
  );
}

/** Offset accounts linked to this loan: what they hold, and roughly what they save. */
function OffsetCard({ liability }: { liability: Liability }) {
  const offsets = liability.offsetAccounts ?? [];
  const held = offsets.reduce((s, a) => s + Math.max(0, a.currentBalance ?? 0), 0);
  const used = Math.min(held, liability.currentBalance ?? 0);
  const saved = liability.interestRate ? (used * liability.interestRate) / 100 : null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Offset accounts <HelpLink topic="offsets" />
      </h3>
      <ul className="plain-list">
        {offsets.map((a) => (
          <li key={a.id}>
            <Link to={`/banking/${a.id}`}>
              {a.institution} — {a.accountName}
            </Link>
            <span>{formatCurrency(a.currentBalance)}</span>
          </li>
        ))}
      </ul>
      <p style={{ marginBottom: 0 }}>
        Interest is charged on {formatCurrency((liability.currentBalance ?? 0) - used)} rather than{" "}
        {formatCurrency(liability.currentBalance)}
        {saved !== null ? (
          <>
            {" "}
            — about <strong>{formatCurrency(saved)} a year</strong> less at {liability.interestRate}%.
          </>
        ) : (
          ". Add the interest rate to see what that saves."
        )}
      </p>
    </div>
  );
}
