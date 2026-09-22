import { useEffect, useState } from "react";
import { api, Entity, InvestmentAccount } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { humanize } from "../utils.js";

const ACCOUNT_TYPES = ["SHARES", "ETF", "MANAGED_FUND", "TERM_DEPOSIT", "BOND", "OTHER"];

export function Investments() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ institution: "", accountRef: "", entityId: "", accountType: "SHARES" });

  function load() {
    api.investments.list().then(setAccounts);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.institution.trim() || !form.entityId) return;
    await api.investments.create({
      institution: form.institution,
      accountRef: form.accountRef || null,
      entityId: form.entityId,
      accountType: form.accountType,
    });
    setForm({ institution: "", accountRef: "", entityId: "", accountType: "SHARES" });
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Investments</h2>
          <p>Shares, ETFs, managed funds, term deposits and bonds — holdings, cost base and CGT record-keeping.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New account"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Institution</label>
          <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="CommSec" />
          <label>Account reference (optional)</label>
          <input value={form.accountRef} onChange={(e) => setForm({ ...form, accountRef: e.target.value })} />
          <label>Entity</label>
          <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label>Type</label>
          <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="empty-state">No investment accounts yet.</p>
      ) : (
        <ul className="item-card-list">
          {accounts.map((a) => (
            <ItemCard
              key={a.id}
              to={`/investments/${a.id}`}
              title={a.institution}
              subtitle={`${humanize(a.accountType)} · ${a.entity?.name || "No entity"}`}
              right={<span className="tag">{a.holdings.length} holdings</span>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
