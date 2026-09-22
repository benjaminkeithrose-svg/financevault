import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Asset, Entity } from "../api/client.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { humanize, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const STANDALONE_TYPES = ["VEHICLE", "SHARES", "MANAGED_FUND", "EQUIPMENT", "SUPERANNUATION", "CASH", "OTHER"];

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id) return;
    if (!(await confirmThenDelete("Delete this asset?", () => api.assets.remove(id)))) return;
    navigate("/assets");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{asset.name}</h2>
          <p>
            {humanize(asset.assetType)} · <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name}</Link>
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
              {humanize(t)}
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
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="toolbar" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn danger secondary" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <AssetOwnershipPanel asset={asset} entities={entities} onChange={load} />

      <div className="card">
        <h3>Documents</h3>
        <DocumentLinker targetType="ASSET" targetId={asset.id} />
      </div>
    </div>
  );
}
