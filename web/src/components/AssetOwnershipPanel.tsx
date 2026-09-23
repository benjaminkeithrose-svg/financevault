import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { confirmThenDelete } from "../utils.js";
import { IconBin } from "./icons.js";

interface ShareRow {
  id: string;
  ownerEntityId: string;
  ownerEntity?: Entity | null;
  ownershipPercent: number;
  ownershipType?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

/**
 * Who owns (or owes) what share of this. The owner on record keeps whatever
 * the listed shares leave over, so adding "Sam, 50%" to Alex's house makes
 * it 50/50. Each owner's share is what counts in their own figures; the
 * family total always counts the whole thing once.
 */
export function AssetOwnershipPanel({
  asset,
  entities,
  onChange,
  kind = "asset",
}: {
  asset: { id: string; entityId: string; entity?: Entity | null; ownerships?: ShareRow[] };
  entities: Entity[];
  onChange: () => void;
  kind?: "asset" | "loan";
}) {
  const [showForm, setShowForm] = useState(false);
  const [ownerEntityId, setOwnerEntityId] = useState("");
  const [percent, setPercent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const rows = (asset.ownerships ?? []).filter((o) => !o.endDate || o.endDate.slice(0, 10) >= today);
  const listedTotal = rows.reduce((s, o) => s + o.ownershipPercent, 0);
  const recordListed = rows.some((o) => o.ownerEntityId === asset.entityId);
  const leftToRecord = rows.length > 0 && !recordListed ? Math.max(0, 100 - listedTotal) : 0;
  const verb = kind === "loan" ? "owes" : "owns";

  async function add() {
    setError(null);
    if (!ownerEntityId || !percent) {
      setError("Choose who, and their share.");
      return;
    }
    try {
      const data = { ownerEntityId, ownershipPercent: Number(percent) };
      if (kind === "loan") await api.liabilities.addOwnership(asset.id, data);
      else await api.assets.addOwnership(asset.id, { ...data, ownershipType: "LEGAL" });
      setOwnerEntityId("");
      setPercent("");
      setShowForm(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(row: ShareRow) {
    const action = () => (kind === "loan" ? api.liabilities.removeOwnership(row.id) : api.assets.removeOwnership(row.id));
    if (await confirmThenDelete(`Remove ${row.ownerEntity?.name ?? "this owner"}'s ${row.ownershipPercent}% share?`, action)) onChange();
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{kind === "loan" ? "Who owes it" : "Who owns it"}</h3>
      {rows.length === 0 ? (
        <p className="empty-state">
          <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name ?? "The owner on record"}</Link> {verb} 100%.
        </p>
      ) : (
        <ul className="plain-list">
          {rows.map((o) => (
            <li key={o.id}>
              <span>
                <Link to={`/entities/${o.ownerEntityId}`}>{o.ownerEntity?.name ?? "Owner"}</Link> — {o.ownershipPercent}%
                {o.notes ? <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {o.notes}</span> : null}
              </span>
              <button className="icon-btn danger" aria-label={`Remove ${o.ownerEntity?.name ?? "owner"}'s share`} onClick={() => remove(o)}>
                <IconBin />
              </button>
            </li>
          ))}
          {leftToRecord > 0 && (
            <li>
              <span>
                <Link to={`/entities/${asset.entityId}`}>{asset.entity?.name}</Link> — {Math.round(leftToRecord * 100) / 100}%{" "}
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>(the rest, as owner on record)</span>
              </span>
            </li>
          )}
        </ul>
      )}
      {rows.length > 0 && recordListed && Math.abs(listedTotal - 100) > 0.01 && (
        <p className="cap-note over">The shares add up to {Math.round(listedTotal * 100) / 100}%, not 100%.</p>
      )}

      {showForm ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Who</label>
              <select value={ownerEntityId} onChange={(e) => setOwnerEntityId(e.target.value)}>
                <option value="">— Select —</option>
                {entities
                  .filter((e) => !rows.some((o) => o.ownerEntityId === e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label>Their share (%)</label>
              <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={add}>
              Add
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={() => setShowForm(true)}>
            {kind === "loan" ? "Add a borrower's share" : "Add an owner's share"}
          </button>
        </div>
      )}
    </div>
  );
}
