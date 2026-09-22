import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Document } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";

const STATUSES = ["", "PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"];

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

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {STATUSES.map((status) => (
          <button
            key={status || "all"}
            className={`chip ${reviewStatus === status ? "selected" : ""}`}
            onClick={() => setParams(status ? { reviewStatus: status } : {})}
          >
            {status ? humanize(status) : "All"}
          </button>
        ))}
      </div>

      {documents.length === 0 ? (
        <p className="empty-state">No documents match.</p>
      ) : (
        <ul className="item-card-list">
          {documents.map((d) => (
            <ItemCard
              key={d.id}
              to={`/documents/${d.id}`}
              title={d.originalFilename}
              subtitle={`${d.documentType || "Unclassified"} · ${d.entity?.name || "No entity"} · ${formatDate(d.documentDate || d.uploadDate)}${d.amount ? ` · ${formatCurrency(d.amount)}` : ""}`}
              right={<span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
