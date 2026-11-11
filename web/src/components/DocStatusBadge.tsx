import { Link } from "react-router-dom";
import { humanize } from "../utils.js";

const DONE = new Set(["CONFIRMED", "ARCHIVED"]);

/**
 * A document's review status. While it still needs something from you
 * ("Needs confirmation", "Missing information"…) it's a button that opens
 * the document at the step that does it, and brings you back afterwards.
 */
export function DocStatusBadge({ documentId, status }: { documentId: string; status: string }) {
  if (DONE.has(status)) return <span className={`badge status-${status}`}>{humanize(status)}</span>;
  return (
    <Link
      to={`/documents/${documentId}?review=1`}
      className="badge-link"
      onClick={(e) => e.stopPropagation()}
      aria-label={`${humanize(status)} — open it to check and confirm`}
    >
      <span className={`badge status-${status}`}>{humanize(status)} ›</span>
    </Link>
  );
}
