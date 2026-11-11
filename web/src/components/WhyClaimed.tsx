import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ClaimTargetType, ClaimView, Document } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";
import { IconBook } from "./icons.js";

/**
 * "Why is this claimed?" — a small book icon next to a claim. Nothing shows
 * day to day; opening it gives the reason, the ATO rule behind it (a Tax
 * reference document and the paragraph), the evidence, the accountant's
 * note, the history, and a download of all of it for the accountant or ATO.
 */

// A starting point for the reason and the rule, by kind of claim. Editable.
const SUGGESTED: Record<ClaimTargetType, { reason: (deductible: boolean) => string; code: string; pinpoint: string }> = {
  LOAN_PURPOSE: {
    reason: (deductible) =>
      deductible
        ? "This money was used to produce income (e.g. to buy or improve a rental property or shares), so the interest on it is deductible. What counts is what the borrowed money was used for, not what secures the loan."
        : "This money was used for something private, so the interest on it isn't claimed.",
    code: "TR 2000/2",
    pinpoint: "paragraphs 12 and 29",
  },
  LOAN_INTEREST_YEAR: {
    reason: () =>
      "Interest from the lender's annual statement, apportioned by what the loan's money was used for. Repayments reduce each part in proportion, so the share holds until money is redrawn or an asset is sold.",
    code: "TR 2000/2",
    pinpoint: "paragraphs 13 to 16",
  },
  WORK_DEDUCTION: {
    reason: () =>
      "Spent to earn my employment income, not reimbursed by my employer, and the record is attached — the ATO's three rules for a work-related deduction.",
    code: "",
    pinpoint: "",
  },
};

export function WhyClaimed({
  targetType,
  targetId,
  hasReason,
  deductible = true,
  onChange,
}: {
  targetType: ClaimTargetType;
  targetId: string;
  /** Whether a reason is already recorded — shown as a filled-in icon. */
  hasReason?: boolean;
  deductible?: boolean;
  onChange?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`icon-btn why-claimed${hasReason ? " has-reason" : ""}`}
        aria-label={hasReason ? "Why is this claimed? (reason recorded)" : "Why is this claimed?"}
        title={hasReason ? "Why is this claimed? — reason recorded" : "Why is this claimed?"}
        onClick={() => setOpen(true)}
      >
        <IconBook />
      </button>
      {open && (
        <WhyClaimedDialog
          targetType={targetType}
          targetId={targetId}
          deductible={deductible}
          onClose={(changed) => {
            setOpen(false);
            if (changed) onChange?.();
          }}
        />
      )}
    </>
  );
}

