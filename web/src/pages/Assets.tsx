import { useEffect, useState } from "react";
import { api, Asset, Entity } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { EMPTY_VEHICLE_FIELDS, VehicleFields, vehicleFieldsPayload } from "../components/VehicleFields.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { OwnersPicker, useOwners, withOwners } from "../components/OwnersPicker.js";
import { assetTypeLabel, describeVehicle, formatCurrency, formatDate, OTHER_ASSET_TYPES, vehicleTypeLabel } from "../utils.js";

export type AssetList = "VEHICLE" | "SUPER" | "OTHER";

// Each kind of asset has one home. Properties, investments and bank accounts
// have their own pages; these three cover the rest.
const LISTS: Record<
  AssetList,
  { key: string; title: string; blurb: string; newLabel: string; empty: string; help: string; matches: (t: string) => boolean }
> = {
  VEHICLE: {
    key: "vehicles:new",
    title: "Vehicles & boats",
    blurb: "Cars, motorcycles, boats, jet skis, caravans and trailers — and the loans against them.",
    newLabel: "New vehicle",
    empty: "No vehicles or boats recorded yet.",
    help: "vehicles",
    matches: (t) => t === "VEHICLE",
  },
  SUPER: {
    key: "super:new",
    title: "Super",
    blurb: "Balances in retail and industry super funds. A self-managed super fund is set up under People & entities instead.",
    newLabel: "New super account",
    empty: "No super recorded yet.",
    help: "loans-assets",
    matches: (t) => t === "SUPERANNUATION",
  },
  OTHER: {
    key: "assets:new",
    title: "Other assets",
    blurb: "Anything else of value — equipment, collectibles, cash held outside your bank accounts. Shares and crypto go in Investments.",
    newLabel: "New asset",
    empty: "No other assets recorded yet.",
    help: "loans-assets",
    matches: (t) => !["PROPERTY", "COMMERCIAL_PROPERTY", "VEHICLE", "SUPERANNUATION"].includes(t),
  },
};

const emptyForm = (list: AssetList) => ({
  name: "",
  assetType: list === "VEHICLE" ? "VEHICLE" : list === "SUPER" ? "SUPERANNUATION" : "EQUIPMENT",
  entityId: "",
  acquisitionDate: "",
  acquisitionCost: "",
  currentValue: "",
  ...EMPTY_VEHICLE_FIELDS,
});

/** One of the asset lists: Vehicles & boats, Super, or Other assets. */
export function Assets({ list }: { list: AssetList }) {
  const config = LISTS[list];
  const [assets, setAssets] = useState<Asset[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft<Record<string, string>>(config.key, emptyForm(list));
  const owners = useOwners(config.key);
  const formDraft = withOwners(draft, owners);
  const [showForm, setShowForm] = useState(draft.restored);
  const isVehicle = list === "VEHICLE";
  const isSuper = list === "SUPER";

  function load() {
    api.assets.list().then((all) => setAssets(all.filter((a) => config.matches(a.assetType))));
  }

  useEffect(load, [list]);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function create() {
    if (!form.name.trim() || !form.entityId || (!isSuper && owners.problem(form.entityId))) return;
    await api.assets.create({
      name: form.name,
      assetType: form.assetType,
      entityId: form.entityId,
      owners: isSuper ? undefined : owners.payload(form.entityId),
      acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
      currentValue: form.currentValue ? Number(form.currentValue) : null,
      ...(isVehicle ? vehicleFieldsPayload(form) : {}),
    });
    draft.clear();
    owners.draft.clear();
    setShowForm(false);
    load();
  }

  function subtitle(a: Asset): string {
    const parts = isVehicle
      ? [vehicleTypeLabel(a.vehicleType), describeVehicle(a) !== a.name ? describeVehicle(a) : ""]
      : isSuper
        ? []
        : [assetTypeLabel(a.assetType)];
    parts.push(a.entity?.name || "No entity");
    const loans = a.securedLoans?.length ?? 0;
    if (loans > 0) parts.push(`${loans} loan${loans === 1 ? "" : "s"}`);
    else if (a.acquisitionDate && !isSuper) parts.push(`Acquired ${formatDate(a.acquisitionDate)}`);
    return parts.filter(Boolean).join(" · ");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {config.title} <HelpLink topic={config.help} />
          </h2>
          <p>{config.blurb}</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : config.newLabel}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={formDraft} />
          <label>{isSuper ? "Fund" : "Name"}</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={isVehicle ? "Family car, The tinny…" : isSuper ? "AustralianSuper" : "Ride-on mower"}
          />
          {list === "OTHER" && (
            <>
              <label>Kind</label>
              <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
                {OTHER_ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {isVehicle && <VehicleFields form={form} onChange={setForm} />}
          {isSuper ? (
            <>
              <label>Member</label>
              <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
                <option value="">— Select —</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <OwnersPicker
              entities={entities}
              primaryId={form.entityId}
              onPrimary={(entityId) => setForm({ ...form, entityId })}
              owners={owners}
            />
          )}
          {!isSuper && (
            <div className="grid grid-2">
              <div>
                <label>Purchase date</label>
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
                  value={form.acquisitionCost}
                  onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
                />
              </div>
            </div>
          )}
          <label>{isSuper ? "Current balance" : "Current estimated value"}</label>
          <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
          <FormActions onSubmit={create} draft={formDraft} />
        </div>
      )}

      {assets.length === 0 ? (
        <p className="empty-state">{config.empty}</p>
      ) : (
        <ul className="item-card-list">
          {assets.map((a) => (
            <ItemCard
              key={a.id}
              to={`/assets/${a.id}`}
              title={a.name}
              subtitle={subtitle(a)}
              right={<strong>{formatCurrency(a.currentValue)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
