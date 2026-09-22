import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Entity, Person } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { humanize } from "../utils.js";

const RELATIONSHIP_TYPES = [
  "SETTLOR",
  "TRUSTEE",
  "DIRECTOR",
  "SHAREHOLDER",
  "BENEFICIARY",
  "MEMBER",
  "INDIVIDUAL_OWNER",
  "JOINT_OWNER",
  "GUARANTOR",
  "BORROWER",
  "APPOINTOR",
  "ACCOUNTANT",
  "TAX_AGENT",
  "OTHER",
];

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relType, setRelType] = useState("TRUSTEE");
  const [relEntityId, setRelEntityId] = useState("");
  const [relPercent, setRelPercent] = useState("");

  function load() {
    if (!id) return;
    api.people.get(id).then(setPerson);
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  if (!person) return <div className="empty-state">Loading…</div>;

  async function addRelationship() {
    if (!id || !relEntityId) return;
    await api.people.addRelationship({
      personId: id,
      entityId: relEntityId,
      relationshipType: relType,
      ownershipPercent: relPercent ? Number(relPercent) : null,
    });
    setRelEntityId("");
    setRelPercent("");
    load();
  }

  async function removeRelationship(relId: string) {
    await api.people.removeRelationship(relId);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{person.name}</h2>
          <p>Person — relationships to the legal entities that own assets on their behalf or with their involvement.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Relationships to entities</h3>
        {(person.entityRelationships || []).length === 0 ? (
          <p className="empty-state">No relationships recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Entity</th>
                <th>Ownership %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(person.entityRelationships || []).map((r) => (
                <tr key={r.id}>
                  <td>{humanize(r.relationshipType)}</td>
                  <td>
                    <Link to={`/entities/${r.entityId}`}>{r.entity?.name}</Link>
                  </td>
                  <td>{r.ownershipPercent !== null && r.ownershipPercent !== undefined ? `${r.ownershipPercent}%` : "—"}</td>
                  <td>
                    <button className="btn secondary" onClick={() => removeRelationship(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <label>Role</label>
        <select value={relType} onChange={(e) => setRelType(e.target.value)}>
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
        <div className="grid grid-2">
          <div>
            <label>Entity</label>
            <select value={relEntityId} onChange={(e) => setRelEntityId(e.target.value)}>
              <option value="">— Select —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({humanize(e.entityType)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Ownership % (if relevant)</label>
            <input type="number" value={relPercent} onChange={(e) => setRelPercent(e.target.value)} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={addRelationship}>
            Add relationship
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="PERSON" targetId={person.id} />
      </div>
    </div>
  );
}
