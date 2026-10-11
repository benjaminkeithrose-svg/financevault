import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Reminder } from "../api/client.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { HelpLink } from "../components/HelpLink.js";
import { REPEAT_OPTIONS } from "../components/ReminderForm.js";
import { useTrailTitle } from "../trail.js";
import { formatDate } from "../utils.js";

/**
 * One reminder: what it's about, the form or files that go with it, and
 * marking it complete — with a note of what was done. A repeating one comes
 * back on its next date.
 */
export function ReminderDetail() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Reminder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", dueDate: "", repeat: "NONE", notes: "" });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useTrailTitle(r?.title);

  function load() {
    api.reminders
      .get(id!)
      .then((x) => {
        setR(x);
        setForm({ title: x.title, dueDate: x.dueDate.slice(0, 10), repeat: x.repeat, notes: x.notes ?? "" });
      })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, [id]);

  async function save() {
    try {
      await api.reminders.update(id!, { title: form.title, dueDate: form.dueDate, repeat: form.repeat, notes: form.notes || null });
      setMessage("Saved.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function complete() {
    try {
      const { next } = await api.reminders.complete(id!, note || null);
      setNote("");
      setMessage(next ? `Done. The next one is in the calendar for ${formatDate(next.dueDate)}.` : "Done — it's off the list.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reopen() {
    await api.reminders.reopen(id!);
    setMessage("Back on the list.");
    load();
  }

  if (!r) return <div className="empty-state">{error ?? "Loading…"}</div>;
  const overdue = !r.completedAt && r.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {r.title} <HelpLink topic="calendar" />
          </h2>
          <p>
            {r.completedAt ? `Done ${formatDate(r.completedAt)}` : overdue ? `Overdue — was due ${formatDate(r.dueDate)}` : `Due ${formatDate(r.dueDate)}`}
            {r.repeat !== "NONE" ? ` · ${REPEAT_OPTIONS.find((o) => o.value === r.repeat)?.label.toLowerCase()}` : ""}
            {r.target && (
              <>
                {" · about "}
                <Link to={r.target.route}>{r.target.name}</Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        {r.completedAt ? (
          <>
            <h3 style={{ marginTop: 0 }}>Done</h3>
            <p>{r.completeNote ? `“${r.completeNote}”` : "Marked complete."}</p>
            <button className="btn secondary" onClick={reopen}>
              Not done after all
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Mark it complete</h3>
            <label htmlFor="complete-note">What was done (optional)</label>
            <input id="complete-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Serviced at the dealer, $420 — invoice attached" />
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn" onClick={complete}>
                Mark complete
              </button>
            </div>
            {r.repeat !== "NONE" && <p className="cap-explain">It repeats, so the next one goes in the calendar when this one's done.</p>}
          </>
        )}
        {message && <div className="message-box info">{message}</div>}
        {error && <div className="message-box warning">{error}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Forms and files</h3>
        <p className="cap-explain">
          {r.target ? `Files added here are also filed under ${r.target.name}.` : "The form to fill in, the quote, the receipt when it's done."}
        </p>
        <DocumentLinker targetType="REMINDER" targetId={r.id} onChange={load} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details</h3>
        <label htmlFor="r-title">What needs doing</label>
        <input id="r-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div className="grid grid-2">
          <div>
            <label htmlFor="r-due">Due</label>
            <input id="r-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <label htmlFor="r-repeat">Repeats</label>
            <select id="r-repeat" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="r-notes">Notes</label>
        <input id="r-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={save}>
            Save changes
          </button>
        </div>
      </div>

      <DeleteSection
        title="Delete this reminder"
        note="Its forms and files stay in Documents."
        question={`Delete the reminder "${r.title}"? This can't be undone.`}
        action={() => api.reminders.remove(r.id)}
        redirectTo="/calendar"
      />
    </div>
  );
}
