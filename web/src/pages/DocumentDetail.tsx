import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, AuditLogEntry, Document, Entity, TaxCategory } from "../api/client.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { LayoutShare } from "../components/LayoutShare.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { useTrailTitle } from "../trail.js";

const REVIEW_STATUSES = ["PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"];
const TAX_RELEVANCE = ["UNKNOWN", "NOT_RELEVANT", "POSSIBLE", "CONFIRMED"];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const TAX_REFERENCE = "Tax Reference";

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  useTrailTitle(doc ? (doc.documentType && doc.documentType !== "Tax Reference" ? doc.documentType : doc.originalFilename) : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Arrived from a "Needs confirmation" button: after confirming, go straight back.
  const fromBadge = params.get("review") === "1";
  const [nextToCheck, setNextToCheck] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.documents.get(id).then((d) => {
      setDoc(d);
      setForm({
        documentType: d.documentType || "",
        entityId: d.entityId || "",
        financialYearLabel: d.financialYear?.label || "",
        amount: d.amount?.toString() || "",
        supplier: d.supplier || "",
        taxCategoryId: d.taxCategoryId || "",
        taxRelevance: d.taxRelevance,
        reviewStatus: d.reviewStatus,
        notes: d.notes || "",
        tags: d.tags || "",
        documentDate: toDateInput(d.documentDate),
        renewalDate: toDateInput(d.renewalDate),
        referenceCode: d.referenceCode || "",
        referenceCheckBy: toDateInput(d.referenceCheckBy),
      });
    }).catch((e: Error) => setLoadError(e.message));
    api.audit.list(id).then(setAudit);
  }

  useEffect(load, [id]);
  // The next document still waiting to be checked, for "Confirm, then the next one".
  useEffect(() => {
    if (!id) return;
    Promise.all(["NEEDS_CONFIRMATION", "MISSING_INFORMATION", "PENDING_CLASSIFICATION"].map((reviewStatus) => api.documents.list({ reviewStatus })))
      .then((lists) => setNextToCheck(lists.flat().find((d) => d.id !== id)?.id ?? null))
      .catch(() => setNextToCheck(null));
  }, [id]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.taxCategories.list().then(setTaxCategories);
  }, []);

  if (!doc) {
    if (loadError) return <LoadFailed message={loadError} backTo="/documents" backLabel="Back to documents" />;
    return <div className="empty-state">Loading…</div>;
  }

  const isReference = form.documentType === TAX_REFERENCE;

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.documents.update(id, {
        documentType: form.documentType || null,
        entityId: form.entityId || null,
        financialYearLabel: form.financialYearLabel || null,
        amount: form.amount ? Number(form.amount) : null,
        supplier: form.supplier || null,
        taxCategoryId: form.taxCategoryId || null,
        taxRelevance: form.taxRelevance,
        reviewStatus: form.reviewStatus,
        notes: form.notes || null,
        tags: form.tags || null,
        documentDate: form.documentDate ? new Date(form.documentDate).toISOString() : null,
        renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : null,
        ...(isReference
          ? {
              referenceCode: form.referenceCode || null,
              referenceCheckBy: form.referenceCheckBy ? new Date(form.referenceCheckBy).toISOString() : null,
            }
          : {}),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function confirm(then?: "back" | "next") {
    if (!id) return;
    await api.documents.confirm(id);
    if (then === "next" && nextToCheck) navigate(`/documents/${nextToCheck}?review=1`, { replace: fromBadge });
    else if (then === "back") navigate(-1);
    else load();
  }

  async function toggleTextExtraction() {
    if (!id || !doc) return;
    await api.documents.update(id, { textExtractionEnabled: !doc.textExtractionEnabled });
    load();
  }

  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";
  const isText = doc.mimeType === "text/plain";

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{doc.originalFilename}</h2>
          <p>
            Uploaded {formatDate(doc.uploadDate)} · {(doc.fileSize / 1024).toFixed(0)} KB · v{doc.version}
          </p>
        </div>
        <span className={`badge status-${doc.reviewStatus}`}>{humanize(doc.reviewStatus)}</span>
      </div>

      {doc.reviewStatus !== "CONFIRMED" && doc.reviewStatus !== "ARCHIVED" && (
        <div className="card review-box">
          <h3 style={{ marginTop: 0 }}>Is this right?</h3>
          <p style={{ margin: "0 0 8px" }}>
            {[
              doc.documentType || "Type not worked out",
              doc.entity?.name ? `for ${doc.entity.name}` : "no person or entity matched",
              doc.amount !== null && doc.amount !== undefined ? formatCurrency(doc.amount) : null,
              doc.documentDate ? formatDate(doc.documentDate) : null,
              doc.financialYear?.label ? `${doc.financialYear.label} year` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <button className="btn" onClick={() => confirm(fromBadge ? "back" : undefined)}>
              {fromBadge ? "Confirm and go back" : "Confirm"}
            </button>
            {nextToCheck && (
              <button className="btn secondary" onClick={() => confirm("next")}>
                Confirm, then the next one
              </button>
            )}
            <a className="btn secondary" href="#classification">
              Change something first
            </a>
          </div>
        </div>
      )}

      <div className="doc-detail-grid">
        <div>
          <div className="card" id="classification">
            <h3 style={{ marginTop: 0 }}>Classification</h3>
            {doc.confidenceScore !== null && doc.confidenceScore !== undefined && (
              <>
                <label>AI confidence</label>
                <div className="confidence-bar">
                  <div className="confidence-bar-fill" style={{ width: `${Math.round((doc.confidenceScore || 0) * 100)}%` }} />
                </div>
              </>
            )}

            <label>Document type</label>
            <input value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
            {!isReference && (
              <button className="link-button" onClick={() => setForm({ ...form, documentType: TAX_REFERENCE, entityId: "" })}>
                This is an ATO ruling or guide — file it as a tax reference
              </button>
            )}

            {isReference ? (
              <>
                <div className="message-box info" style={{ marginTop: 8 }}>
                  A tax reference is an official rule or guide, not anyone's own paperwork. It's never put in a document pack
                  and isn't tied to a person or entity.
                </div>
                {doc.withdrawnNote && (
                  <div className="message-box warning">Withdrawn or replaced — the source now says: "{doc.withdrawnNote}"</div>
                )}
                {doc.supersededAt && (
                  <div className="message-box info">A newer copy was saved on {formatDate(doc.supersededAt)}. This older copy is kept for claims that relied on it.</div>
                )}
                {doc.sourceUrl && (
                  <p className="cap-explain">
                    Saved from <a href={doc.sourceUrl} target="_blank" rel="noreferrer">{doc.sourceUrl}</a>
                    {doc.retrievedAt ? ` on ${formatDate(doc.retrievedAt)}` : ""}.
                  </p>
                )}
                <div className="grid grid-2">
                  <div>
                    <label>Ruling or guide code (e.g. TR 2000/2)</label>
                    <input value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} />
                  </div>
                  <div>
                    <label>Check it's still current by</label>
                    <input
                      type="date"
                      value={form.referenceCheckBy}
                      onChange={(e) => setForm({ ...form, referenceCheckBy: e.target.value })}
                    />
                  </div>
                </div>
                <label>Financial year it's for (yearly guides only)</label>
                <input
                  value={form.financialYearLabel}
                  placeholder="2025-26"
                  onChange={(e) => setForm({ ...form, financialYearLabel: e.target.value })}
                />
              </>
            ) : (
              <>
              <label>Entity</label>
              <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
                <option value="">— None —</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>

              <label>Financial year (e.g. 2026-27)</label>
              <input
                value={form.financialYearLabel}
                placeholder="2026-27"
                onChange={(e) => setForm({ ...form, financialYearLabel: e.target.value })}
              />

              <div className="grid grid-2">
                <div>
                  <label>Document date</label>
                  <input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
                </div>
                <div>
                  <label>Renewal date</label>
                  <input type="date" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-2">
                <div>
                  <label>Amount</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label>Supplier</label>
                  <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                </div>
              </div>

              <label>Tax category</label>
              <select value={form.taxCategoryId} onChange={(e) => setForm({ ...form, taxCategoryId: e.target.value })}>
                <option value="">— None —</option>
                {taxCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <label>Tax relevance</label>
              <select value={form.taxRelevance} onChange={(e) => setForm({ ...form, taxRelevance: e.target.value })}>
                {TAX_RELEVANCE.map((v) => (
                  <option key={v} value={v}>
                    {humanize(v)}
                  </option>
                ))}
              </select>
              </>
            )}

            <label>Review status</label>
            <select value={form.reviewStatus} onChange={(e) => setForm({ ...form, reviewStatus: e.target.value })}>
              {REVIEW_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {humanize(v)}
                </option>
              ))}
            </select>

            <label>Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />

            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

            <div className="toolbar" style={{ marginTop: 16 }}>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              {doc.reviewStatus !== "CONFIRMED" && (
                <button className="btn secondary" onClick={() => confirm()}>
                  Confirm classification
                </button>
              )}
            </div>
          </div>

          {doc.ocrText && (
            <div className="card">
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>Extracted text</h3>
                <button className="btn secondary" onClick={toggleTextExtraction}>
                  {doc.textExtractionEnabled ? "Turn off" : "Turn back on"}
                </button>
              </div>
              {doc.textExtractionEnabled ? (
                <>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Read automatically from the file. Not always right — turn it off if it's wrong; the file itself is
                    untouched either way.
                  </p>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text-muted)", maxHeight: 240, overflow: "auto" }}>
                    {doc.ocrText}
                  </pre>
                  <LayoutShare
                    documentId={doc.id}
                    prompt="A statement or form the app didn't read well? Share its layout — the wording, with every figure and name blanked out — so the next version reads it better."
                  />
                </>
              ) : (
                <p className="empty-state">
                  Turned off for this file — it won't be searched or shown. Turn it back on to see it again; nothing
                  was deleted.
                </p>
              )}
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Audit trail</h3>
            {audit.length === 0 ? (
              <p className="empty-state">No events recorded.</p>
            ) : (
              <table>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td>{humanize(a.action)}</td>
                      <td>{formatDate(a.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="preview-pane">
          {isPdf && <iframe src={api.documents.fileUrl(doc.id)} title="Document preview" />}
          {isImage && <img src={api.documents.fileUrl(doc.id)} alt={doc.originalFilename} />}
          {isText && <TextPreview id={doc.id} />}
          {!isPdf && !isImage && !isText && <div className="empty-state">No inline preview for this file type.</div>}
        </div>
      </div>
      <div className="grid grid-2">
        {doc.reviewStatus !== "ARCHIVED" && (
          <DeleteSection
            title="Archive"
            note="Keeps the file and everything recorded about it, but hides it from the document lists and dashboard. You can still find it under the Archived filter and bring it back by changing its status."
            question={`Archive ${doc.originalFilename}?`}
            action={() => api.documents.remove(doc.id)}
            redirectTo="/documents"
            buttonLabel="Archive"
          />
        )}
        <DeleteSection
          title="Delete permanently"
          note="Removes the file from Financial Vault and your computer's document folder, along with its links. Use this for duplicates or files uploaded by mistake."
          question={`Permanently delete ${doc.originalFilename}? The file itself is removed. This can't be undone.`}
          action={() => api.documents.removePermanently(doc.id)}
          redirectTo="/documents"
          buttonLabel="Delete permanently"
        />
      </div>
    </div>
  );
}

/** A text document (a saved web page, an occupation guide) shown in full. */
function TextPreview({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(api.documents.fileUrl(id))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => setText(new TextDecoder("utf-8").decode(b)))
      .catch(() => setText(""));
  }, [id]);
  if (text === null) return <div className="empty-state">Loading…</div>;
  if (!text) return <div className="empty-state">This file couldn't be shown.</div>;
  return <pre className="text-preview">{text}</pre>;
}
