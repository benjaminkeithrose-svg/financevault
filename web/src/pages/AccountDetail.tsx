import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Account, Entity, TaxCategory } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { TransactionCsvImport } from "../components/TransactionCsvImport.js";
import { formatCurrency, formatDate, humanize, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";

const ACCOUNT_TYPES = ["TRANSACTION", "SAVINGS", "OFFSET", "CREDIT_CARD", "OTHER"];
const STATUSES = ["UNREVIEWED", "CATEGORISED", "MATCHED", "RECONCILED", "NEEDS_REVIEW"];

const emptyTxn = { date: "", description: "", amount: "", counterparty: "", taxCategoryId: "" };

export function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTxn);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();

  function load() {
    if (!id) return;
    api.banking.getAccount(id).then(setAccount).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.taxCategories.list().then(setTaxCategories);
    api.entities.list().then(setEntities).catch(() => {});
  }, []);

  if (!account) {
    if (loadError) return <LoadFailed message={loadError} backTo="/banking" backLabel="Back to banking" />;
    return <div className="empty-state">Loading…</div>;
  }

  function startEditing() {
    if (!account) return;
    setDetails({
      accountName: account.accountName,
      institution: account.institution,
      bsb: account.bsb ?? "",
      accountNumber: account.accountNumber ?? "",
      accountType: account.accountType,
      entityId: account.entityId,
      currentBalance: account.currentBalance?.toString() ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function saveDetails() {
    if (!id) return;
    try {
      await api.banking.updateAccount(id, {
        accountName: details.accountName,
        institution: details.institution,
        bsb: details.bsb || null,
        accountNumber: details.accountNumber || null,
        accountType: details.accountType,
        entityId: details.entityId,
        currentBalance: details.currentBalance === "" ? null : Number(details.currentBalance),
      });
      setEditing(false);
      load();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  }

  async function deleteAccount() {
    if (!id || !account) return;
    const count = (account.transactions || []).length;
    const deleted = await confirmThenDelete(
      `Delete the account "${account.accountName}"` +
        (count > 0 ? ` and all ${count} of its transactions?` : "?") +
        "\n\nThis can't be undone. Documents linked to it are kept. " +
        "You can import the transactions again from your bank's CSV into another account.",
      () => api.banking.removeAccount(id)
    );
    if (deleted) navigate("/banking");
  }

  async function addTransaction() {
    if (!id || !form.date || !form.description.trim() || !form.amount) return;
    await api.banking.addTransaction(id, {
      date: new Date(form.date).toISOString(),
      description: form.description,
      amount: Number(form.amount),
      counterparty: form.counterparty || null,
      taxCategoryId: form.taxCategoryId || null,
    });
    setForm(emptyTxn);
    setShowForm(false);
    load();
  }

  async function updateStatus(transactionId: string, status: string) {
    await api.banking.updateTransaction(transactionId, { status });
    load();
  }

  async function removeTransaction(transactionId: string) {
    const deleted = await confirmThenDelete(
      "Delete this transaction?",
      () => api.banking.removeTransaction(transactionId)
    );
    if (!deleted) return;
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{account.accountName}</h2>
          <p>
            {account.institution} {account.bsb ? `· BSB ${account.bsb}` : ""} {account.accountNumber ? `· ${account.accountNumber}` : ""}
          </p>
        </div>
        <div className="stat-tile" style={{ minWidth: 160 }}>
          <div className="label">Balance</div>
          <div className="value">{formatCurrency(account.currentBalance)}</div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Account details</h3>
          {!editing && (
            <button className="btn secondary" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
        {!editing ? (
          <p style={{ marginBottom: 0 }}>
            {humanize(account.accountType)} · owned by {account.entity?.name ?? "—"}
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Account name</label>
                <input value={details.accountName} onChange={(e) => setDetails({ ...details, accountName: e.target.value })} />
              </div>
              <div>
                <label>Bank</label>
                <input value={details.institution} onChange={(e) => setDetails({ ...details, institution: e.target.value })} />
              </div>
              <div>
                <label>BSB</label>
                <input value={details.bsb} onChange={(e) => setDetails({ ...details, bsb: e.target.value })} />
              </div>
              <div>
                <label>Account number</label>
                <input
                  value={details.accountNumber}
                  onChange={(e) => setDetails({ ...details, accountNumber: e.target.value })}
                />
              </div>
              <div>
                <label>Type</label>
                <select value={details.accountType} onChange={(e) => setDetails({ ...details, accountType: e.target.value })}>
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Current balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={details.currentBalance}
                  onChange={(e) => setDetails({ ...details, currentBalance: e.target.value })}
                />
              </div>
            </div>
            <label>Owned by</label>
            <select value={details.entityId} onChange={(e) => setDetails({ ...details, entityId: e.target.value })}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {details.entityId !== account.entityId && (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                The account's transactions move to the new owner with it.
              </p>
            )}
            {saveError && <div className="message-box warning">{saveError}</div>}
            <div className="toolbar" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <div className="toolbar">
                <button className="btn" onClick={saveDetails}>
                  Save
                </button>
                <button className="btn secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
              <button className="btn danger secondary" onClick={deleteAccount}>
                Delete account
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Transactions</h3>
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add transaction"}
          </button>
        </div>

        {showForm && (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label>Amount (negative for money out)</label>
                <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-2">
              <div>
                <label>Counterparty</label>
                <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
              </div>
              <div>
                <label>Tax category</label>
                <select value={form.taxCategoryId} onChange={(e) => setForm({ ...form, taxCategoryId: e.target.value })}>
                  <option value="">— None —</option>
                  {taxCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addTransaction}>
                Add
              </button>
            </div>
          </div>
        )}

        {(account.transactions || []).length === 0 ? (
          <p className="empty-state">No transactions recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Counterparty</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(account.transactions || []).map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.description}</td>
                  <td>{t.counterparty || "—"}</td>
                  <td>{t.taxCategory?.name || "—"}</td>
                  <td>{formatCurrency(t.amount)}</td>
                  <td>
                    <select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn secondary" onClick={() => removeTransaction(t.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TransactionCsvImport accountId={account.id} onImported={load} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="ACCOUNT" targetId={account.id} />
      </div>
    </div>
  );
}