function WhyClaimedDialog({
  targetType,
  targetId,
  deductible,
  onClose,
}: {
  targetType: ClaimTargetType;
  targetId: string;
  deductible: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [view, setView] = useState<ClaimView | null>(null);
  const [references, setReferences] = useState<Document[]>([]);
  const [form, setForm] = useState({ reason: "", referenceDocumentId: "", referencePinpoint: "", accountantNote: "", accountantAgreedOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [changed, setChanged] = useState(false);

  async function load() {
    const [v, refs] = await Promise.all([api.claimNotes.get(targetType, targetId), api.documents.list({ reference: "only" })]);
    setView(v);
    setReferences(refs);
    const n = v.note;
    const suggestion = SUGGESTED[targetType];
    const suggestedRef = suggestion.code ? refs.find((r) => r.referenceCode === suggestion.code) : undefined;
    setForm({
      reason: n?.reason ?? suggestion.reason(deductible),
      referenceDocumentId: n ? (n.referenceDocumentId ?? "") : (suggestedRef?.id ?? ""),
      referencePinpoint: n ? (n.referencePinpoint ?? "") : suggestedRef ? suggestion.pinpoint : "",
      accountantNote: n?.accountantNote ?? "",
      accountantAgreedOn: n?.accountantAgreedOn ? n.accountantAgreedOn.slice(0, 10) : "",
    });
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  async function save() {
    setError(null);
    if (!form.reason.trim()) {
      setError("Write the reason first.");
      return;
    }
    try {
      await api.claimNotes.save({
        targetType,
        targetId,
        reason: form.reason.trim(),
        referenceDocumentId: form.referenceDocumentId || null,
        referencePinpoint: form.referencePinpoint || null,
        accountantNote: form.accountantNote || null,
        accountantAgreedOn: form.accountantAgreedOn ? new Date(form.accountantAgreedOn).toISOString() : null,
      });
      setSaved(true);
      setChanged(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="why-claimed-title" onClick={() => onClose(changed)}>
      <div className="card dialog why-claimed-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="why-claimed-title" style={{ marginTop: 0 }}>
          Why is this claimed?
        </h3>
        {!view ? (
          error ? <div className="message-box warning">{error}</div> : <p className="empty-state">Loading…</p>
        ) : (
          <>
            <p className="cap-explain" style={{ marginTop: 0 }}>
              <strong>{view.target.title}</strong>
              {view.target.lines.map((l) => (
                <span key={l} style={{ display: "block" }}>
                  {l}
                </span>
              ))}
            </p>

            <label>Why it's claimed</label>
            <textarea rows={4} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />

            <label>The rule (a tax reference)</label>
            <select value={form.referenceDocumentId} onChange={(e) => setForm({ ...form, referenceDocumentId: e.target.value })}>
              <option value="">— None chosen —</option>
              {references.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.referenceCode ? `${r.referenceCode} — ` : ""}
                  {r.originalFilename}
                </option>
              ))}
            </select>
            {references.length === 0 && (
              <p className="cap-explain">
                No tax references yet. <Link to="/documents?reference=only">Load the official reference library</Link> to choose
                one.
              </p>
            )}
            <label>Paragraph or section</label>
            <input
              placeholder="e.g. paragraphs 13 to 16"
              value={form.referencePinpoint}
              onChange={(e) => setForm({ ...form, referencePinpoint: e.target.value })}
            />
            {form.referenceDocumentId && (
              <p className="cap-explain">
                <Link to={`/documents/${form.referenceDocumentId}`}>Open the reference</Link>
              </p>
            )}
            {view.referenceWithdrawn && (
              <div className="message-box warning">
                The ATO page for this reference now says: "{view.referenceWithdrawn}" Check with your accountant before relying on it.
              </div>
            )}
            {!view.referenceWithdrawn && view.newerReferenceId && (
              <div className="message-box info">
                A newer copy of this reference has been saved. <Link to={`/documents/${view.newerReferenceId}`}>Open the newer copy</Link> and
                check the rule is the same, then choose it here.
              </div>
            )}
            {view.referenceOverdue && (
              <div className="message-box warning">
                This reference is past its check-by date. Check it hasn't been replaced or withdrawn before relying on it.
              </div>
            )}

            <label>Evidence</label>
            {view.evidence.length === 0 ? (
              <p className="cap-explain">None linked — attach the settlement statement, loan statement or receipt on the claim itself.</p>
            ) : (
              <ul className="plain-list">
                {view.evidence.map((d) => (
                  <li key={d.id}>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                    {d.documentType ? <span className="cap-explain"> · {d.documentType}</span> : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-2">
              <div>
                <label>Accountant's note</label>
                <input value={form.accountantNote} onChange={(e) => setForm({ ...form, accountantNote: e.target.value })} />
              </div>
              <div>
                <label>Agreed on</label>
                <input type="date" value={form.accountantAgreedOn} onChange={(e) => setForm({ ...form, accountantAgreedOn: e.target.value })} />
              </div>
            </div>

            {view.history.length > 0 && (
              <p className="cap-explain">
                {view.history.map((h) => `${humanize(h.action.replace(/^CLAIM_/, ""))} ${formatDate(h.timestamp)}`).join(" · ")}
              </p>
            )}
            {error && <div className="message-box warning">{error}</div>}
            {saved && !error && <div className="message-box info">Saved.</div>}
            <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn" onClick={save}>
                Save reason
              </button>
              <a className="btn secondary" href={api.claimNotes.exportUrl(targetType, targetId)} download>
                Explain this claim (download)
              </a>
              <button className="btn secondary" onClick={() => onClose(changed)}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
