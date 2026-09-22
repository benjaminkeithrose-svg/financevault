import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, Document, Entity } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [results, setResults] = useState<{ documents: Document[]; entities: Entity[] } | null>(null);

  useEffect(() => {
    if (!q) {
      setResults(null);
      return;
    }
    api.search(q).then(setResults);
  }, [q]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Search results for "{q}"</h2>
          <p>Searches document metadata, OCR text, notes and entity records.</p>
        </div>
      </div>

      {!results ? (
        <p className="empty-state">Type a query in the search box above.</p>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Entities ({results.entities.length})</h3>
            {results.entities.length === 0 ? (
              <p className="empty-state">No matching entities.</p>
            ) : (
              <ul>
                {results.entities.map((e) => (
                  <li key={e.id}>
                    <Link to={`/entities/${e.id}`}>{e.name}</Link> — {humanize(e.entityType)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Documents ({results.documents.length})</h3>
            {results.documents.length === 0 ? (
              <p className="empty-state">No matching documents.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Entity</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results.documents.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                      </td>
                      <td>{d.documentType || "—"}</td>
                      <td>{d.entity?.name || "—"}</td>
                      <td>{formatDate(d.documentDate || d.uploadDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
