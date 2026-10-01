import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { confirmThenDelete, formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";

/**
 * A unit trust's unitholders and the share each holds. A holder can be a
 * person (through their personal entity) or another entity, such as a family
 * trust. Each holder's share of the trust's net assets counts in their own
 * figures; the family total counts the trust once.
 */
export function UnitholdersPanel({
  trust,
  netAssets,
  entities,
  onChange,
}: {
  trust: Entity;
  netAssets: number;
  entities: Entity[];
  onChange: () => void;
}) {
  const holders = trust.unitholders ?? [];
  const [showForm, setShowForm] = useState(holders.length === 0);
  const [holderId, setHolderId] = useState("");
  const [percent, setPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const total = holders.reduce((s, h) => s + (h.ownershipPercent ?? 0), 0);
  const left = Math.round((100 - total) * 100) / 100;

  async function add() {
    setError(null);
    if (!holderId || !percent) {
      setError("Choose who holds the units, and their share.");
      return;
    }
    try {
      await api.entities.addRelationship({
        fromEntityId: holderId,
        toEntityId: trust.id,
        relationshipType: "UNITHOLDER",
        ownershipPercent: Number(percent),
      });
      setHolderId("");
      setPercent("");
      setShowForm(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string, name: string) {
    if (await confirmThenDelete(`Remove ${name}'s units? Nothing else is deleted.`, () => api.entities.removeRelationship(id))) onChange();
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Unitholders <HelpLink topic="shared-ownership" />
        </h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)} disabled={left <= 0}>
          {showForm ? "Close" : "Add a unitholder"}
        </button>
      </div>
      {holders.length === 0 ? (
        <p className="empty-state">No unitholders yet. Add each person or entity with the share of units they hold.</p>
      ) : (
        <ul className="plain-list" style={{ marginTop: 8 }}>
          {holders.map((h) => {
            const name = h.fromEntity.personalFor?.name ?? h.fromEntity.name;
            const route = h.fromEntity.personalFor ? `/people/${h.fromEntity.personalFor.id}` : `/entities/${h.fromEntity.id}`;
            const pct = h.ownershipPercent ?? 0;
            return (
              <li key={h.id}>
                <span>
                  <Link to={route}>{name}</Link> — {pct}%{" "}
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>≈ {formatCurrency((Math.max(0, netAssets) * pct) / 100)}</span>
                </span>
                <button className="icon-btn danger" aria-label={`Remove ${name}'s units`} onClick={() => remove(h.id, name)}>
                  <IconBin />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {holders.length > 0 && left !== 0 && (
        <p className="cap-note">{left > 0 ? `${left}% of the units aren't allocated yet.` : `The units add up to ${total}%.`}</p>
      )}
      {showForm && (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Held by</label>
              <select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
                <option value="">— Select —</option>
                {entities
                  .filter((e) => e.id !== trust.id && !holders.some((h) => h.fromEntityId === e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.personalFor?.name ?? e.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label>Share of the units (%) — {left}% left</label>
              <input type="number" min="0" max={left} value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={add}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
