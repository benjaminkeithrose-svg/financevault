import { Document } from "../api/client.js";
import { financialYearLabelForToday, formatDate } from "../utils.js";
import { ItemCard } from "./ItemCard.js";

/** A reference's title, from its saved file name ("TR 2000/2 — saved 2026-09-27.pdf" → "TR 2000/2"). */
export function referenceTitle(filename: string): string {
  return filename.replace(/ — saved \d{4}-\d{2}-\d{2}(?=\.[a-z0-9]+$)/i, "").replace(/\.[a-z0-9]+$/i, "");
}

/**
 * The reference library, shelved the way its folders are — ATO / Rulings,
 * ATO / Occupation guides / A–D, Revenue NSW… — with when the publisher last
 * updated each one, and whether that was this financial year. Replaced
 * copies sit at the end.
 */
export function ReferenceList({ documents }: { documents: Document[] }) {
  const fyStart = `${financialYearLabelForToday().slice(0, 4)}-07-01`;
  const current = documents.filter((d) => !d.supersededAt);
  const replaced = documents.filter((d) => d.supersededAt);
  const shelves = new Map<string, Document[]>();
  for (const d of current) {
    const shelf = d.referenceFolder ?? "Other";
    shelves.set(shelf, [...(shelves.get(shelf) ?? []), d]);
  }
  const ordered = [...shelves.entries()].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));

  const card = (d: Document) => {
    const thisYear = !!d.sourceUpdatedAt && d.sourceUpdatedAt.slice(0, 10) >= fyStart;
    const parts = [
      d.referenceCode,
      d.sourceUpdatedAt ? `last updated ${formatDate(d.sourceUpdatedAt)}` : "no update date on the page",
      d.supersededAt ? `replaced ${formatDate(d.supersededAt)}` : d.retrievedAt ? `this copy saved ${formatDate(d.retrievedAt)}` : null,
    ].filter(Boolean);
    return (
      <ItemCard
        key={d.id}
        to={`/documents/${d.id}`}
        title={referenceTitle(d.originalFilename)}
        subtitle={parts.join(" · ")}
        right={
          d.withdrawnNote ? (
            <span className="badge reference-badge warning">Withdrawn</span>
          ) : thisYear && !d.supersededAt ? (
            <span className="badge reference-badge this-year">Updated this year</span>
          ) : null
        }
      />
    );
  };

  if (documents.length === 0) return <p className="empty-state">No tax references yet.</p>;
  return (
    <>
      {ordered.map(([shelf, list]) => (
        <div key={shelf} className="reference-shelf">
          <h3>{shelf.split("/").join(" › ")}</h3>
          <ul className="item-card-list">{list.map(card)}</ul>
        </div>
      ))}
      {replaced.length > 0 && (
        <details className="profit-details">
          <summary>
            {replaced.length} replaced cop{replaced.length === 1 ? "y" : "ies"} — kept for anything that relied on them
          </summary>
          <ul className="item-card-list">{replaced.map(card)}</ul>
        </details>
      )}
    </>
  );
}
