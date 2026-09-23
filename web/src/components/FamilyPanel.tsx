import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Person } from "../api/client.js";
import { confirmThenDelete, partnerIds } from "../utils.js";
import { IconBin } from "./icons.js";

type Link_ = { id: string; otherId: string; otherName: string; label: string };

/** Partner, children and parents, with a quick way to add a link. */
export function FamilyPanel({ person, people, onChange }: { person: Person; people: Person[]; onChange: () => void }) {
  const [relation, setRelation] = useState<"" | "PARTNER" | "CHILD" | "PARENT">("");
  const [otherId, setOtherId] = useState("");
  // Adding a parent: the other parent too. Adding a child: also the child of this person's partner.
  const [secondParentId, setSecondParentId] = useState("");
  const [alsoPartnersChild, setAlsoPartnersChild] = useState(true);
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
      if (relation === "PARENT" && secondParentId && secondParentId !== otherId) {
        await api.people.addFamily({ personId: person.id, relatedPersonId: secondParentId, relation: "PARENT" });
      }
      if (relation === "CHILD" && partner && alsoPartnersChild && partner.id !== otherId) {
        await api.people.addFamily({ personId: partner.id, relatedPersonId: otherId, relation: "CHILD" }).catch(() => {
          // Already recorded as their child — nothing more to do.
        });
      }
      setRelation("");
      setOtherId("");
      setSecondParentId("");
      setAlsoPartnersChild(true);
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
  const partner = people.find((p) => p.id === partnerIds(person)[0]);
  const pickOther = (id: string) => {
    setOtherId(id);
    // The chosen parent's partner is usually the other parent.
    if (relation === "PARENT") setSecondParentId(partnerIds(people.find((p) => p.id === id))[0] ?? "");
  };

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
              <select
                value={relation}
                onChange={(e) => {
                  setRelation(e.target.value as typeof relation);
                  setSecondParentId("");
                }}
              >
                <option value="">— Choose —</option>
                <option value="PARTNER">Partner</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
              </select>
            </div>
            <div>
              <label>&nbsp;</label>
              <select value={otherId} onChange={(e) => pickOther(e.target.value)} disabled={!relation}>
                <option value="">— Choose a person —</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {relation === "PARENT" && otherId && (
            <>
              <label>and (other parent)</label>
              <select value={secondParentId} onChange={(e) => setSecondParentId(e.target.value)}>
                <option value="">— Only one parent —</option>
                {others
                  .filter((p) => p.id !== otherId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </>
          )}
          {relation === "CHILD" && otherId && partner && partner.id !== otherId && (
            <label className="tick-row">
              <input type="checkbox" checked={alsoPartnersChild} onChange={(e) => setAlsoPartnersChild(e.target.checked)} />
              Also {partner.name}'s child
            </label>
          )}
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
