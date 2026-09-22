import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CommercialProperty, Entity } from "../api/client.js";
import { formatCurrency, humanize } from "../utils.js";

const PROPERTY_TYPES = [
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "WAREHOUSE",
  "LOGISTICS",
  "MEDICAL",
  "CHILDCARE",
  "HOSPITALITY",
  "MIXED_USE",
  "DEVELOPMENT_SITE",
  "LAND",
  "OTHER",
];

const emptyForm = {
  name: "",
  entityId: "",
  address: "",
  state: "",
  postcode: "",
  purchaseDate: "",
  purchasePrice: "",
  currentValue: "",
  nla: "",
};

export function CommercialProperties() {
  const [properties, setProperties] = useState<CommercialProperty[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.commercialProperties.list().then(setProperties);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  function toggleType(t: string) {
    setPropertyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function create() {
    if (!form.name.trim() || !form.entityId || !form.address.trim() || propertyTypes.length === 0) return;
    await api.commercialProperties.create({
      name: form.name,
      entityId: form.entityId,
      address: form.address,
      state: form.state || null,
      postcode: form.postcode || null,
      propertyTypes,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      currentValue: form.currentValue ? Number(form.currentValue) : null,
      nla: form.nla ? Number(form.nla) : null,
    });
    setForm(emptyForm);
    setPropertyTypes([]);
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New commercial property"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Property name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Industrial Unit 4" />
          <label>Owning entity</label>
          <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label>Property type(s) — select all that apply</label>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            {PROPERTY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`btn ${propertyTypes.includes(t) ? "" : "secondary"}`}
                onClick={() => toggleType(t)}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                {humanize(t)}
              </button>
            ))}
          </div>
          <label>Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>State</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="NSW" />
            </div>
            <div>
              <label>Postcode</label>
              <input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Purchase date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <label>NLA (m²)</label>
              <input type="number" value={form.nla} onChange={(e) => setForm({ ...form, nla: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Purchase price</label>
              <input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
            </div>
            <div>
              <label>Current estimated value</label>
              <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {properties.length === 0 ? (
          <p className="empty-state">No commercial properties yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Tenancies</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/commercial-properties/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.propertyTypes.split(",").map(humanize).join(" / ")}</td>
                  <td>{p.entity?.name || "—"}</td>
                  <td>{p.tenancies?.length ?? 0}</td>
                  <td>{formatCurrency(p.asset?.currentValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
