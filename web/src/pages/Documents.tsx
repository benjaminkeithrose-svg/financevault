import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, Document } from "../api/client.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";

export function Documents() {
  const [params, setParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [q, setQ] = useState(params.get("q") || "");
  const reviewStatus = params.get("reviewStatus") || "";

  useEffect(() => {
    const filters: Record<string, string> = {};
    if (reviewStatus) filters.reviewStatus = reviewStatus;
    if (q) filters.q = q;
    api.documents.list(filters).then(setDocuments);
  }, [reviewStatus, q]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Documents</h2>
          <p>Every document is a first-class record — link it wherever it's relevant, never duplicate it.</p>
        </div>
      </div>

      <input
        className="search-bar"
        placeholder="Search filename, OCR text, supplier, notes…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="toolbar">
        {["", "PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"].map(
          (status) => (
            <button
              key={status || "all"}
              className={`btn ${reviewStatus === status ? "" : "secondary"}`}
              onClick={() => setParams(status ? { reviewStatus: status } : {})}
            >
              {status ? humanize(status) : "All"}
            </button>
          )
        )}
      </div>

      <div className="card">
        {documents.length === 0 ? (
          <p className="empty-state">No documents match.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Financial Year</th>
                <th>Amount</th>
                <th>Tax Relevance</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                  </td>
                  <td>{d.documentType || "—"}</td>
                  <td>{d.entity?.name || "—"}</td>
                  <td>{d.financialYear?.label || "—"}</td>
                  <td>{formatCurrency(d.amount)}</td>
                  <td>
                    <span className={`badge relevance-${d.taxRelevance}`}>{humanize(d.taxRelevance)}</span>
                  </td>
                  <td>
                    <span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>
                  </td>
                  <td>{formatDate(d.documentDate || d.uploadDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
