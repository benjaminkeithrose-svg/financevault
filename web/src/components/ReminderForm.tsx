import { useEffect, useRef, useState } from "react";
import { api, Reminder } from "../api/client.js";
import { recordsChanged } from "../features.js";
import { policyKindLabel } from "./InsurancePanel.js";

export const REPEAT_OPTIONS = [
  { value: "NONE", label: "Just once" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Every 3 months" },
  { value: "YEARLY", label: "Every year" },
];

/** Quick starts for the things that come round every year. */
const SUGGESTIONS = ["Yearly service", "Renew insurance", "Send papers to the accountant", "Lodge tax return", "Check rego", "Review super"];

export interface ReminderTarget {
  type: string;
  id: string;
  name: string;
}

interface Option {
  value: string; // TYPE:id
  label: string;
  group: string;
}

async function targetOptions(): Promise<Option[]> {
  const [assets, properties, commercial, people, entities, policies, loans] = await Promise.all([
    api.assets.list().catch(() => []),
    api.properties.list().catch(() => []),
    api.commercialProperties.list().catch(() => []),
    api.people.list().catch(() => []),
    api.entities.list().catch(() => []),
    api.insurance.list().catch(() => []),
    api.liabilities.list().catch(() => []),
  ]);
  const out: Option[] = [];
  for (const p of properties) out.push({ value: `PROPERTY:${p.id}`, label: p.asset?.name ?? p.address, group: "Properties" });
  for (const c of commercial) out.push({ value: `COMMERCIAL_PROPERTY:${c.id}`, label: c.name, group: "Properties" });
  for (const a of assets.filter((x) => !["PROPERTY", "COMMERCIAL_PROPERTY"].includes(x.assetType) && !x.disposalDate)) {
    out.push({ value: `ASSET:${a.id}`, label: a.name, group: a.assetType === "VEHICLE" ? "Vehicles & boats" : "Other assets" });
  }
  for (const p of policies) {
    out.push({ value: `INSURANCE_POLICY:${p.id}`, label: `${policyKindLabel(p.kind)} — ${p.insurer ?? "insurer not recorded"}${p.asset ? ` (${p.asset.name})` : ""}`, group: "Insurance" });
  }
  for (const l of loans) out.push({ value: `LIABILITY:${l.id}`, label: l.name, group: "Loans & cards" });
  for (const p of people) out.push({ value: `PERSON:${p.id}`, label: p.name, group: "People" });
  for (const e of entities.filter((x) => x.entityType !== "INDIVIDUAL")) out.push({ value: `ENTITY:${e.id}`, label: e.name, group: "Trusts, companies & funds" });
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Adding a reminder: what needs doing, when, how often, what it's about, and
 * a form or file to go with it. On an asset's page the "about" is that asset.
 */
export function ReminderForm({
  target,
  defaultDate,
  onSaved,
  onCancel,
}: {
  target?: ReminderTarget;
  defaultDate?: string;
  onSaved: (r: Reminder) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate ?? today());
  const [repeat, setRepeat] = useState("NONE");
  const [about, setAbout] = useState(target ? `${target.type}:${target.id}` : "");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) targetOptions().then(setOptions);
  }, [target]);

  async function save() {
    if (!title.trim()) return setError("Say what needs doing.");
    if (!dueDate) return setError("Choose the date it's due.");
    setError(null);
    setSaving(true);
    try {
      const [targetType, targetId] = about ? about.split(":") : [null, null];
      const r = await api.reminders.create({ title: title.trim(), dueDate, repeat, notes: notes.trim() || null, targetType, targetId });
      for (const file of Array.from(files ?? [])) {
        const { document } = await api.documents.upload(file);
        await api.documents.addLink(document.id, { targetType: "REMINDER", targetId: r.id });
      }
      if (files?.length) recordsChanged();
      onSaved(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const groups = [...new Set((options ?? []).map((o) => o.group))];

  return (
    <div className="sub-form reminder-form">
      <label htmlFor="reminder-title">What needs doing</label>
      <input id="reminder-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yearly service" autoFocus />
      <div className="chip-row">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className={`chip ${title === s ? "selected" : ""}`} onClick={() => setTitle(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-2">
        <div>
          <label htmlFor="reminder-date">Due</label>
          <input id="reminder-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="reminder-repeat">Repeats</label>
          <select id="reminder-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {target ? (
        <p className="cap-explain">About {target.name}.</p>
      ) : (
        <>
          <label htmlFor="reminder-about">About (optional)</label>
          <select id="reminder-about" value={about} onChange={(e) => setAbout(e.target.value)}>
            <option value="">Nothing in particular</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {options!
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </>
      )}
      <label htmlFor="reminder-notes">Notes (optional)</label>
      <input id="reminder-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Book with the usual mechanic" />
      <label htmlFor="reminder-files">A form or file to go with it (optional)</label>
      <input id="reminder-files" ref={fileRef} type="file" multiple onChange={(e) => setFiles(e.target.files)} />
      {error && <div className="message-box warning">{error}</div>}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Add reminder"}
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
