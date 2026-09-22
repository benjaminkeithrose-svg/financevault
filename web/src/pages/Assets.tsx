import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, Entity } from "../api/client.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";

const STANDALONE_TYPES = ["VEHICLE", "SHARES", "MANAGED_FUND", "EQUIPMENT", "SUPERANNUATION", "CASH", "OTHER"];

export function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    assetType: "VEHICLE",
    entityId: "",
    acquisitionDate: "",
    acquisitionCost: "",
    currentValue: "",
  });

  function load() {
    api.assets.list().then(setAssets);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId) return;
    await api.assets.create({
      name: form.name,
      assetType: form.assetType,
      entityId: form.entityId,
      acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
      currentValue: form.currentValue ? Number(form.currentValue) : null,
    });
    setForm({ name: "", assetType: "VEHICLE", entityId: "", acquisitionDate: "", acquisitionCost: "", currentValue: "" });
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Assets</h2>
          <p>Every asset in one register. Properties and investment accounts have their own pages — this covers the rest.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New asset"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Toyota Hilux" />
          <label>Type</label>
          <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
            {STANDALONE_TYPES.map((t) => (
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
              <label>Acquisition cost</label>
              <input
                type="number"
                value={form.acquisitionCost}
                onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
              />
            </div>
          </div>
          <label>Current estimated value</label>
          <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {assets.length === 0 ? (
          <p className="empty-state">No assets recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Acquired</th>
                <th>Current value</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.property ? (
                      <Link to={`/properties/${a.property.id}`}>{a.name}</Link>
                    ) : (
                      a.name
                    )}
                  </td>
                  <td>{humanize(a.assetType)}</td>
                  <td>{a.entity?.name || "—"}</td>
                  <td>{formatDate(a.acquisitionDate)}</td>
                  <td>{formatCurrency(a.currentValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
