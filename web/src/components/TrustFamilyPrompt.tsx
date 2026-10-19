import { useState } from "react";
import { api, FamilySuggestion } from "../api/client.js";

/**
 * Shown after someone becomes trustee, appointor or settlor of a trust: their
 * partner and children, all ticked, to be added as beneficiaries. Untick
 * anyone who shouldn't be in it. Nothing is added until confirmed.
 */
export function TrustFamilyPrompt({
  entityId,
  entityName,
  suggestions,
  onDone,
}: {
  entityId: string;
  entityName: string;
  suggestions: FamilySuggestion[];
  onDone: () => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set(suggestions.map((s) => s.personId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }

  async function confirm() {
    if (ticked.size === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      await api.entities.addBeneficiaries(entityId, [...ticked]);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="trust-family-title">
      <div className="card dialog">
        <h3 id="trust-family-title" style={{ marginTop: 0 }}>
          Add the family to {entityName}?
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          These people will be added as beneficiaries. Untick anyone who shouldn't be.
        </p>
        <ul className="tick-list">
          {suggestions.map((s) => (
            <li key={s.personId}>
              <label>
                <input type="checkbox" checked={ticked.has(s.personId)} onChange={() => toggle(s.personId)} />
                {s.name} <span style={{ color: "var(--text-muted)" }}>({s.relation === "PARTNER" ? "partner" : "child"})</span>
              </label>
            </li>
          ))}
        </ul>
        {error && <div className="message-box warning">{error}</div>}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn" onClick={confirm} disabled={busy}>
            {ticked.size === 0 ? "Don't add anyone" : `Add ${ticked.size} as beneficiar${ticked.size === 1 ? "y" : "ies"}`}
          </button>
          <button className="btn secondary" onClick={onDone} disabled={busy}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
