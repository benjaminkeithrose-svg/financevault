import { useEffect, useState } from "react";
import { api, Account, Entity } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, humanize } from "../utils.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";

const ACCOUNT_TYPES = ["TRANSACTION", "SAVINGS", "OFFSET", "CREDIT_CARD", "OTHER"];

export function Banking() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft("bank-accounts:new", {
    institution: "",
    accountName: "",
    accountNumber: "",
    bsb: "",
    entityId: "",
    accountType: "TRANSACTION",
    currentBalance: "",
  });
  const [showForm, setShowForm] = useState(draft.restored);

  function load() {
    api.banking.listAccounts().then(setAccounts);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.institution.trim() || !form.accountName.trim() || !form.entityId) return;
    await api.banking.createAccount({
      institution: form.institution,
      accountName: form.accountName,
      accountNumber: form.accountNumber || null,
      bsb: form.bsb || null,
      entityId: form.entityId,
      accountType: form.accountType,
      currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
      openingBalance: form.currentBalance ? Number(form.currentBalance) : null,
    });
    draft.clear();
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Bank accounts</h2>
          <p>Bank accounts and their transactions, imported from your bank's CSV export.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New account"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          <label>Institution</label>
          <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="CBA" />
          <label>Account name</label>
          <input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Everyday" />
          <div className="grid grid-2">
            <div>
              <label>BSB</label>
              <input value={form.bsb} onChange={(e) => setForm({ ...form, bsb: e.target.value })} />
            </div>
            <div>
              <label>Account number</label>
              <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
            </div>
          </div>
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
          <label>Current balance</label>
          <input type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} />
          <FormActions onSubmit={create} draft={draft} label="Create" />
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="empty-state">No accounts yet.</p>
      ) : (
        <ul className="item-card-list">
          {accounts.map((a) => (
            <ItemCard
              key={a.id}
              to={`/banking/${a.id}`}
              title={`${a.institution} ${a.accountName}`}
              subtitle={`${humanize(a.accountType)} · ${a.entity?.name || "No entity"} · ${a._count?.transactions ?? 0} transactions`}
              right={<strong>{formatCurrency(a.currentBalance)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
