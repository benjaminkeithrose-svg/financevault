import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Asset, Entity } from "../api/client.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";
import { SoldPanel } from "../components/SoldPanel.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { assetListRoute, assetTypeLabel, describeVehicle, formatCurrency, humanize, itemCategoryLabel, ITEM_CATEGORIES, monthlyEquivalent, vehicleTypeLabel } from "../utils.js";
import { ItemsPanel } from "../components/ItemsPanel.js";
import { MaintenancePanel } from "../components/MaintenancePanel.js";
import { EMPTY_VEHICLE_FIELDS, VehicleFields, vehicleFieldsPayload } from "../components/VehicleFields.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { useBackTo } from "../hooks/useBackTo.js";
import { LoadFailed } from "../components/LoadFailed.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const STANDALONE_TYPES = ["VEHICLE", "SUPERANNUATION", "EQUIPMENT", "COLLECTIBLE", "CASH", "OTHER", "SHARES", "MANAGED_FUND"];

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function load() {
    if (!id) return;
    api.assets.get(id).then((a) => {
      setAsset(a);
      setForm({
        name: a.name,
        assetType: a.assetType,
        acquisitionDate: toDateInput(a.acquisitionDate),
        acquisitionCost: a.acquisitionCost?.toString() || "",
        currentValue: a.currentValue?.toString() || "",
        notes: a.notes || "",
        vehicleType: a.vehicleType || EMPTY_VEHICLE_FIELDS.vehicleType,
        make: a.make || "",
        model: a.model || "",
        year: a.year?.toString() || "",
        registration: a.registration || "",
        registrationExpiry: toDateInput(a.registrationExpiry),
        identifier: a.identifier || "",
        itemCategory: a.itemCategory || "APPLIANCE",
        warrantyExpiry: toDateInput(a.warrantyExpiry),
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  // Back goes to the list this asset lives on — or, for an item, to what it sits under.
  useBackTo(
    asset
      ? asset.parent
        ? asset.parent.property
          ? `/properties/${asset.parent.property.id}`
          : asset.parent.commercialProperty
            ? `/commercial-properties/${asset.parent.commercialProperty.id}`
            : `/assets/${asset.parent.id}`
        : assetListRoute(asset.assetType)
      : null
  );
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  if (!asset) {
    if (loadError) return <LoadFailed message={loadError} backTo="/assets" backLabel="Back to other assets" />;
    return <div className="empty-state">Loading…</div>;
  }

  const isItem = !!asset.parentAssetId;
  const parentRoute = asset.parent
    ? asset.parent.property
      ? `/properties/${asset.parent.property.id}`
      : asset.parent.commercialProperty
        ? `/commercial-properties/${asset.parent.commercialProperty.id}`
        : `/assets/${asset.parent.id}`
    : null;
  // Things that get serviced and have parts: vehicles, equipment, items.
  const hasUpkeep = isItem || ["VEHICLE", "EQUIPMENT", "OTHER"].includes(asset.assetType);

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.assets.update(id, {
        name: form.name,
        assetType: form.assetType,
        acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
        acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
        notes: form.notes || null,
        // An item's value is part of what it sits under, so it has none of its own.
        ...(isItem ? {} : { currentValue: form.currentValue ? Number(form.currentValue) : null }),
        ...(form.assetType === "VEHICLE" ? vehicleFieldsPayload(form) : {}),
        ...(isItem
          ? {
              itemCategory: form.itemCategory,
              make: form.make || null,
              model: form.model || null,
              identifier: form.identifier || null,
              warrantyExpiry: form.warrantyExpiry ? new Date(form.warrantyExpiry).toISOString() : null,
            }
          : {}),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  const isVehicle = asset.assetType === "VEHICLE";
  const backTo = parentRoute ?? assetListRoute(asset.assetType);
  const loans = asset.securedLoans ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{asset.name}</h2>
          <p>
            {isItem && asset.parent && parentRoute ? (
              <>
                {itemCategoryLabel(asset.itemCategory)} · part of <Link to={parentRoute}>{asset.parent.name}</Link>
              </>
            ) : (
              <>
                {isVehicle ? `${vehicleTypeLabel(asset.vehicleType)} · ${describeVehicle(asset)}` : humanize(asset.assetType)} ·{" "}
                <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name}</Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {isItem ? (
          <div className="grid grid-2">
            <div>
              <label>Kind</label>
              <select value={form.itemCategory} onChange={(e) => setForm({ ...form, itemCategory: e.target.value })}>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Make</label>
              <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </div>
            <div>
              <label>Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <label>Serial number</label>
              <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            </div>
            <div>
              <label>Warranty ends</label>
              <input
                type="date"
                value={form.warrantyExpiry}
                onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <>
            <label>Type</label>
            <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
              {STANDALONE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {assetTypeLabel(t)}
                </option>
              ))}
            </select>
          </>
        )}
        {form.assetType === "VEHICLE" && <VehicleFields form={form} onChange={setForm} />}
        <div className="grid grid-2">
          <div>
            <label>{form.assetType === "VEHICLE" || isItem ? "Purchase date" : "Acquisition date"}</label>
            <input
              type="date"
              value={form.acquisitionDate}
              onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
            />
          </div>
          <div>
            <label>{form.assetType === "VEHICLE" || isItem ? "Purchase price" : "Acquisition cost"}</label>
            <input
              type="number"
              value={form.acquisitionCost}
              onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
            />
          </div>
        </div>
        {!isItem && (
          <>
            <label>Current estimated value</label>
            <input
              type="number"
              value={form.currentValue}
              onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
            />
          </>
        )}
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {isVehicle && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Loans for this {asset.vehicleType === "BOAT" || asset.vehicleType === "JET_SKI" ? "boat" : "vehicle"}</h3>
            <Link className="btn secondary" to={`/vehicle-loans?newLoanFor=${asset.id}`}>
              Add a loan
            </Link>
          </div>
          {loans.length === 0 ? (
            <p className="empty-state">No loan recorded against it.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {loans.map((l) => {
                const monthly = monthlyEquivalent(l.repaymentAmount, l.repaymentFrequency);
                return (
                  <li key={l.id}>
                    <Link to={`/liabilities/${l.id}`}>{l.name}</Link> — {formatCurrency(l.currentBalance)} owing
                    {l.lender ? ` with ${l.lender}` : ""}
                    {monthly ? ` · ${formatCurrency(monthly)} a month` : ""}
                  </li>
                );
              })}
            </ul>
          )}
          {loans.length > 0 && asset.currentValue ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Equity: {formatCurrency(asset.currentValue - loans.reduce((s, l) => s + (l.currentBalance ?? 0), 0))} (value
              less what's owing).
            </p>
          ) : null}
        </div>
      )}

      {hasUpkeep && (
        <MaintenancePanel
          assetId={asset.id}
          records={asset.maintenance ?? []}
          purchaseCost={asset.acquisitionCost}
          onChange={load}
        />
      )}

      {hasUpkeep && <ItemsPanel parentAssetId={asset.id} title={isItem ? "Parts and add-ons" : "Items and add-ons"} />}

      {!isItem && <AssetOwnershipPanel asset={asset} entities={entities} onChange={load} />}

      <div className="card">
        <h3>Documents</h3>
        <DocumentLinker targetType="ASSET" targetId={asset.id} />
      </div>

      {!isItem && <SoldPanel asset={asset} onChange={load} />}

      <DeleteSection
        title={isItem ? "Delete this item" : isVehicle ? "Delete this vehicle" : "Delete this asset"}
        note={
          isItem
            ? "Removes the item and its service history. Not possible while other items sit under it. Linked documents are kept."
            : isVehicle
              ? "Not possible while a loan is linked to it — delete the loan or unlink it first. Linked documents are kept."
              : "Removes the asset from your records and totals. Linked documents are kept."
        }
        question={`Delete ${asset.name}${
          (asset.maintenance?.length ?? 0) > 0
            ? ` and its ${asset.maintenance!.length} service ${asset.maintenance!.length === 1 ? "entry" : "entries"}`
            : ""
        }? This can't be undone.`}
        action={() => api.assets.remove(asset.id)}
        redirectTo={backTo}
      />
    </div>
  );
}
