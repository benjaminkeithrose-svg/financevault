import { useEffect, useState } from "react";
import { api, Entity, EstateDocument } from "../api/client.js";
import { DocumentLinker } from "./DocumentLinker.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";
import { useDraft } from "../hooks/useDraft.js";
import { confirmThenDelete, dueState, formatDate } from "../utils.js";

const KINDS: Record<string, string> = {
  WILL: "Will",
  ENDURING_POA: "Enduring power of attorney",
  GENERAL_POA: "General power of attorney",
  GUARDIANSHIP: "Enduring guardianship",
  ADVANCE_CARE: "Advance care directive",
  BDBN_LAPSING: "Binding death benefit nomination (lapsing)",
  BDBN_NON_LAPSING: "Binding death benefit nomination (non-lapsing)",
  REVERSIONARY: "Reversionary pension nomination",
  OTHER: "Other estate paper",
};

/** Super nominations name a fund; the rest are kept by a solicitor or at home. */
const NOMINATIONS = ["BDBN_LAPSING", "BDBN_NON_LAPSING", "REVERSIONARY"];

const EMPTY = { kind: "WILL", signedDate: "", expiryDate: "", reviewDate: "", heldBy: "", fundEntityId: "", notes: "" };

const iso = (d: string) => (d ? new Date(d).toISOString() : null);

/**
 * A person's will, powers of attorney and super nominations: where the
 * original is kept, when it was signed, and when it needs looking at again.
 * A lapsing nomination runs out three years after it's signed; that date
 * goes into the calendar so it isn't missed.
 */
export function EstatePanel({ personId }: { personId: string }) {
  const [papers, setPapers] = useState<EstateDocument[]>([]);
  const [funds, setFunds] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft(`estate:${personId}`, EMPTY);
  const [showForm, setShowForm] = useState(draft.restored);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.estate.forPerson(personId).then(setPapers);
  }
  useEffect(load, [personId]);
  useEffect(() => {
    api.entities
      .list()
      .then((all) => setFunds(all.filter((e) => e.entityType === "SMSF" || e.entityType === "SUPER_FUND")))
      .catch(() => {});
  }, []);

  const isNomination = NOMINATIONS.includes(form.kind);

  async function create() {
    setError(null);
    try {
      await api.estate.create({
        personId,
        kind: form.kind,
        signedDate: iso(form.signedDate),
        // Left blank on a lapsing nomination, the app works it out: signed + 3 years.
        ...(form.expiryDate ? { expiryDate: iso(form.expiryDate) } : {}),
        reviewDate: iso(form.reviewDate),
        heldBy: form.heldBy || null,
        fundEntityId: isNomination ? form.fundEntityId || null : null,
        notes: form.notes || null,
      });
      draft.clear();
      setShowForm(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(d: EstateDocument) {
    const name = KINDS[d.kind] ?? "paper";
    if (
      await confirmThenDelete(
        `Delete the ${name.toLowerCase()} record${d.documentCount ? ` and unlink its ${d.documentCount} scan${d.documentCount === 1 ? "" : "s"}` : ""}? The scans themselves stay in Documents.`,
        () => api.estate.remove(d.id)
      )
    ) {
      load();
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Will & estate papers <HelpLink topic="estate" />
        </h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Add"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 12 }}>
          <DraftNotice draft={draft} />
          <label>What is it?</label>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="grid grid-2">
            <div>
              <label>Signed on</label>
              <input type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} />
            </div>
            {(form.kind === "BDBN_LAPSING" || form.kind === "OTHER") && (
              <div>
                <label>Lapses on</label>
                <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            )}
            <div>
              <label>Look at it again by</label>
              <input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
            </div>
            {isNomination && (
              <div>
                <label>Which fund</label>
                <select value={form.fundEntityId} onChange={(e) => setForm({ ...form, fundEntityId: e.target.value })}>
                  <option value="">— Not listed / type it below —</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>{isNomination ? "Fund name or where the copy is kept" : "Where the original is kept"}</label>
              <input
                value={form.heldBy}
                onChange={(e) => setForm({ ...form, heldBy: e.target.value })}
                placeholder={isNomination ? "AustralianSuper, filing cabinet…" : "Smith & Co solicitors, home safe…"}
              />
            </div>
          </div>
          {form.kind === "BDBN_LAPSING" && !form.expiryDate && (
            <p className="cap-explain">Leave "Lapses on" blank and it's set to three years after signing — the usual rule. It goes into the calendar.</p>
          )}
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Executor, attorney, who's named…" />
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={create} draft={draft} label="Save" />
        </div>
      )}

      {papers.length === 0 && !showForm ? (
        <p className="empty-state">No will or estate papers recorded yet.</p>
      ) : (
        <ul className="plain-list" style={{ marginTop: 12 }}>
          {papers.map((d) => {
            const lapse = dueState(d.expiryDate);
            const review = dueState(d.reviewDate);
            return (
              <li key={d.id} style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button className="link-button" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
                    <strong>{KINDS[d.kind] ?? "Estate paper"}</strong>
                    {d.fund ? ` — ${d.fund.name}` : ""}
                  </button>
                  <button className="icon-btn danger" aria-label={`Delete ${KINDS[d.kind] ?? "paper"}`} onClick={() => remove(d)}>
                    <IconBin />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {[d.signedDate ? `Signed ${formatDate(d.signedDate)}` : "Signing date not recorded", d.heldBy].filter(Boolean).join(" · ")}
                  {d.expiryDate && (
                    <>
                      {" · "}
                      <span className={lapse ? "badge status-PENDING" : ""}>
                        {lapse === "expired" ? "Lapsed" : "Lapses"} {formatDate(d.expiryDate)}
                      </span>
                    </>
                  )}
                  {d.reviewDate && (
                    <>
                      {" · "}
                      <span className={review ? "badge status-PENDING" : ""}>Review by {formatDate(d.reviewDate)}</span>
                    </>
                  )}
                  {" · "}
                  {d.documentCount ?? 0} scan{d.documentCount === 1 ? "" : "s"}
                </div>
                {d.notes && <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{d.notes}</div>}
                {open === d.id && (
                  <div style={{ marginTop: 8 }}>
                    <DocumentLinker targetType="ESTATE_DOCUMENT" targetId={d.id} onChange={load} />
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
