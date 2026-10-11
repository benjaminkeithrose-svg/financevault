import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Reminder } from "../api/client.js";
import { formatDate } from "../utils.js";
import { ReminderForm } from "./ReminderForm.js";

/**
 * Reminders about this asset, property, person or policy — "do the yearly
 * maintenance, upload the form" — added from its own page. They go in the
 * calendar and stay until they're marked complete.
 */
export function RemindersCard({ targetType, targetId, name }: { targetType: string; targetId: string; name: string }) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    api.reminders
      .list({ targetType, targetId, open: "1" })
      .then(setReminders)
      .catch(() => setReminders([]));
  }
  useEffect(load, [targetType, targetId]);

  async function done(r: Reminder) {
    await api.reminders.complete(r.id);
    load();
  }

  if (reminders === null) return null;
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Reminders</h3>
        <button className="btn secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add calendar reminder"}
        </button>
      </div>
      {adding && (
        <ReminderForm
          target={{ type: targetType, id: targetId, name }}
          onSaved={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {reminders.length === 0 ? (
        !adding && <p className="empty-state">No reminders about {name}. Add one for a yearly service, a renewal, or anything else that needs doing.</p>
      ) : (
        <ul className="task-list">
          {reminders.map((r) => {
            const overdue = r.dueDate.slice(0, 10) < today;
            return (
              <li key={r.id} className={`task-row${overdue ? " overdue" : ""}`}>
                <label className="task-tick" title="Mark as done">
                  <input type="checkbox" checked={false} onChange={() => done(r)} aria-label={`Done: ${r.title}`} />
                </label>
                <div className="task-body">
                  <Link to={`/reminders/${r.id}`}>{r.title}</Link>
                  <div className="task-meta">
                    <span className={overdue ? "task-overdue" : ""}>{overdue ? `Overdue — ${formatDate(r.dueDate)}` : formatDate(r.dueDate)}</span>
                    {r.repeat !== "NONE" && <span>repeats {r.repeat.toLowerCase()}</span>}
                    {r.fileCount > 0 && <span>{r.fileCount === 1 ? "1 file" : `${r.fileCount} files`}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="cap-explain" style={{ marginBottom: 0 }}>
        <Link to="/calendar">Open the calendar</Link>
      </p>
    </div>
  );
}
