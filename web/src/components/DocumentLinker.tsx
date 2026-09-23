import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Document, DocumentLink } from "../api/client.js";
import { formatDate, humanize, confirmThenDelete } from "../utils.js";

export function DocumentLinker({
  targetType,
  targetId,
  onChange,
}: {
  targetType: string;
  targetId: string;
  /** Called after a document is linked, uploaded or unlinked. */
  onChange?: () => void;
}) {
  const [links, setLinks] = useState<Array<DocumentLink & { document: Document }>>([]);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    api.documents.byTarget(targetType, targetId).then(setLinks);
  }

  useEffect(refresh, [targetType, targetId]);

  // After a change: reload this list and tell the parent (e.g. a scan count).
  function load() {
    refresh();
    onChange?.();
  }

  async function openPicker() {
    setPickerOpen(true);
    setAllDocuments(await api.documents.list());
  }

  async function linkExisting(documentId: string) {
    await api.documents.addLink(documentId, { targetType, targetId });
    setPickerOpen(false);
    load();
  }

  async function unlink(documentId: string, linkId: string) {
    const deleted = await confirmThenDelete(
      "Unlink this document? The document itself is kept.",
      () => api.documents.removeLink(documentId, linkId)
    );
    if (!deleted) return;
    load();
  }

  async function uploadAndLink(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { document } = await api.documents.upload(file);
        await api.documents.addLink(document.id, { targetType, targetId });
      }
      load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const linkedIds = new Set(links.map((l) => l.document.id));

  return (
    <div>
      {links.length === 0 ? (
        <p className="empty-state">No documents linked yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link to={`/documents/${l.document.id}`}>{l.document.originalFilename}</Link>
                </td>
                <td>{l.document.documentType || "—"}</td>
                <td>
                  <span className={`badge status-${l.document.reviewStatus}`}>{humanize(l.document.reviewStatus)}</span>
                </td>
                <td>{formatDate(l.document.documentDate || l.document.uploadDate)}</td>
                <td>
                  <button className="btn secondary" onClick={() => unlink(l.document.id, l.id)}>
                    Unlink
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => uploadAndLink(e.target.files)} />
        <button className="btn secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload document"}
        </button>
        <button className="btn secondary" onClick={openPicker}>
          Link existing document
        </button>
      </div>

      {pickerOpen && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <strong>Choose a document to link</strong>
            <button className="btn secondary" onClick={() => setPickerOpen(false)}>
              Close
            </button>
          </div>
          <table>
            <tbody>
              {allDocuments
                .filter((d) => !linkedIds.has(d.id))
                .map((d) => (
                  <tr key={d.id}>
                    <td>{d.originalFilename}</td>
                    <td>{d.documentType || "—"}</td>
                    <td>
                      <button className="btn secondary" onClick={() => linkExisting(d.id)}>
                        Link
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
