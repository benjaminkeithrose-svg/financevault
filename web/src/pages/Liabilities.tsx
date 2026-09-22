import { useEffect, useState } from "react";
import { api, CommercialProperty, Entity, Liability, Property } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, humanize } from "../utils.js";

const ALL_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN", "CREDIT_CARD", "PERSONAL_LOAN", "OTHER"];
const LOAN_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"];

export function Liabilities({ scope }: { scope: "loans" | "all" }) {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [commercialProperties, setCommercialProperties] = useState<CommercialProperty[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [securityKind, setSecurityKind] = useState<"none" | "residential" | "commercial">("none");
  const [form, setForm] = useState({
    name: "",
    liabilityType: scope === "loans" ? "HOME_LOAN" : "CREDIT_CARD",
    entityId: "",
    lender: "",
    currentBalance: "",
    interestRate: "",
    loanType: "variable",
    repaymentAmount: "",
    securityPropertyId: "",
    securityCommercialPropertyId: "",
    interestOnly: false,
    repaymentFrequency: "MONTHLY",
  });

  const allowedTypes = scope === "loans" ? LOAN_TYPES : ALL_TYPES;

  function load() {
    api.liabilities.list().then((all) => setLiabilities(all.filter((l) => allowedTypes.includes(l.liabilityType))));
  }

  useEffect(load, [scope]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.properties.list().then(setProperties);
    api.commercialProperties.list().then(setCommercialProperties);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId) return;
    const isCommercial = form.liabilityType === "COMMERCIAL_LOAN";
    await api.liabilities.create({
      name: form.name,
      liabilityType: form.liabilityType,
      entityId: form.entityId,
      lender: form.lender || null,
      currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
      interestRate: form.interestRate ? Number(form.interestRate) : null,
      loanType: form.loanType || null,
      repaymentAmount: form.repaymentAmount ? Number(form.repaymentAmount) : null,
      securityPropertyId: securityKind === "residential" ? form.securityPropertyId || null : null,
      securityCommercialPropertyId: securityKind === "commercial" ? form.securityCommercialPropertyId || null : null,
      interestOnly: isCommercial ? form.interestOnly : null,
      repaymentFrequency: isCommercial ? form.repaymentFrequency : null,
    });
    setForm({ ...form, name: "", lender: "", currentBalance: "", interestRate: "", repaymentAmount: "" });
    setSecurityKind("none");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{scope === "loans" ? "Loans" : "Liabilities"}</h2>
          <p>{scope === "loans" ? "Home and investment property loans." : "Every debt — loans, credit cards, personal loans."}</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CBA Home Loan" />
          <label>Type</label>
          <select value={form.liabilityType} onChange={(e) => setForm({ ...form, liabilityType: e.target.value })}>
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
          <label>Entity</label>
          <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label>Lender</label>
          <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>Current balance</label>
              <input
                type="number"
                value={form.currentBalance}
                onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
              />
            </div>
            <div>
              <label>Interest rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Fixed / variable</label>
              <select value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value })}>
                <option value="variable">Variable</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div>
              <label>Repayment amount</label>
              <input
                type="number"
                value={form.repaymentAmount}
                onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })}
              />
            </div>
          </div>
          {(form.liabilityType === "HOME_LOAN" ||
            form.liabilityType === "INVESTMENT_LOAN" ||
            form.liabilityType === "COMMERCIAL_LOAN") && (
            <>
              <label>Security</label>
              <select value={securityKind} onChange={(e) => setSecurityKind(e.target.value as typeof securityKind)}>
                <option value="none">— None —</option>
                <option value="residential">Residential property</option>
                <option value="commercial">Commercial property</option>
              </select>
              {securityKind === "residential" && (
                <select
                  value={form.securityPropertyId}
                  onChange={(e) => setForm({ ...form, securityPropertyId: e.target.value })}
                  style={{ marginTop: 8 }}
                >
                  <option value="">— Select property —</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.asset?.name}
                    </option>
                  ))}
                </select>
              )}
              {securityKind === "commercial" && (
                <select
                  value={form.securityCommercialPropertyId}
                  onChange={(e) => setForm({ ...form, securityCommercialPropertyId: e.target.value })}
                  style={{ marginTop: 8 }}
                >
                  <option value="">— Select property —</option>
                  {commercialProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {form.liabilityType === "COMMERCIAL_LOAN" && (
            <div className="grid grid-2">
              <div>
                <label>Repayment type</label>
                <select
                  value={form.interestOnly ? "io" : "pi"}
                  onChange={(e) => setForm({ ...form, interestOnly: e.target.value === "io" })}
                >
                  <option value="pi">Principal & interest</option>
                  <option value="io">Interest-only</option>
                </select>
              </div>
              <div>
                <label>Repayment frequency</label>
                <select
                  value={form.repaymentFrequency}
                  onChange={(e) => setForm({ ...form, repaymentFrequency: e.target.value })}
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="FORTNIGHTLY">Fortnightly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                </select>
              </div>
            </div>
          )}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      {liabilities.length === 0 ? (
        <p className="empty-state">Nothing here yet.</p>
      ) : (
        <ul className="item-card-list">
          {liabilities.map((l) => (
            <ItemCard
              key={l.id}
              to={`/liabilities/${l.id}`}
              title={l.name}
              subtitle={`${humanize(l.liabilityType)} · ${l.entity?.name || "No entity"}${l.lender ? ` · ${l.lender}` : ""}${l.interestRate ? ` · ${l.interestRate}%` : ""}`}
              right={<strong>{formatCurrency(l.currentBalance)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
