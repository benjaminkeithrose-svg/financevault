import { useState } from "react";
import { api, Person } from "../api/client.js";
import { HelpLink } from "./HelpLink.js";
import { MotherMaidenNameField } from "./MotherMaidenNameField.js";
import { formatDate } from "../utils.js";

export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DE_FACTO", "SEPARATED", "DIVORCED", "WIDOWED", "OTHER"];
const MARITAL_LABEL: Record<string, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DE_FACTO: "De facto",
  SEPARATED: "Separated",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
  OTHER: "Other",
};

const EMPTY = {
  dateOfBirth: "",
  maritalStatus: "",
  phone: "",
  email: "",
  currentAddress: "",
  previousAddress: "",
  nextOfKinName: "",
  nextOfKinRelationship: "",
  nextOfKinPhone: "",
  nextOfKinAddress: "",
};

/**
 * Contact and personal details — what a broker's fact find asks for, kept
 * once so it doesn't need retyping every time one comes up. Mother's
 * maiden name is kept separately, encrypted, since it's a security-question
 * answer rather than an address or phone number.
 */
export function PersonalDetailsPanel({ person, onChange }: { person: Person; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setForm({
      dateOfBirth: person.dateOfBirth?.slice(0, 10) ?? "",
      maritalStatus: person.maritalStatus ?? "",
      phone: person.phone ?? "",
      email: person.email ?? "",
      currentAddress: person.currentAddress ?? "",
      previousAddress: person.previousAddress ?? "",
      nextOfKinName: person.nextOfKinName ?? "",
      nextOfKinRelationship: person.nextOfKinRelationship ?? "",
      nextOfKinPhone: person.nextOfKinPhone ?? "",
      nextOfKinAddress: person.nextOfKinAddress ?? "",
    });
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    try {
      await api.people.update(person.id, {
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : null,
        maritalStatus: form.maritalStatus || null,
        phone: form.phone || null,
        email: form.email || null,
        currentAddress: form.currentAddress || null,
        previousAddress: form.previousAddress || null,
        nextOfKinName: form.nextOfKinName || null,
        nextOfKinRelationship: form.nextOfKinRelationship || null,
        nextOfKinPhone: form.nextOfKinPhone || null,
        nextOfKinAddress: form.nextOfKinAddress || null,
      } as never);
      setEditing(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const kin = [person.nextOfKinName, person.nextOfKinRelationship, person.nextOfKinPhone, person.nextOfKinAddress].filter(Boolean).join(" · ");

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Personal & contact details <HelpLink topic="personal-details" />
        </h3>
        {!editing && (
          <button className="btn secondary" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ marginTop: 12 }}>
          <div className="grid grid-2">
            <div>
              <label>Date of birth</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label>Marital status</label>
              <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
                <option value="">— Not recorded —</option>
                {MARITAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MARITAL_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label>Current address</label>
              <input value={form.currentAddress} onChange={(e) => setForm({ ...form, currentAddress: e.target.value })} />
            </div>
            <div>
              <label>Previous address (if under 3 years)</label>
              <input value={form.previousAddress} onChange={(e) => setForm({ ...form, previousAddress: e.target.value })} />
            </div>
          </div>

          <h4>Next of kin</h4>
          <div className="grid grid-2">
            <div>
              <label>Name</label>
              <input value={form.nextOfKinName} onChange={(e) => setForm({ ...form, nextOfKinName: e.target.value })} />
            </div>
            <div>
              <label>Relationship</label>
              <input
                value={form.nextOfKinRelationship}
                onChange={(e) => setForm({ ...form, nextOfKinRelationship: e.target.value })}
                placeholder="Spouse, parent, sibling…"
              />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.nextOfKinPhone} onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })} />
            </div>
            <div>
              <label>Address</label>
              <input value={form.nextOfKinAddress} onChange={(e) => setForm({ ...form, nextOfKinAddress: e.target.value })} />
            </div>
          </div>

          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <dl className="detail-list" style={{ marginTop: 12 }}>
          <dt>Date of birth</dt>
          <dd>{person.dateOfBirth ? formatDate(person.dateOfBirth) : "—"}</dd>
          <dt>Marital status</dt>
          <dd>{person.maritalStatus ? MARITAL_LABEL[person.maritalStatus] ?? person.maritalStatus : "—"}</dd>
          <dt>Phone</dt>
          <dd>{person.phone || "—"}</dd>
          <dt>Email</dt>
          <dd>{person.email || "—"}</dd>
          <dt>Current address</dt>
          <dd>{person.currentAddress || "—"}</dd>
          {person.previousAddress && (
            <>
              <dt>Previous address</dt>
              <dd>{person.previousAddress}</dd>
            </>
          )}
          <dt>Next of kin</dt>
          <dd>{kin || "—"}</dd>
        </dl>
      )}

      <div style={{ marginTop: 16 }}>
        <label>Mother's maiden name</label>
        <MotherMaidenNameField personId={person.id} hasValue={person.hasMotherMaidenName} masked={person.motherMaidenNameMasked} onSaved={onChange} />
      </div>
    </div>
  );
}
