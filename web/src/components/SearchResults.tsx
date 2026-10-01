import { useEffect, useState } from "react";
import { api, Document, Entity } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";
import { ItemCard } from "./ItemCard.js";

export function SearchResults({ q }: { q: string }) {
  const [results, setResults] = useState<{ documents: Document[]; entities: Entity[] } | null>(null);

  useEffect(() => {
    if (!q) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      api.search(q).then(setResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  if (!q) return <p className="empty-state">Type a query to search documents and entities.</p>;
  if (!results) return null;

  return (
    <>
      <div className="card">
        <h3>Entities ({results.entities.length})</h3>
        {results.entities.length === 0 ? (
          <p className="empty-state">No matching entities.</p>
        ) : (
          <ul className="item-card-list">
            {results.entities.map((e) => (
              <ItemCard
                key={e.id}
                to={`/entities/${e.id}`}
                title={e.name}
                subtitle={humanize(e.entityType)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Documents ({results.documents.length})</h3>
        {results.documents.length === 0 ? (
          <p className="empty-state">No matching documents.</p>
        ) : (
          <ul className="item-card-list">
            {results.documents.map((d) => (
              <ItemCard
                key={d.id}
                to={`/documents/${d.id}`}
                title={d.originalFilename}
                subtitle={`${d.documentType || "Unclassified"} · ${d.entity?.name || "No entity"} · ${formatDate(d.documentDate || d.uploadDate)}`}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
