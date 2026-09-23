import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CommercialPortfolio, CommercialProperty, Entity } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, humanize } from "../utils.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { OwnersPicker, useOwners, withOwners } from "../components/OwnersPicker.js";

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

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
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [form, setForm, draft] = useDraft("commercial-properties:new", emptyForm);
  const owners = useOwners("commercial-properties:new");
  const formDraft = withOwners(draft, owners);
  const [showForm, setShowForm] = useState(draft.restored);
  const [portfolio, setPortfolio] = useState<CommercialPortfolio | null>(null);

  function load() {
    api.commercialProperties.list().then(setProperties);
    api.commercialProperties.portfolio().then(setPortfolio);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  function toggleType(t: string) {
    setPropertyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function create() {
    if (!form.name.trim() || !form.entityId || !form.address.trim() || propertyTypes.length === 0 || owners.problem(form.entityId)) return;
    await api.commercialProperties.create({
      name: form.name,
      entityId: form.entityId,
      owners: owners.payload(form.entityId),
      address: form.address,
      state: form.state || null,
      postcode: form.postcode || null,
      propertyTypes,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      currentValue: form.currentValue ? Number(form.currentValue) : null,
      nla: form.nla ? Number(form.nla) : null,
    });
    draft.clear();
    owners.draft.clear();
    setPropertyTypes([]);
    setShowForm(false);
    load();
  }

  return (
    <div>
      {portfolio && portfolio.portfolio.numberOfProperties > 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Portfolio</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{portfolio.note}</p>
          <div className="grid grid-4">
            <div className="stat-tile">
              <div className="label">Properties</div>
              <div className="value">{portfolio.portfolio.numberOfProperties}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Total value</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalValue)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Total debt</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalDebt)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Total equity</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalEquity)}</div>
            </div>
          </div>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <div className="label">Weighted LVR</div>
              <div className="value">{pct(portfolio.portfolio.weightedLvr)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Portfolio NOI</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalNoi)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Portfolio net yield</div>
              <div className="value">{pct(portfolio.portfolio.portfolioNetYield)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Weighted occupancy</div>
              <div className="value">{pct(portfolio.portfolio.weightedOccupancy)}</div>
            </div>
          </div>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <div className="label">Weighted WALE (by rent)</div>
              <div className="value">{portfolio.portfolio.weightedWaleByRentYears?.toFixed(1) ?? "—"}y</div>
            </div>
            <div className="stat-tile">
              <div className="label">Annual rent</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalAnnualRent)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Annual interest</div>
              <div className="value">{formatCurrency(portfolio.portfolio.totalAnnualInterest)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Cash flow after financing</div>
              <div className="value">{formatCurrency(portfolio.portfolio.cashFlowAfterFinancing)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        <Link to="/commercial-properties/acquisition-model" className="btn secondary">
          Acquisition model
        </Link>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New commercial property"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={formDraft} />
          <label>Property name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Industrial Unit 4" />
          <OwnersPicker
            entities={entities}
            primaryId={form.entityId}
            onPrimary={(entityId) => setForm({ ...form, entityId })}
            owners={owners}
          />
          <label>Property type(s) — select all that apply</label>
          <div className="chip-row">
            {PROPERTY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip ${propertyTypes.includes(t) ? "selected" : ""}`}
                onClick={() => toggleType(t)}
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
          <FormActions onSubmit={create} draft={formDraft} label="Create" />
        </div>
      )}

      {properties.length === 0 ? (
        <p className="empty-state">No commercial properties yet.</p>
      ) : (
        <ul className="item-card-list">
          {properties.map((p) => (
            <ItemCard
              key={p.id}
              to={`/commercial-properties/${p.id}`}
              title={p.name}
              subtitle={`${p.propertyTypes.split(",").map(humanize).join(" / ")} · ${p.entity?.name || "No entity"} · ${p.tenancies?.length ?? 0} tenanc${(p.tenancies?.length ?? 0) === 1 ? "y" : "ies"}`}
              right={<strong>{formatCurrency(p.asset?.currentValue)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
