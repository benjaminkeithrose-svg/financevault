import { useEffect, useState } from "react";
import { api, Person } from "../api/client.js";
import { PERSON_FEATURES, personFeaturesOff, useFeatures } from "../features.js";

/**
 * "Show on this page": parts of the app switched off for one person — a
 * child with no job, cover or will, say. Switched off, the section leaves
 * their page and What's missing and the accountant checklist stop asking
 * about it for them. Nothing is deleted; ticking it again brings it back.
 */
export function PersonSections({ person, onChange }: { person: Person; onChange: () => void }) {
  const { on } = useFeatures();
  const [error, setError] = useState<string | null>(null);
  // Ticks change straight away; the page catches up once it's saved.
  const [off, setOff] = useState(() => personFeaturesOff(person));
  useEffect(() => setOff(personFeaturesOff(person)), [person.featuresOff]); // eslint-disable-line react-hooks/exhaustive-deps
  // A feature switched off for everyone in Settings isn't offered here.
  const offered = PERSON_FEATURES.filter((f) => f.global === null || on(f.global));
  if (offered.length === 0) return null;

  async function toggle(id: string) {
    setError(null);
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOff(next);
    try {
      await api.people.update(person.id, { featuresOff: [...next] });
      onChange();
    } catch (e) {
      setOff(personFeaturesOff(person));
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Show on this page</h3>
      <p className="cap-explain" style={{ marginTop: 0 }}>
        Untick what doesn't apply to {person.name}. It's hidden here, and What's missing and the accountant checklist stop asking
        about it for them. Nothing is deleted.
      </p>
      <ul className="tick-list">
        {offered.map((f) => (
          <li key={f.id}>
            <label>
              <input type="checkbox" checked={!off.has(f.id)} onChange={() => toggle(f.id)} />
              <span>
                {f.name}
                <span className="cap-explain" style={{ display: "block", margin: 0 }}>
                  {f.blurb}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <div className="message-box warning">{error}</div>}
    </div>
  );
}
