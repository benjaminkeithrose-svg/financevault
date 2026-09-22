import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { humanize } from "../utils.js";

// Legal/ownership vehicles only — an Entity is who owns things, never the
// thing itself. Properties, bank accounts and investment accounts are
// Assets/Accounts that belong TO an entity, not entity types.
const ENTITY_TYPES = ["INDIVIDUAL", "JOINT", "TRUST", "COMPANY", "PARTNERSHIP", "SUPER_FUND", "SMSF", "OTHER"];

export function Entities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("INDIVIDUAL");
  const [abn, setAbn] = useState("");

  function load() {
    api.entities.list().then(setEntities);
  }

  useEffect(load, []);

  async function create() {
    if (!name.trim()) return;
    await api.entities.create({ name, entityType, abn: abn || null });
    setName("");
    setAbn("");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Entities</h2>
          <p>The legal/ownership vehicles that hold assets — individuals, trusts, companies, partnerships, super funds and SMSFs.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New entity"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Benjamin Rose" />
          <label>Type</label>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
          <label>ABN (optional)</label>
          <input value={abn} onChange={(e) => setAbn(e.target.value)} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {entities.length === 0 ? (
          <p className="empty-state">No entities yet. Start with yourself.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>ABN</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/entities/${e.id}`}>{e.name}</Link>
                  </td>
                  <td>{humanize(e.entityType)}</td>
                  <td>{e.abn || "—"}</td>
                  <td>{e._count?.documents ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
