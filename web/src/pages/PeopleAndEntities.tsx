import { useEffect, useState } from "react";
import { api, Entity, Person } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { familySummary, humanize } from "../utils.js";

// A person's own individual entity is made with them, so new entities here
// are the structures around people: trusts, companies, super funds.
const ENTITY_TYPES = ["TRUST", "COMPANY", "SMSF", "SUPER_FUND", "PARTNERSHIP", "JOINT", "OTHER"];
const ENTITY_TYPE_LABELS: Record<string, string> = {
  TRUST: "Trust",
  COMPANY: "Company",
  SMSF: "Self-managed super fund (SMSF)",
  SUPER_FUND: "Super fund (retail / industry)",
  PARTNERSHIP: "Partnership",
  JOINT: "Joint ownership",
  OTHER: "Other",
};

const EMPTY_FORM = {
  kind: "PERSON" as "PERSON" | "ENTITY",
  name: "",
  entityType: "TRUST",
  abn: "",
  relation: "",
  relatedPersonId: "",
};

/**
 * People and the entities around them, in one list. Each person already is
 * an entity — their personal one — so they're set up once, here.
 */
export function PeopleAndEntities() {
  const [people, setPeople] = useState<Person[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm, draft] = useDraft("people-and-entities:new", EMPTY_FORM);
  const [showForm, setShowForm] = useState(draft.restored);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.people.list().then(setPeople);
    api.entities.list().then(setEntities);
  }

  useEffect(load, []);

  async function create() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    try {
      if (form.kind === "PERSON") {
        const person = await api.people.create({ name: form.name.trim() });
        if (form.relation && form.relatedPersonId) {
          await api.people.addFamily({
            personId: person.id,
            relatedPersonId: form.relatedPersonId,
            relation: form.relation as "PARTNER" | "CHILD" | "PARENT",
          });
        }
      } else {
        await api.entities.create({ name: form.name.trim(), entityType: form.entityType, abn: form.abn || null });
      }
      draft.clear();
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const structures = entities.filter((e) => !e.personalFor);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            People & entities <HelpLink topic="how-it-fits" />
          </h2>
          <p>Your family, and the trusts, companies and super funds around them. Each person is also their own entity.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "New"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          <div className="segmented" role="group" aria-label="What are you adding?">
            <button className={form.kind === "PERSON" ? "selected" : ""} onClick={() => setForm({ ...form, kind: "PERSON" })}>
              Person
            </button>
            <button className={form.kind === "ENTITY" ? "selected" : ""} onClick={() => setForm({ ...form, kind: "ENTITY" })}>
              Trust, company or fund
            </button>
          </div>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={form.kind === "PERSON" ? "Full name" : "Rose Family Trust"}
          />
          {form.kind === "PERSON" ? (
            people.length > 0 && (
              <div className="grid grid-2">
                <div>
                  <label>Family (optional)</label>
                  <select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
                    <option value="">— No family link —</option>
                    <option value="PARTNER">is the partner of</option>
                    <option value="PARENT">is a child of</option>
                    <option value="CHILD">is a parent of</option>
                  </select>
                </div>
                <div>
                  <label>&nbsp;</label>
                  <select
                    value={form.relatedPersonId}
                    onChange={(e) => setForm({ ...form, relatedPersonId: e.target.value })}
                    disabled={!form.relation}
                  >
                    <option value="">— Choose a person —</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-2">
              <div>
                <label>Type</label>
                <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ENTITY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>ABN (optional)</label>
                <input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} />
              </div>
            </div>
          )}
          {form.kind === "PERSON" && (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Their personal entity is set up with them, ready to own things in their own name.
            </p>
          )}
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={create} draft={draft} />
        </div>
      )}

      <h3>People</h3>
      {people.length === 0 ? (
        <p className="empty-state">No one yet. Start with yourself.</p>
      ) : (
        <ul className="item-card-list">
          {people.map((p) => {
            const roles = (p.entityRelationships || [])
              .filter((r) => r.relationshipType !== "INDIVIDUAL_OWNER")
              .map((r) => `${humanize(r.relationshipType)} of ${r.entity?.name}`);
            const subtitle = [familySummary(p), ...roles].filter(Boolean).join(" · ");
            return <ItemCard key={p.id} to={`/people/${p.id}`} title={p.name} subtitle={subtitle || "Person"} />;
          })}
        </ul>
      )}

      <h3>Trusts, companies & super funds</h3>
      {structures.length === 0 ? (
        <p className="empty-state">None yet.</p>
      ) : (
        <ul className="item-card-list">
          {structures.map((e) => {
            const who = (e.personRelationships || [])
              .filter((r) => ["TRUSTEE", "DIRECTOR", "MEMBER", "APPOINTOR"].includes(r.relationshipType))
              .map((r) => r.person?.name)
              .filter(Boolean);
            return (
              <ItemCard
                key={e.id}
                to={`/entities/${e.id}`}
                title={e.name}
                subtitle={[ENTITY_TYPE_LABELS[e.entityType] ?? humanize(e.entityType), e.abn ? `ABN ${e.abn}` : "", who.join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
