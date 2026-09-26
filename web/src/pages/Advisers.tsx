import { useEffect, useState } from "react";
import { api, Adviser } from "../api/client.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { HelpLink } from "../components/HelpLink.js";
import { IconBin } from "../components/icons.js";
import { useDraft } from "../hooks/useDraft.js";
import { confirmThenDelete } from "../utils.js";

const KINDS: Record<string, string> = {
  ACCOUNTANT: "Accountant",
  SOLICITOR: "Solicitor",
  REAL_ESTATE_AGENT: "Real estate agent",
  FINANCIAL_ADVISER: "Financial adviser",
  OTHER: "Other adviser",
};

const EMPTY = { kind: "ACCOUNTANT", firm: "", contactFirstName: "", contactSurname: "", phone: "", email: "", notes: "" };

/**
 * The accountant, solicitor, real estate agent and financial adviser around
 * the family — one list, reused whenever a broker or accountant asks who
 * else to contact, and pulled straight into the Fact Find document pack.
 */
export function Advisers({ embedded = false }: { embedded?: boolean }) {
  const [advisers, setAdvisers] = useState<Adviser[]>([]);
  const [form, setForm, draft] = useDraft("advisers:new", EMPTY);
  const [showForm, setShowForm] = useState(draft.restored);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.advisers.list().then(setAdvisers);
  }
  useEffect(load, []);

  async function create() {
    setError(null);
    try {
      await api.advisers.create({
        kind: form.kind,
        firm: form.firm || null,
        contactFirstName: form.contactFirstName || null,
        contactSurname: form.contactSurname || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      });
      draft.clear();
      setShowForm(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(a: Adviser) {
    setForm({
      kind: a.kind,
      firm: a.firm ?? "",
      contactFirstName: a.contactFirstName ?? "",
      contactSurname: a.contactSurname ?? "",
      phone: a.phone ?? "",
      email: a.email ?? "",
      notes: a.notes ?? "",
    });
    setEditingId(a.id);
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    try {
      await api.advisers.update(editingId, {
        kind: form.kind,
        firm: form.firm || null,
        contactFirstName: form.contactFirstName || null,
        contactSurname: form.contactSurname || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      });
      setEditingId(null);
      draft.clear();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(a: Adviser) {
    const label = [a.firm, [a.contactFirstName, a.contactSurname].filter(Boolean).join(" ")].filter(Boolean).join(" — ") || KINDS[a.kind];
    if (await confirmThenDelete(`Remove ${label}?`, () => api.advisers.remove(a.id))) load();
  }

  const form_ = (
    <>
      <label>Kind</label>
      <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
        {Object.entries(KINDS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="grid grid-2">
        <div>
          <label>Firm</label>
          <input value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} />
        </div>
        <div>
          <label>Contact name</label>
          <div className="toolbar" style={{ flexWrap: "nowrap" }}>
            <input placeholder="First name" value={form.contactFirstName} onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })} />
            <input placeholder="Surname" value={form.contactSurname} onChange={(e) => setForm({ ...form, contactSurname: e.target.value })} />
          </div>
        </div>
        <div>
          <label>Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      <label>Notes</label>
      <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
    </>
  );

  return (
    <div>
      <div className={embedded ? "section-header" : "page-header"}>
        <div>
          {embedded ? (
            <h3>
              Professional advisers <HelpLink topic="personal-details" />
            </h3>
          ) : (
            <h2>
              Professional advisers <HelpLink topic="personal-details" />
            </h2>
          )}
          <p>Your accountant, solicitor, real estate agent and financial adviser — kept once, and included in the Fact Find document pack.</p>
        </div>
        {!showForm && !editingId && (
          <button className="btn" onClick={() => setShowForm(true)}>
            New adviser
          </button>
        )}
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          {form_}
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={create} draft={draft} label="Save" />
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {advisers.length === 0 && !showForm ? (
        <p className="empty-state">No advisers recorded yet.</p>
      ) : (
        <ul className="plain-list">
          {advisers.map((a) =>
            editingId === a.id ? (
              <li key={a.id} style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0" }}>
                {form_}
                {error && <div className="message-box warning">{error}</div>}
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={saveEdit}>
                    Save
                  </button>
                  <button className="btn secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={a.id}>
                <button className="link-button" onClick={() => startEdit(a)}>
                  <strong>{KINDS[a.kind] ?? a.kind}</strong>
                  {a.firm ? ` — ${a.firm}` : ""}
                  {[a.contactFirstName, a.contactSurname].filter(Boolean).join(" ") && (
                    <span style={{ color: "var(--text-muted)" }}> · {[a.contactFirstName, a.contactSurname].filter(Boolean).join(" ")}</span>
                  )}
                  {a.phone || a.email ? <span style={{ color: "var(--text-muted)" }}> · {[a.phone, a.email].filter(Boolean).join(" · ")}</span> : null}
                </button>
                <button className="icon-btn danger" aria-label={`Remove ${KINDS[a.kind] ?? "adviser"}`} onClick={() => remove(a)}>
                  <IconBin />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
