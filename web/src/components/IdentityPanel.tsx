import { useEffect, useState } from "react";
import { api, IdentityRecord } from "../api/client.js";
import { DocumentLinker } from "./DocumentLinker.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { IconBin } from "./icons.js";
import { useDraft } from "../hooks/useDraft.js";
import { confirmThenDelete, formatDate } from "../utils.js";

/** What each kind of record calls its fields — a Medicare card and a passport don't share labels. */
const KINDS: Record<
  string,
  { label: string; issuer?: string; number: string; reference?: string; detail?: string; expiry: string }
> = {
  PRIVATE_HEALTH: { label: "Private health insurance", issuer: "Insurer", number: "Membership number", detail: "Cover", expiry: "Renews" },
  MEDICARE: { label: "Medicare card", number: "Card number", reference: "Your number on the card (IRN)", expiry: "Valid to" },
  DRIVERS_LICENCE: { label: "Driver's licence", issuer: "State", number: "Licence number", reference: "Card number", expiry: "Expires" },
  PASSPORT: { label: "Passport", issuer: "Country", number: "Passport number", expiry: "Expires" },
  BIRTH_CERTIFICATE: { label: "Birth certificate", issuer: "State", number: "Registration number", expiry: "Expires" },
  CITIZENSHIP: { label: "Citizenship certificate", number: "Certificate number", expiry: "Expires" },
  PROOF_OF_AGE: { label: "Proof of age card", issuer: "State", number: "Card number", expiry: "Expires" },
  OTHER: { label: "Other ID or cover", issuer: "Issued by", number: "Number", detail: "What it is", expiry: "Expires" },
};

// Everything except the numbers is kept as a draft if the form is left
// half-filled. The numbers are never stored in the browser.
const EMPTY = { kind: "PRIVATE_HEALTH", label: "", issuer: "", issueDate: "", expiryDate: "", notes: "" };

function expiryState(date?: string | null): "expired" | "soon" | null {
  if (!date) return null;
  const days = (new Date(date).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return null;
}

/**
 * A person's ID and cover — private health, Medicare, licence, passport — with
 * scans attached. Numbers are stored encrypted and shown masked; Show reveals
 * one (and is recorded in the audit log).
 */
export function IdentityPanel({ personId }: { personId: string }) {
  const [records, setRecords] = useState<IdentityRecord[]>([]);
  const [form, setForm, draft] = useDraft(`identity:${personId}`, EMPTY);
  const [number, setNumber] = useState("");
  const [reference, setReference] = useState("");
  const [showForm, setShowForm] = useState(draft.restored);
  const [open, setOpen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { number: string | null; referenceNumber: string | null }>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.identity.forPerson(personId).then(setRecords);
  }
  useEffect(load, [personId]);

  const kind = KINDS[form.kind] ?? KINDS.OTHER;

  async function create() {
    setError(null);
    try {
      await api.identity.create({
        personId,
        kind: form.kind,
        label: form.label || null,
        issuer: form.issuer || null,
        number: number || null,
        referenceNumber: reference || null,
        issueDate: form.issueDate ? new Date(form.issueDate).toISOString() : null,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : null,
        notes: form.notes || null,
      });
      draft.clear();
      setNumber("");
      setReference("");
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function clearAll() {
    draft.clear();
    setNumber("");
    setReference("");
  }

  async function reveal(id: string) {
    if (revealed[id]) {
      const next = { ...revealed };
      delete next[id];
      setRevealed(next);
      return;
    }
    setRevealed({ ...revealed, [id]: await api.identity.reveal(id) });
  }

  async function remove(r: IdentityRecord) {
    const name = KINDS[r.kind]?.label ?? "record";
    if (
      await confirmThenDelete(
        `Delete the ${name.toLowerCase()} record${r.documentCount ? ` and unlink its ${r.documentCount} scan${r.documentCount === 1 ? "" : "s"}` : ""}? The scans themselves stay in Documents.`,
        () => api.identity.remove(r.id)
      )
    ) {
      load();
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>ID & cover</h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Add"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 12 }}>
          <DraftNotice draft={draft} />
          <label>What is it?</label>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KINDS).map(([value, k]) => (
              <option key={value} value={value}>
                {k.label}
              </option>
            ))}
          </select>
          <div className="grid grid-2">
            {kind.detail && (
              <div>
                <label>{kind.detail}</label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
            )}
            {kind.issuer && (
              <div>
                <label>{kind.issuer}</label>
                <input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
              </div>
            )}
            <div>
              <label>{kind.number}</label>
              <input value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
            </div>
            {kind.reference && (
              <div>
                <label>{kind.reference}</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
              </div>
            )}
            <div>
              <label>{kind.expiry}</label>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Numbers are stored encrypted. Attach the scan once it's saved.
          </p>
          {error && <div className="message-box warning">{error}</div>}
          <FormActions
            onSubmit={create}
            draft={{ ...draft, isDirty: draft.isDirty || !!number || !!reference, clear: clearAll }}
            label="Save"
          />
        </div>
      )}

      {records.length === 0 && !showForm ? (
        <p className="empty-state">No ID or cover recorded yet.</p>
      ) : (
        <ul className="plain-list" style={{ marginTop: 12 }}>
          {records.map((r) => {
            const k = KINDS[r.kind] ?? KINDS.OTHER;
            const state = expiryState(r.expiryDate);
            const shown = revealed[r.id];
            return (
              <li key={r.id} style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button className="link-button" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <strong>{k.label}</strong>
                    {r.label ? ` — ${r.label}` : ""}
                    {r.issuer ? ` · ${r.issuer}` : ""}
                  </button>
                  <button className="icon-btn danger" aria-label={`Delete ${k.label}`} onClick={() => remove(r)}>
                    <IconBin />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {r.numberMasked && (
                    <>
                      {shown?.number ?? r.numberMasked}
                      {shown?.referenceNumber ? ` / ${shown.referenceNumber}` : r.referenceMasked ? ` / ${r.referenceMasked}` : ""}{" "}
                      <button className="link-button" onClick={() => reveal(r.id)}>
                        {shown ? "Hide" : "Show"}
                      </button>
                      {" · "}
                    </>
                  )}
                  {r.expiryDate ? (
                    <span className={state ? `badge status-${state === "expired" ? "MISSING_INFORMATION" : "NEEDS_CONFIRMATION"}` : ""}>
                      {state === "expired" ? "Expired" : k.expiry} {formatDate(r.expiryDate)}
                    </span>
                  ) : (
                    "No expiry recorded"
                  )}
                  {" · "}
                  {r.documentCount ?? 0} scan{r.documentCount === 1 ? "" : "s"}
                </div>
                {open === r.id && (
                  <div style={{ marginTop: 8 }}>
                    <DocumentLinker targetType="IDENTITY_RECORD" targetId={r.id} onChange={load} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
