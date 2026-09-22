import { useEffect, useState } from "react";
import { api, Person } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { humanize } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

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
          <h2>People <HelpLink topic="how-it-fits" /></h2>
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

      {people.length === 0 ? (
        <p className="empty-state">No people yet. Start with yourself.</p>
      ) : (
        <ul className="item-card-list">
          {people.map((p) => (
            <ItemCard
              key={p.id}
              to={`/people/${p.id}`}
              title={p.name}
              subtitle={
                (p.entityRelationships || []).length === 0
                  ? "No relationships yet"
                  : (p.entityRelationships || [])
                      .map((r) => `${humanize(r.relationshipType)} of ${r.entity?.name}`)
                      .join(", ")
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
