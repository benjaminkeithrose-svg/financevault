import { useEffect, useState } from "react";
import { api, Asset, Entity } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { EMPTY_VEHICLE_FIELDS, VehicleFields, vehicleFieldsPayload } from "../components/VehicleFields.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { describeVehicle, formatCurrency, formatDate, humanize, vehicleTypeLabel } from "../utils.js";

const STANDALONE_TYPES = ["VEHICLE", "SHARES", "MANAGED_FUND", "EQUIPMENT", "SUPERANNUATION", "CASH", "OTHER"];

const emptyForm = (assetType: string) => ({
  name: "",
  assetType,
  entityId: "",
  acquisitionDate: "",
  acquisitionCost: "",
  currentValue: "",
  ...EMPTY_VEHICLE_FIELDS,
});

/**
 * The asset register. With `only="VEHICLE"` it becomes the Vehicles & boats
 * page: the same records, filtered, with the vehicle form open by default.
 */
export function Assets({ only }: { only?: "VEHICLE" }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft<Record<string, string>>(
    only ? "vehicles:new" : "assets:new",
    emptyForm(only ?? "VEHICLE")
  );
  const [showForm, setShowForm] = useState(draft.restored);
  const isVehicle = form.assetType === "VEHICLE";

  function load() {
    api.assets.list().then((all) => setAssets(only ? all.filter((a) => a.assetType === only) : all));
  }

  useEffect(load, [only]);
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
      ...(isVehicle ? vehicleFieldsPayload(form) : {}),
    });
    draft.clear();
    setShowForm(false);
    load();
  }

  function subtitle(a: Asset): string {
    const parts =
      a.assetType === "VEHICLE"
        ? [vehicleTypeLabel(a.vehicleType), describeVehicle(a) !== a.name ? describeVehicle(a) : ""]
        : [humanize(a.assetType)];
    parts.push(a.entity?.name || "No entity");
    const loans = a.securedLoans?.length ?? 0;
    if (loans > 0) parts.push(`${loans} loan${loans === 1 ? "" : "s"}`);
    else if (a.acquisitionDate) parts.push(`Acquired ${formatDate(a.acquisitionDate)}`);
    return parts.filter(Boolean).join(" · ");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {only ? "Vehicles & boats" : "Assets"} <HelpLink topic={only ? "vehicles" : "loans-assets"} />
          </h2>
          <p>
            {only
              ? "Cars, motorcycles, boats, jet skis, caravans and trailers — and the loans against them."
              : "Every asset in one register. Properties and investment accounts have their own pages — this covers the rest."}
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : only ? "New vehicle" : "New asset"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={isVehicle ? "Family car, The tinny…" : "Toyota Hilux"}
          />
          {!only && (
            <>
              <label>Type</label>
              <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
                {STANDALONE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "VEHICLE" ? "Vehicle or boat" : humanize(t)}
                  </option>
                ))}
              </select>
            </>
          )}
          {isVehicle && <VehicleFields form={form} onChange={setForm} />}
          <label>Owned by</label>
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
              <label>{isVehicle ? "Purchase date" : "Acquisition date"}</label>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
              />
            </div>
            <div>
              <label>{isVehicle ? "Purchase price" : "Acquisition cost"}</label>
              <input
                type="number"
                value={form.acquisitionCost}
                onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
              />
            </div>
          </div>
          <label>Current estimated value</label>
          <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
          <FormActions onSubmit={create} draft={draft} />
        </div>
      )}

      {assets.length === 0 ? (
        <p className="empty-state">{only ? "No vehicles or boats recorded yet." : "No assets recorded yet."}</p>
      ) : (
        <ul className="item-card-list">
          {assets.map((a) => (
            <ItemCard
              key={a.id}
              to={a.property ? `/properties/${a.property.id}` : `/assets/${a.id}`}
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
