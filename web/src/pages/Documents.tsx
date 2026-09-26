import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Document, ReferenceLibraryStatus } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

const STATUSES = ["", "PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"];

export function Documents() {
  const [params, setParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [q, setQ] = useState(params.get("q") || "");
  const reviewStatus = params.get("reviewStatus") || "";
  const referencesOnly = params.get("reference") === "only";
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const filters: Record<string, string> = {};
    if (reviewStatus) filters.reviewStatus = reviewStatus;
    if (referencesOnly) filters.reference = "only";
    if (q) filters.q = q;
    api.documents.list(filters).then(setDocuments);
  }, [reviewStatus, referencesOnly, q, reloadKey]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Documents <HelpLink topic="documents" /></h2>
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
            className={`chip ${!referencesOnly && reviewStatus === status ? "selected" : ""}`}
            onClick={() => setParams(status ? { reviewStatus: status } : {})}
          >
            {status ? humanize(status) : "All (not archived)"}
          </button>
        ))}
        <button className={`chip ${referencesOnly ? "selected" : ""}`} onClick={() => setParams({ reference: "only" })}>
          Tax references
        </button>
      </div>

      {referencesOnly && <ReferenceLibraryCard onLoaded={() => setReloadKey((k) => k + 1)} />}

      {documents.length === 0 ? (
        <p className="empty-state">No documents match.</p>
      ) : (
        <ul className="item-card-list">
          {documents.map((d) => (
            <ItemCard
              key={d.id}
              to={`/documents/${d.id}`}
              title={d.originalFilename}
              subtitle={
                d.documentType === "Tax Reference"
                  ? `Tax reference${d.referenceCode ? ` · ${d.referenceCode}` : ""}${d.referenceCheckBy ? ` · check by ${formatDate(d.referenceCheckBy)}` : ""}`
                  : `${d.documentType || "Unclassified"} · ${d.entity?.name || "No entity"} · ${formatDate(d.documentDate || d.uploadDate)}${d.amount ? ` · ${formatCurrency(d.amount)}` : ""}`
              }
              right={<span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The official rules the app relies on — ATO rulings and guides, Revenue NSW
 * and APRA pages — ship with the program. Loading them files each as a Tax
 * reference: searchable, on this computer, never put in a pack.
 */
function ReferenceLibraryCard({ onLoaded }: { onLoaded: () => void }) {
  const [status, setStatus] = useState<ReferenceLibraryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => api.referenceLibrary.status().then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    refresh();
  }, []);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const r = await api.referenceLibrary.load();
      setMessage(`Added ${r.added}${r.alreadyHere ? `; ${r.alreadyHere} were already here` : ""}.`);
      await refresh();
      onLoaded();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!status) return null;
  const loaded = status.items.filter((i) => i.documentId).length;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Official reference library <HelpLink topic="tax-references" />
        </h3>
        {status.available && loaded < status.items.length && (
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading… (can take a minute)" : "Load the reference library"}
          </button>
        )}
      </div>
      <p className="cap-explain">
        {status.available
          ? `${loaded} of ${status.items.length} official documents are in Financial Vault. They're kept out of every document pack and aren't tied to anyone. A reminder to check they're current goes in the calendar each July.`
          : "The reference folder isn't next to the program, so there's nothing to load."}
      </p>
      {message && <div className="message-box info">{message}</div>}
    </div>
  );
}
