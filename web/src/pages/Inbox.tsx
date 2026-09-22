import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Document } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";

export function Inbox() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    Promise.all([
      api.documents.list({ reviewStatus: "PENDING_CLASSIFICATION" }),
      api.documents.list({ reviewStatus: "NEEDS_CONFIRMATION" }),
      api.documents.list({ reviewStatus: "MISSING_INFORMATION" }),
    ])
      .then(([a, b, c]) => setDocuments([...a, ...b, ...c]))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await api.documents.upload(file);
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirm(id: string) {
    await api.documents.confirm(id);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Inbox</h2>
          <p>Upload documents, review the proposed classification, and confirm.</p>
        </div>
      </div>

      <div
        className="card"
        style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
          accept=".pdf,.png,.jpg,.jpeg,.webp"
        />
        <p style={{ margin: 0 }}>{uploading ? "Uploading…" : "Drop files here or click to upload (PDF, JPG, PNG)"}</p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Review queue ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="empty-state">Nothing waiting on you right now.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Proposed type</th>
                <th>Entity match</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                  </td>
                  <td>{d.documentType || <em>Unclassified</em>}</td>
                  <td>{d.entity?.name || <em>None found</em>}</td>
                  <td>
                    {d.confidenceScore !== null && d.confidenceScore !== undefined
                      ? `${Math.round(d.confidenceScore * 100)}%`
                      : "—"}
                  </td>
                  <td>
                    <span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>
                  </td>
                  <td>{formatDate(d.uploadDate)}</td>
                  <td>
                    <button className="btn secondary" onClick={() => confirm(d.id)}>
                      Confirm
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
