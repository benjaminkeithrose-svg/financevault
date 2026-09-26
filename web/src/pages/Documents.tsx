import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, Document, ReferenceChecks, ReferenceFigures, ReferenceLibraryStatus } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";
import { IconClose, IconSearch } from "../components/icons.js";

const STATUSES = ["", "PENDING_CLASSIFICATION", "NEEDS_CONFIRMATION", "MISSING_INFORMATION", "CONFIRMED", "ARCHIVED"];

export function Documents() {
  const [params, setParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [q, setQ] = useState(params.get("q") || "");
  // No permanent search box (PREFERENCES.md): a button opens it.
  const [searching, setSearching] = useState(!!params.get("q"));
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
        {!searching && (
          <button className="btn secondary" onClick={() => setSearching(true)}>
            <IconSearch /> Search documents
          </button>
        )}
      </div>

      {searching && (
        <div className="search-row">
          <input
            autoFocus
            className="search-bar"
            placeholder="Search filename, text, supplier, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="icon-btn"
            aria-label="Close search"
            onClick={() => {
              setQ("");
              setSearching(false);
            }}
          >
            <IconClose />
          </button>
        </div>
      )}

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
                  ? `Tax reference${d.referenceCode ? ` · ${d.referenceCode}` : ""}${
                      d.withdrawnNote ? " · withdrawn" : d.supersededAt ? " · replaced by a newer copy" : d.retrievedAt ? ` · saved ${formatDate(d.retrievedAt)}` : ""
                    }${d.referenceCheckBy && !d.supersededAt ? ` · check by ${formatDate(d.referenceCheckBy)}` : ""}`
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
  const [checks, setChecks] = useState<ReferenceChecks | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    api.referenceLibrary.status().then(setStatus).catch(() => setStatus(null));
    api.referenceLibrary.checks().then(setChecks).catch(() => setChecks(null));
  };
  useEffect(() => {
    refresh();
  }, []);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const r = await api.referenceLibrary.load();
      setMessage(`Added ${r.added}${r.alreadyHere ? `; ${r.alreadyHere} were already here` : ""}.`);
      refresh();
      onLoaded();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function check() {
    if (
      !window.confirm(
        "This goes online to fetch the public pages of the ATO, Revenue NSW, APRA and ASIC — the only time the library does. Nothing about you is sent. It takes a minute or two. Go ahead?"
      )
    )
      return;
    setChecking(true);
    setMessage(null);
    try {
      const r = await api.referenceLibrary.check();
      const parts = [
        r.newYear && `${r.newYear} new year's guide${r.newYear === 1 ? "" : "s"}`,
        r.updated && `${r.updated} newer cop${r.updated === 1 ? "y" : "ies"} saved`,
        r.withdrawn && `${r.withdrawn} withdrawn`,
        r.broken && `${r.broken} moved`,
        r.failed && `${r.failed} couldn't be reached`,
        r.current && `${r.current} unchanged`,
      ].filter(Boolean);
      setMessage(`Checked ${r.checked} sources: ${parts.join(", ")}.`);
      refresh();
      onLoaded();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (!status) return null;
  const loaded = status.items.filter((i) => i.documentId).length;
  const attention = (checks?.items ?? []).filter((i) => i.status && ["WITHDRAWN", "BROKEN", "NEW_YEAR", "UPDATED"].includes(i.status));
  // Sites that couldn't be reached are one line, not a row each.
  const notReached = (checks?.items ?? []).filter((i) => i.status === "FAILED");
  const order = ["WITHDRAWN", "BROKEN", "NEW_YEAR", "UPDATED"];
  attention.sort((a, b) => order.indexOf(a.status!) - order.indexOf(b.status!));
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>
          Official reference library <HelpLink topic="tax-references" />
        </h3>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          {status.available && loaded < status.items.length && (
            <button className="btn" onClick={load} disabled={loading || checking}>
              {loading ? "Loading… (can take a minute)" : "Load the reference library"}
            </button>
          )}
          {status.available && (
            <button className={loaded < status.items.length ? "btn secondary" : "btn"} onClick={check} disabled={loading || checking}>
              {checking ? "Checking… (a minute or two)" : "Check for new versions"}
            </button>
          )}
        </div>
      </div>
      <p className="cap-explain">
        {status.available
          ? `${loaded} of ${status.items.length} official documents are in Financial Vault. They're kept out of every document pack and aren't tied to anyone. ${
              checks?.lastCheckedAt ? `Last checked for new versions on ${formatDate(checks.lastCheckedAt)}.` : "Not yet checked for new versions — worth doing each July."
            }`
          : "The reference folder isn't next to the program, so there's nothing to load."}
      </p>
      {message && <div className="message-box info">{message}</div>}
      {attention.length > 0 && (
        <ul className="missing-list">
          {attention.map((i) => (
            <li key={i.linkId} className={["WITHDRAWN", "BROKEN"].includes(i.status!) ? "required" : "worth"}>
              <span className="missing-mark" aria-hidden="true">
                {i.status === "WITHDRAWN" || i.status === "BROKEN" ? "!" : "✓"}
              </span>
              <div className="missing-body">
                <strong>{i.title}</strong>
                <span className={`missing-level ${["WITHDRAWN", "BROKEN"].includes(i.status!) ? "required" : "worth"}`}>{CHECK_LABELS[i.status!]}</span>
                <div className="cap-explain">
                  {i.message}
                  {i.claimsCiting > 0 && ` ${i.claimsCiting} claim${i.claimsCiting === 1 ? " cites" : "s cite"} it — check with your accountant.`}
                </div>
              </div>
              <div className="missing-actions">
                {i.documentId && (
                  <Link className="btn secondary" to={`/documents/${i.documentId}`}>
                    Open the copy
                  </Link>
                )}
                {i.searchUrl && (
                  <a className="btn secondary" href={i.searchUrl} target="_blank" rel="noreferrer">
                    Search for it
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notReached.length > 0 && (
        <details className="profit-details">
          <summary>
            {notReached.length} source{notReached.length === 1 ? "" : "s"} couldn't be reached — try again later
          </summary>
          <p className="cap-explain">
            Their saved copies are still here and still used. A site can be busy, or turn away checks from some networks.
          </p>
          <ul>
            {notReached.map((i) => (
              <li key={i.linkId}>
                {i.title} <span className="cap-explain" style={{ display: "inline" }}>— {i.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <FiguresList />
    </div>
  );
}

const CHECK_LABELS: Record<string, string> = {
  WITHDRAWN: "Withdrawn",
  BROKEN: "Moved",
  NEW_YEAR: "New year's guide",
  UPDATED: "Newer copy saved",
  FAILED: "Not reached",
  CURRENT: "Unchanged",
  NOT_YET: "Not out yet",
};

/** The official figures the app calculates with, and whether their source has changed since. */
function FiguresList() {
  const [data, setData] = useState<ReferenceFigures | null>(null);
  useEffect(() => {
    api.referenceLibrary.figures().then(setData).catch(() => setData(null));
  }, []);
  if (!data) return null;
  const toReview = data.items.filter((f) => f.review).length;
  return (
    <details className="profit-details" open={toReview > 0}>
      <summary>
        Figures the app uses{toReview ? ` — ${toReview} to review` : ""}
      </summary>
      <p className="cap-explain">
        Checked against their sources on {formatDate(data.checkedOn)}. When a newer copy of a source is saved, its figures are flagged
        here; a new version of Financial Vault brings the updated figures.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Figure</th>
              <th>Used</th>
              <th>Source last checked</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td>{f.value}</td>
                <td>
                  {f.sourceCheckedAt ? formatDate(f.sourceCheckedAt) : "Not yet"}
                  {f.review && (
                    <>
                      {" "}
                      <span className="missing-level required">Review</span>{" "}
                      {f.sourceDocumentId && <Link to={`/documents/${f.sourceDocumentId}`}>newer source</Link>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
