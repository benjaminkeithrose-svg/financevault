import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Asset, Entity } from "../api/client.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { describeVehicle, formatCurrency, humanize, monthlyEquivalent, vehicleTypeLabel } from "../utils.js";
import { EMPTY_VEHICLE_FIELDS, VehicleFields, vehicleFieldsPayload } from "../components/VehicleFields.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { LoadFailed } from "../components/LoadFailed.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const STANDALONE_TYPES = ["VEHICLE", "SHARES", "MANAGED_FUND", "EQUIPMENT", "SUPERANNUATION", "CASH", "OTHER"];

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
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  if (!asset) {
    if (loadError) return <LoadFailed message={loadError} backTo="/assets" backLabel="Back to assets" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.assets.update(id, {
        name: form.name,
        assetType: form.assetType,
        acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
        acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
        currentValue: form.currentValue ? Number(form.currentValue) : null,
        notes: form.notes || null,
        ...(form.assetType === "VEHICLE" ? vehicleFieldsPayload(form) : {}),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  const isVehicle = asset.assetType === "VEHICLE";
  const backTo = isVehicle ? "/vehicles" : "/assets";
  const loans = asset.securedLoans ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{asset.name}</h2>
          <p>
            {isVehicle ? `${vehicleTypeLabel(asset.vehicleType)} · ${describeVehicle(asset)}` : humanize(asset.assetType)} ·{" "}
            <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name}</Link>
          </p>
        </div>
      </div>

      <div className="card">
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Type</label>
        <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
          {STANDALONE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "VEHICLE" ? "Vehicle or boat" : humanize(t)}
            </option>
          ))}
        </select>
        {form.assetType === "VEHICLE" && <VehicleFields form={form} onChange={setForm} />}
        <div className="grid grid-2">
          <div>
            <label>{form.assetType === "VEHICLE" ? "Purchase date" : "Acquisition date"}</label>
            <input
              type="date"
              value={form.acquisitionDate}
              onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
            />
          </div>
          <div>
            <label>{form.assetType === "VEHICLE" ? "Purchase price" : "Acquisition cost"}</label>
            <input
              type="number"
              value={form.acquisitionCost}
              onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
            />
          </div>
        </div>
        <label>Current estimated value</label>
        <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
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
            <Link className="btn secondary" to={`/liabilities?newLoanFor=${asset.id}`}>
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

      <AssetOwnershipPanel asset={asset} entities={entities} onChange={load} />

      <div className="card">
        <h3>Documents</h3>
        <DocumentLinker targetType="ASSET" targetId={asset.id} />
      </div>

      <DeleteSection
        title={isVehicle ? "Delete this vehicle" : "Delete this asset"}
        note={
          isVehicle
            ? "Not possible while a loan is linked to it — delete the loan or unlink it first. Linked documents are kept."
            : "Removes the asset from your records and totals. Linked documents are kept."
        }
        question={`Delete ${asset.name}? This can't be undone.`}
        action={() => api.assets.remove(asset.id)}
        redirectTo={backTo}
      />
    </div>
  );
}
