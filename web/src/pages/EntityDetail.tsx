import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { formatDate, humanize } from "../utils.js";

export function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [relType, setRelType] = useState("OWNS");
  const [relTarget, setRelTarget] = useState("");

  function load() {
    if (!id) return;
    api.entities.get(id).then(setEntity);
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setAllEntities);
  }, []);

  if (!entity) return <div className="empty-state">Loading…</div>;

  async function addRelationship() {
    if (!id || !relTarget) return;
    await api.entities.addRelationship({ fromEntityId: id, toEntityId: relTarget, relationshipType: relType });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{entity.name}</h2>
          <p>{humanize(entity.entityType)}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Details</h3>
          <table>
            <tbody>
              <tr>
                <td>ABN</td>
                <td>{entity.abn || "—"}</td>
              </tr>
              <tr>
                <td>ACN</td>
                <td>{entity.acn || "—"}</td>
              </tr>
              <tr>
                <td>TFN</td>
                <td>{entity.tfn ? "•••• stored" : "—"}</td>
              </tr>
              <tr>
                <td>Notes</td>
                <td>{entity.notes || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Relationships</h3>
          {(entity.relationshipsFrom || []).map((r) => (
            <div className="entity-graph-item" key={r.id}>
              <strong>{entity.name}</strong> {humanize(r.relationshipType).toLowerCase()}{" "}
              <Link to={`/entities/${r.toEntityId}`}>{r.toEntity?.name}</Link>
            </div>
          ))}
          {(entity.relationshipsTo || []).map((r) => (
            <div className="entity-graph-item" key={r.id}>
              <Link to={`/entities/${r.fromEntityId}`}>{r.fromEntity?.name}</Link>{" "}
              {humanize(r.relationshipType).toLowerCase()} <strong>{entity.name}</strong>
            </div>
          ))}
          {(entity.relationshipsFrom || []).length === 0 && (entity.relationshipsTo || []).length === 0 && (
            <p className="empty-state">No relationships yet.</p>
          )}

          <label>Relationship type</label>
          <input value={relType} onChange={(e) => setRelType(e.target.value)} placeholder="OWNS, TRUSTEE_OF, BENEFICIARY_OF…" />
          <label>Target entity</label>
          <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
            <option value="">— Select —</option>
            {allEntities
              .filter((e) => e.id !== id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={addRelationship}>
              Add relationship
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        {(entity.documents || []).length === 0 ? (
          <p className="empty-state">No documents linked yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(entity.documents || []).map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                  </td>
                  <td>{d.documentType || "—"}</td>
                  <td>
                    <span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>
                  </td>
                  <td>{formatDate(d.uploadDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
