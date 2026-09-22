import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Person } from "../api/client.js";
import { humanize } from "../utils.js";

export function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  function load() {
    api.people.list().then(setPeople);
  }

  useEffect(load, []);

  async function create() {
    if (!name.trim()) return;
    await api.people.create({ name });
    setName("");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>People</h2>
          <p>The humans behind the structure — each with relationships to the entities that actually own things.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New person"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Benjamin Rose" />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {people.length === 0 ? (
          <p className="empty-state">No people yet. Start with yourself.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Relationships</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/people/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>
                    {(p.entityRelationships || []).length === 0
                      ? "—"
                      : (p.entityRelationships || [])
                          .map((r) => `${humanize(r.relationshipType)} of ${r.entity?.name}`)
                          .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
