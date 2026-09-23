import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Person } from "../api/client.js";
import { confirmThenDelete } from "../utils.js";
import { IconBin } from "./icons.js";

type Link_ = { id: string; otherId: string; otherName: string; label: string };

/** Partner, children and parents, with a quick way to add a link. */
export function FamilyPanel({ person, people, onChange }: { person: Person; people: Person[]; onChange: () => void }) {
  const [relation, setRelation] = useState<"" | "PARTNER" | "CHILD" | "PARENT">("");
  const [otherId, setOtherId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const links: Link_[] = [
    ...(person.familyFrom ?? []).map((f) => ({
      id: f.id,
      otherId: f.toPerson.id,
      otherName: f.toPerson.name,
      label: f.relationshipType === "PARTNER" ? "Partner" : "Child",
    })),
    ...(person.familyTo ?? []).map((f) => ({
      id: f.id,
      otherId: f.fromPerson.id,
      otherName: f.fromPerson.name,
      label: f.relationshipType === "PARTNER" ? "Partner" : "Parent",
    })),
  ].sort((a, b) => ["Partner", "Child", "Parent"].indexOf(a.label) - ["Partner", "Child", "Parent"].indexOf(b.label));

  async function add() {
    if (!relation || !otherId) return;
    setError(null);
    try {
      await api.people.addFamily({ personId: person.id, relatedPersonId: otherId, relation });
      setRelation("");
      setOtherId("");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(link: Link_) {
    if (await confirmThenDelete(`Remove the family link to ${link.otherName}? Neither person is deleted.`, () => api.people.removeFamily(link.id))) {
      onChange();
    }
  }

  const others = people.filter((p) => p.id !== person.id);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Family</h3>
      {links.length === 0 ? (
        <p className="empty-state">No family linked yet.</p>
      ) : (
        <ul className="plain-list">
          {links.map((l) => (
            <li key={l.id}>
              <span>
                {l.label}: <Link to={`/people/${l.otherId}`}>{l.otherName}</Link>
              </span>
              <button className="icon-btn danger" aria-label={`Remove family link to ${l.otherName}`} onClick={() => remove(l)}>
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <>
          <div className="grid grid-2">
            <div>
              <label>Add family</label>
              <select value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)}>
                <option value="">— Choose —</option>
                <option value="PARTNER">Partner</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
              </select>
            </div>
            <div>
              <label>&nbsp;</label>
              <select value={otherId} onChange={(e) => setOtherId(e.target.value)} disabled={!relation}>
                <option value="">— Choose a person —</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={add} disabled={!relation || !otherId}>
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}
