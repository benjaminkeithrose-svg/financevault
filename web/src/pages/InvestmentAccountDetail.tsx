import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, InvestmentAccount } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { formatCurrency, formatDate } from "../utils.js";

const emptyHolding = {
  code: "",
  quantity: "",
  acquisitionDate: "",
  purchasePrice: "",
  disposalDate: "",
  salePrice: "",
  costBase: "",
  brokerage: "",
};

export function InvestmentAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<InvestmentAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyHolding);

  function load() {
    if (!id) return;
    api.investments.get(id).then(setAccount);
  }

  useEffect(load, [id]);

  if (!account) return <div className="empty-state">Loading…</div>;

  async function addHolding() {
    if (!id || !form.code.trim()) return;
    await api.investments.addHolding(id, {
      code: form.code,
      quantity: form.quantity ? Number(form.quantity) : null,
      acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      disposalDate: form.disposalDate ? new Date(form.disposalDate).toISOString() : null,
      salePrice: form.salePrice ? Number(form.salePrice) : null,
      costBase: form.costBase ? Number(form.costBase) : null,
      brokerage: form.brokerage ? Number(form.brokerage) : null,
    });
    setForm(emptyHolding);
    setShowForm(false);
    load();
  }

  async function removeHolding(holdingId: string) {
    await api.investments.removeHolding(holdingId);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{account.institution}</h2>
          <p>
            {account.accountRef ? `${account.accountRef} · ` : ""}
            {account.entity?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="stat-tile">
          <div className="label">Holdings</div>
          <div className="value">{account.holdings.length}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Realised gain / loss</div>
          <div className="value">{formatCurrency(account.realisedGainLoss)}</div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Holdings</h3>
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add holding"}
          </button>
        </div>

        {showForm && (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Code (e.g. ASX ticker)</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label>Quantity</label>
                <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Acquisition date</label>
                <input
                  type="date"
                  value={form.acquisitionDate}
                  onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                />
              </div>
              <div>
                <label>Purchase price</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Disposal date (if sold)</label>
                <input
                  type="date"
                  value={form.disposalDate}
                  onChange={(e) => setForm({ ...form, disposalDate: e.target.value })}
                />
              </div>
              <div>
                <label>Sale price</label>
                <input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Cost base</label>
                <input type="number" step="0.01" value={form.costBase} onChange={(e) => setForm({ ...form, costBase: e.target.value })} />
              </div>
              <div>
                <label>Brokerage</label>
                <input type="number" step="0.01" value={form.brokerage} onChange={(e) => setForm({ ...form, brokerage: e.target.value })} />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addHolding}>
                Add
              </button>
            </div>
          </div>
        )}

        {account.holdings.length === 0 ? (
          <p className="empty-state">No holdings recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Qty</th>
                <th>Acquired</th>
                <th>Purchase price</th>
                <th>Disposed</th>
                <th>Sale price</th>
                <th>Cost base</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {account.holdings.map((h) => (
                <tr key={h.id}>
                  <td>{h.code}</td>
                  <td>{h.quantity ?? "—"}</td>
                  <td>{formatDate(h.acquisitionDate)}</td>
                  <td>{formatCurrency(h.purchasePrice)}</td>
                  <td>{formatDate(h.disposalDate)}</td>
                  <td>{formatCurrency(h.salePrice)}</td>
                  <td>{formatCurrency(h.costBase)}</td>
                  <td>
                    <button className="btn secondary" onClick={() => removeHolding(h.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="INVESTMENT_ACCOUNT" targetId={account.id} />
      </div>
    </div>
  );
}
