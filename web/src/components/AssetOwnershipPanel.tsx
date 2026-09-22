import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, Entity } from "../api/client.js";
import { humanize, confirmThenDelete } from "../utils.js";

const OWNERSHIP_TYPES = ["LEGAL", "BENEFICIAL"];

// Supplements Asset.entityId (the primary/current owner, used everywhere
// else for simple queries) with explicit fractional or time-boxed splits —
// e.g. 50/50 between two entities — without ever changing the primary
// owner. Recording nothing here just means the primary entity owns 100%.
export function AssetOwnershipPanel({
  asset,
  entities,
  onChange,
}: {
  asset: Asset;
  entities: Entity[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [ownerEntityId, setOwnerEntityId] = useState("");
  const [percent, setPercent] = useState("");
  const [ownershipType, setOwnershipType] = useState("LEGAL");
  const [notes, setNotes] = useState("");

  const ownerships = asset.ownerships || [];
  const splitTotal = ownerships.reduce((s, o) => s + o.ownershipPercent, 0);

  async function add() {
    if (!ownerEntityId || !percent) return;
    await api.assets.addOwnership(asset.id, {
      ownerEntityId,
      ownershipPercent: Number(percent),
      ownershipType,
      notes: notes || null,
    });
    setOwnerEntityId("");
    setPercent("");
    setNotes("");
    setShowForm(false);
    onChange();
  }

  async function remove(id: string) {
    if (!(await confirmThenDelete("Remove this ownership share?", () => api.assets.removeOwnership(id)))) return;
    onChange();
  }

  return (
    <div className="card">
      <h3>Ownership split</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name}</Link> is the primary owner on record. Add a
        split here for fractional or joint ownership (e.g. 50/50 between two entities) — this never changes the
        primary owner above.
      </p>

      {ownerships.length === 0 ? (
        <p className="empty-state">No split recorded — {asset.entity?.name} owns 100%.</p>
      ) : (
        <>
          <ul className="item-card-list">
            {ownerships.map((o) => (
              <li key={o.id} className="item-card" style={{ cursor: "default" }}>
                <div className="item-card-body">
                  <div className="item-card-title">
                    <Link to={`/entities/${o.ownerEntityId}`}>{o.ownerEntity?.name}</Link>
                  </div>
                  <div className="item-card-subtitle">
                    {o.ownershipType ? `${humanize(o.ownershipType)} · ` : ""}
                    {o.ownershipPercent}%{o.notes ? ` · ${o.notes}` : ""}
                  </div>
                </div>
                <div className="item-card-meta">
                  <button className="btn secondary" onClick={() => remove(o.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {splitTotal !== 100 && (
            <div className="message-box warning">
              These splits total {splitTotal}%, not 100% — recorded as entered, just flagging it doesn't add up.
            </div>
          )}
        </>
      )}

      {showForm ? (
        <div style={{ marginTop: 12 }}>
          <label>Entity</label>
          <select value={ownerEntityId} onChange={(e) => setOwnerEntityId(e.target.value)}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <div className="grid grid-2">
            <div>
              <label>Ownership %</label>
              <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
            <div>
              <label>Type</label>
              <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}>
                {OWNERSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={add}>
              Add split
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={() => setShowForm(true)}>
            Add ownership split
          </button>
        </div>
      )}
    </div>
  );
}
