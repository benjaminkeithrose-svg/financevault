import { useState } from "react";
import { Link } from "react-router-dom";
import { api, CalendarTask } from "../api/client.js";
import { formatDate } from "../utils.js";

export const CATEGORY_LABEL: Record<CalendarTask["category"], string> = {
  ID: "ID & cover",
  RENEWAL: "Renewal",
  VEHICLE: "Rego",
  WARRANTY: "Warranty",
  SERVICE: "Service",
  LEASE: "Lease",
  LOAN: "Loan",
  SMSF: "SMSF",
  INSURANCE: "Insurance",
  ESTATE: "Estate",
  REFERENCE: "Tax reference",
  REMINDER: "Reminder",
};

function nextYear(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * One date in the calendar, done like a task: tick it when it's done and it
 * leaves the list. A renewal the app knows (a policy, rego, a service) can
 * move on a year at the same time, so next year's is already there.
 */
export function TaskRow({ task, today, showDate = true, onChange }: { task: CalendarTask; today: string; showDate?: boolean; onChange: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const overdue = !task.done && task.date < today;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  function toggle() {
    if (task.done) {
      return run(() => (task.reminderId ? api.reminders.reopen(task.reminderId) : api.calendar.reopen(task.key)));
    }
    if (task.reminderId) return run(() => api.reminders.complete(task.reminderId!));
    if (task.canRollForward) return setAsking(true);
    return run(() => api.calendar.complete(task.key));
  }

  return (
    <li className={`task-row${task.done ? " done" : ""}${overdue ? " overdue" : ""}`}>
      <label className="task-tick" title={task.done ? "Mark as not done" : "Mark as done"}>
        <input type="checkbox" checked={task.done || asking} disabled={busy} onChange={toggle} aria-label={`${task.done ? "Not done" : "Done"}: ${task.title}`} />
      </label>
      <div className="task-body">
        <div>
          <Link to={task.route}>{task.title}</Link>
        </div>
        <div className="task-meta">
          {showDate && <span className={overdue ? "task-overdue" : ""}>{overdue ? `Overdue — ${formatDate(task.date)}` : formatDate(task.date)}</span>}
          <span className={`task-tag${task.category === "REMINDER" ? " mine" : ""}`}>{CATEGORY_LABEL[task.category]}</span>
          {task.repeat && <span>repeats {task.repeat.toLowerCase()}</span>}
          {task.detail && !task.done && <span>{task.detail}</span>}
          {task.done && <span>Done {task.doneAt ? formatDate(task.doneAt) : ""}{task.doneNote ? ` · ${task.doneNote}` : ""}</span>}
        </div>
        {asking && (
          <div className="task-ask">
            <span>Done. Move the date on to next year as well?</span>
            <div className="toolbar">
              <button className="btn" disabled={busy} onClick={() => run(() => api.calendar.complete(task.key, { rollForward: true }))}>
                Yes, next due {formatDate(nextYear(task.date))}
              </button>
              <button className="btn secondary" disabled={busy} onClick={() => run(() => api.calendar.complete(task.key))}>
                Just mark it done
              </button>
              <button className="link-button" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
