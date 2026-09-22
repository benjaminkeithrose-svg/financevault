import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Entity, Liability, Property } from "../api/client.js";
import { formatCurrency, humanize } from "../utils.js";

const ALL_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "CREDIT_CARD", "PERSONAL_LOAN", "OTHER"];
const LOAN_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN"];

export function Liabilities({ scope }: { scope: "loans" | "all" }) {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
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
  });

  const allowedTypes = scope === "loans" ? LOAN_TYPES : ALL_TYPES;

  function load() {
    api.liabilities.list().then((all) => setLiabilities(all.filter((l) => allowedTypes.includes(l.liabilityType))));
  }

  useEffect(load, [scope]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.properties.list().then(setProperties);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId) return;
    await api.liabilities.create({
      name: form.name,
      liabilityType: form.liabilityType,
      entityId: form.entityId,
      lender: form.lender || null,
      currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
      interestRate: form.interestRate ? Number(form.interestRate) : null,
      loanType: form.loanType || null,
      repaymentAmount: form.repaymentAmount ? Number(form.repaymentAmount) : null,
      securityPropertyId: form.securityPropertyId || null,
    });
    setForm({ ...form, name: "", lender: "", currentBalance: "", interestRate: "", repaymentAmount: "" });
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
          {(form.liabilityType === "HOME_LOAN" || form.liabilityType === "INVESTMENT_LOAN") && (
            <>
              <label>Security property (optional)</label>
              <select
                value={form.securityPropertyId}
                onChange={(e) => setForm({ ...form, securityPropertyId: e.target.value })}
              >
                <option value="">— None —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.asset?.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {liabilities.length === 0 ? (
          <p className="empty-state">Nothing here yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Lender</th>
                <th>Balance</th>
                <th>Rate</th>
                <th>Security</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/liabilities/${l.id}`}>{l.name}</Link>
                  </td>
                  <td>{humanize(l.liabilityType)}</td>
                  <td>{l.entity?.name || "—"}</td>
                  <td>{l.lender || "—"}</td>
                  <td>{formatCurrency(l.currentBalance)}</td>
                  <td>{l.interestRate ? `${l.interestRate}%` : "—"}</td>
                  <td>{l.securityProperty?.address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
