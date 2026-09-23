import { useEffect, useState } from "react";
import { api, Entity, Property } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency } from "../utils.js";
import { CommercialProperties } from "./CommercialProperties.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";

function ResidentialProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft("properties:new", { name: "", entityId: "", address: "", state: "", purchaseDate: "", purchasePrice: "" });
  const [showForm, setShowForm] = useState(draft.restored);

  function load() {
    api.properties.list().then(setProperties);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId || !form.address.trim()) return;
    await api.properties.create({
      name: form.name,
      entityId: form.entityId,
      address: form.address,
      state: form.state || null,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
    });
    draft.clear();
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New property"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          <label>Display name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Property 1" />
          <label>Owning entity</label>
          <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label>Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>State</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="NSW" />
            </div>
            <div>
              <label>Purchase date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
          </div>
          <label>Purchase price</label>
          <input
            type="number"
            value={form.purchasePrice}
            onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
          />
          <FormActions onSubmit={create} draft={draft} label="Create" />
        </div>
      )}

      {properties.length === 0 ? (
        <p className="empty-state">No properties yet.</p>
      ) : (
        <ul className="item-card-list">
          {properties.map((p) => (
            <ItemCard
              key={p.id}
              to={`/properties/${p.id}`}
              title={p.asset?.name}
              subtitle={`${p.address} · ${p.entity?.name}`}
              right={<strong>{formatCurrency(p.asset?.currentValue)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Properties() {
  const [view, setView] = useState<"residential" | "commercial">("residential");

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Properties <HelpLink topic="properties" /></h2>
          <p>
            {view === "residential"
              ? "Purchase, financing, income, expenses, capital and documents — all against the one property."
              : "Commercial property is a distinct asset class: tenancies, leases, outgoings recoveries and yield/NOI metrics of its own."}
          </p>
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 16 }}>
        <button className={view === "residential" ? "selected" : ""} onClick={() => setView("residential")}>
          Residential
        </button>
        <button className={view === "commercial" ? "selected" : ""} onClick={() => setView("commercial")}>
          Commercial
        </button>
      </div>

      {view === "residential" ? <ResidentialProperties /> : <CommercialProperties />}
    </div>
  );
}
