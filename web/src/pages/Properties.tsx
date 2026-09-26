import { useEffect, useState } from "react";
import { api, Entity, Property } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { SoldList } from "../components/SoldList.js";
import { formatCurrency } from "../utils.js";
import { CommercialProperties } from "./CommercialProperties.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { OwnersPicker, useOwners, withOwners } from "../components/OwnersPicker.js";
import { useFeatures } from "../features.js";

function ResidentialProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft("properties:new", { name: "", entityId: "", address: "", state: "", purchaseDate: "", purchasePrice: "" });
  const owners = useOwners("properties:new");
  const formDraft = withOwners(draft, owners);
  const [showForm, setShowForm] = useState(draft.restored);

  function load() {
    api.properties.list().then(setProperties);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId || !form.address.trim() || owners.problem(form.entityId)) return;
    await api.properties.create({
      name: form.name,
      entityId: form.entityId,
      owners: owners.payload(form.entityId),
      address: form.address,
      state: form.state || null,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
    });
    draft.clear();
    owners.draft.clear();
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
          <DraftNotice draft={formDraft} />
          <label>Display name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Property 1" />
          <OwnersPicker
            entities={entities}
            primaryId={form.entityId}
            onPrimary={(entityId) => setForm({ ...form, entityId })}
            owners={owners}
          />
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
          <FormActions onSubmit={create} draft={formDraft} label="Create" />
        </div>
      )}

      {properties.filter((p) => !p.asset?.disposalDate).length === 0 ? (
        <p className="empty-state">No properties yet.</p>
      ) : (
        <ul className="item-card-list">
          {properties.filter((p) => !p.asset?.disposalDate).map((p) => (
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
      <SoldList
        items={properties
          .filter((p) => p.asset?.disposalDate)
          .map((p) => ({ id: p.id, to: `/properties/${p.id}`, title: p.asset?.name ?? p.address, date: p.asset!.disposalDate!, price: p.asset?.disposalValue }))}
      />
    </div>
  );
}

export function Properties() {
  const [chosen, setView] = useState<"residential" | "commercial">("residential");
  const commercialOn = useFeatures().on("commercial");
  const view = commercialOn ? chosen : "residential";

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

      {commercialOn && (
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button className={view === "residential" ? "selected" : ""} onClick={() => setView("residential")}>
            Residential
          </button>
          <button className={view === "commercial" ? "selected" : ""} onClick={() => setView("commercial")}>
            Commercial
          </button>
        </div>
      )}

      {view === "residential" ? <ResidentialProperties /> : <CommercialProperties />}
    </div>
  );
}
