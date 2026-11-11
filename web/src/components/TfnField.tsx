import { useEffect, useState } from "react";
import { api } from "../api/client.js";

/**
 * Tax file number display and entry. Shows only the last three digits by
 * default; the full number is fetched on request (each reveal is recorded in
 * the audit log) and hidden again after a short while.
 */
export function TfnField({
  owner,
  id,
  hasTfn,
  tfnMasked,
  onSaved,
}: {
  owner: "person" | "entity";
  id: string;
  hasTfn?: boolean;
  tfnMasked?: string | null;
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

  const client = owner === "person" ? api.people : api.entities;

  async function save(tfn: string) {
    setError(null);
    try {
      await client.update(id, { tfn } as never);
      setEditing(false);
      setValue("");
      setRevealed(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reveal() {
    const { tfn } = await client.revealTfn(id);
    setRevealed(tfn);
  }

  if (editing) {
    return (
      <div>
        <div className="toolbar">
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            placeholder="123 456 782"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ maxWidth: 180 }}
          />
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

  if (!hasTfn) {
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
      <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{revealed ?? tfnMasked}</span>
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
          if (confirm("Remove this tax file number?")) void save("");
        }}
      >
        Remove
      </button>
    </div>
  );
}
