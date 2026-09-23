import { useState } from "react";
import { api, MaintenanceRecord } from "../api/client.js";
import { DocumentLinker } from "./DocumentLinker.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { IconBin } from "./icons.js";
import { useDraft } from "../hooks/useDraft.js";
import { confirmThenDelete, formatCurrency, formatDate } from "../utils.js";

const KINDS = [
  { value: "SERVICE", label: "Service" },
  { value: "REPAIR", label: "Repair" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "PART", label: "Part / consumable" },
  { value: "OTHER", label: "Other" },
];

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { date: "", kind: "SERVICE", description: "", cost: "", provider: "", nextDueDate: "" };

/**
 * Service, repair and running-cost history for an item: when it was done,
 * by whom, what it cost, and when it's next due (which also shows in the
 * expiry calendar). Invoices attach to each entry.
 */
export function MaintenancePanel({
  assetId,
  records,
  purchaseCost,
  onChange,
}: {
  assetId: string;
  records: MaintenanceRecord[];
  purchaseCost: number | null | undefined;
  onChange: () => void;
}) {
  const [form, setForm, draft] = useDraft(`maintenance:${assetId}:new`, EMPTY);
  const [showForm, setShowForm] = useState(draft.restored);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spent = records.reduce((s, r) => s + (r.cost ?? 0), 0);

  async function add() {
    if (!form.description.trim()) {
      setError("Say what was done.");
      return;
    }
    setError(null);
    try {
      await api.assets.addMaintenance(assetId, {
        date: new Date(form.date || today()).toISOString(),
        kind: form.kind,
        description: form.description.trim(),
        cost: form.cost ? Number(form.cost) : null,
        provider: form.provider || null,
        nextDueDate: form.nextDueDate ? new Date(form.nextDueDate).toISOString() : null,
      });
      draft.clear();
      setShowForm(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(r: MaintenanceRecord) {
    if (await confirmThenDelete(`Delete the ${formatDate(r.date)} entry "${r.description}"? Attached invoices stay in Documents.`, () => api.assets.removeMaintenance(r.id))) {
      onChange();
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Service & running costs</h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Add entry"}
        </button>
      </div>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="stat-tile">
          <div className="label">Purchase</div>
          <div className="value">{formatCurrency(purchaseCost ?? 0)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Spent since</div>
          <div className="value">{formatCurrency(spent)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total cost to own</div>
          <div className="value">{formatCurrency((purchaseCost ?? 0) + spent)}</div>
        </div>
      </div>

      {showForm && (
        <div style={{ marginTop: 12 }}>
          <DraftNotice draft={draft} />
          <div className="grid grid-2">
            <div>
              <label>Date</label>
              <input type="date" value={form.date || today()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label>Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label>What was done</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Annual clean and gas check" />
          <div className="grid grid-3">
            <div>
              <label>Cost</label>
              <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <label>Done by</label>
              <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div>
              <label>Next due</label>
              <input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={add} draft={draft} label="Add" />
        </div>
      )}

      {records.length === 0 ? (
        !showForm && <p className="empty-state">No service or repairs recorded yet.</p>
      ) : (
        <ul className="plain-list" style={{ marginTop: 12 }}>
          {records.map((r) => (
            <li key={r.id} style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <button className="link-button" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <strong>{formatDate(r.date)}</strong> — {r.description}
                </button>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {r.cost ? formatCurrency(r.cost) : "—"}
                  <button className="icon-btn danger" aria-label={`Delete entry ${r.description}`} onClick={() => remove(r)}>
                    <IconBin />
                  </button>
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {KINDS.find((k) => k.value === r.kind)?.label}
                {r.provider ? ` · ${r.provider}` : ""}
                {r.nextDueDate ? ` · next due ${formatDate(r.nextDueDate)}` : ""}
              </div>
              {open === r.id && (
                <div style={{ marginTop: 8 }}>
                  <DocumentLinker targetType="MAINTENANCE" targetId={r.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
