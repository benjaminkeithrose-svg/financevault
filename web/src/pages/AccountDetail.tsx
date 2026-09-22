import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Account, TaxCategory } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { TransactionCsvImport } from "../components/TransactionCsvImport.js";
import { formatCurrency, formatDate, humanize, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";

const STATUSES = ["UNREVIEWED", "CATEGORISED", "MATCHED", "RECONCILED", "NEEDS_REVIEW"];

const emptyTxn = { date: "", description: "", amount: "", counterparty: "", taxCategoryId: "" };

export function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTxn);

  function load() {
    if (!id) return;
    api.banking.getAccount(id).then(setAccount).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.taxCategories.list().then(setTaxCategories);
  }, []);

  if (!account) {
    if (loadError) return <LoadFailed message={loadError} backTo="/banking" backLabel="Back to banking" />;
    return <div className="empty-state">Loading…</div>;
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
