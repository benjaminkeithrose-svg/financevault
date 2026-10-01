import { useEffect, useState } from "react";
import { api } from "../api/client.js";

/**
 * Mother's maiden name — used as a security question by many institutions,
 * so it's stored encrypted like a tax file number. Hidden by default; the
 * full value is fetched on request (each reveal is recorded in the audit
 * log) and hides itself again after a short while.
 */
export function MotherMaidenNameField({
  personId,
  hasValue,
  masked,
  onSaved,
}: {
  personId: string;
  hasValue?: boolean;
  masked?: string | null;
  onSaved: () => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => setRevealed(null), 30_000);
    return () => window.clearTimeout(t);
  }, [revealed]);

  async function save(motherMaidenName: string) {
    setError(null);
    try {
      await api.people.update(personId, { motherMaidenName } as never);
      setEditing(false);
      setValue("");
      setRevealed(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reveal() {
    setRevealed((await api.people.revealMotherMaidenName(personId)).motherMaidenName);
  }

  if (editing) {
    return (
      <div>
        <div className="toolbar">
          <input autoFocus autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn secondary" onClick={() => save(value)} disabled={!value.trim()}>
            Save
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
        {error && <div className="message-box warning">{error}</div>}
      </div>
    );
  }

  if (!hasValue) {
    return (
      <div className="toolbar">
        <span style={{ color: "var(--text-muted)" }}>Not recorded</span>
        <button className="btn secondary" onClick={() => setEditing(true)}>
          Add
        </button>
      </div>
    );
  }

  return (
    <div className="toolbar" style={{ alignItems: "center" }}>
      <span>{revealed ?? masked}</span>
      {revealed ? (
        <button className="btn secondary" onClick={() => setRevealed(null)}>
          Hide
        </button>
      ) : (
        <button className="btn secondary" onClick={reveal}>
          Show
        </button>
      )}
      <button className="btn secondary" onClick={() => setEditing(true)}>
        Change
      </button>
      <button
        className="btn danger secondary"
        onClick={() => {
          if (confirm("Remove the mother's maiden name on record?")) void save("");
        }}
      >
        Remove
      </button>
    </div>
  );
}
