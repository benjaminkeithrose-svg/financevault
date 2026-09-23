import { useEffect, useState } from "react";
import { api, Account, Entity } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, humanize } from "../utils.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { OwnersPicker, useOwners, withOwners } from "../components/OwnersPicker.js";
import { Liability } from "../api/client.js";

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
    offsetForLiabilityId: "",
  });
  const owners = useOwners("bank-accounts:new");
  const formDraft = withOwners(draft, owners);
  const [showForm, setShowForm] = useState(draft.restored);
  const [loans, setLoans] = useState<Liability[]>([]);

  function load() {
    api.banking.listAccounts().then(setAccounts);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.liabilities.list().then((all) => setLoans(all.filter((l) => l.liabilityType !== "CREDIT_CARD")));
  }, []);

  async function create() {
    if (!form.institution.trim() || !form.accountName.trim() || !form.entityId || owners.problem(form.entityId)) return;
    await api.banking.createAccount({
      institution: form.institution,
      accountName: form.accountName,
      accountNumber: form.accountNumber || null,
      bsb: form.bsb || null,
      entityId: form.entityId,
      owners: owners.payload(form.entityId),
      offsetForLiabilityId: form.accountType === "OFFSET" ? form.offsetForLiabilityId || null : null,
      accountType: form.accountType,
      currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
      openingBalance: form.currentBalance ? Number(form.currentBalance) : null,
    });
    draft.clear();
    owners.draft.clear();
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
          <DraftNotice draft={formDraft} />
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
          <OwnersPicker entities={entities} primaryId={form.entityId} onPrimary={(entityId) => setForm({ ...form, entityId })} owners={owners} />
          <label>Type</label>
          <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
          {form.accountType === "OFFSET" && (
            <>
              <label>Offsets which loan?</label>
              <select value={form.offsetForLiabilityId} onChange={(e) => setForm({ ...form, offsetForLiabilityId: e.target.value })}>
                <option value="">— Choose later —</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label>Current balance</label>
          <input type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} />
          <FormActions onSubmit={create} draft={formDraft} label="Create" />
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
