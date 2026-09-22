import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, AuditLogEntry, Document, Entity, TaxCategory } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";

const REVIEW_STATUSES = ["PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"];
const TAX_RELEVANCE = ["UNKNOWN", "NOT_RELEVANT", "POSSIBLE", "CONFIRMED"];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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
      });
    });
    api.audit.list(id).then(setAudit);
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.taxCategories.list().then(setTaxCategories);
  }, []);

  if (!doc) return <div className="empty-state">Loading…</div>;

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
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (!id) return;
    await api.documents.confirm(id);
    load();
  }

  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";

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

      <div className="doc-detail-grid">
        <div>
          <div className="card">
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
                <button className="btn secondary" onClick={confirm}>
                  Confirm classification
                </button>
              )}
            </div>
          </div>

          {doc.ocrText && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Extracted text</h3>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text-muted)", maxHeight: 240, overflow: "auto" }}>
                {doc.ocrText}
              </pre>
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
          {!isPdf && !isImage && <div className="empty-state">No inline preview for this file type.</div>}
        </div>
      </div>
    </div>
  );
}
