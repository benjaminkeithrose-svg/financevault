import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CalendarTask } from "../api/client.js";
import { HelpLink } from "./HelpLink.js";
import { TaskRow } from "./TaskRow.js";

const toDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * What's coming up in the calendar: anything overdue and the next 60 days,
 * each ticked off where it's shown. The full calendar has the rest.
 */
export function ComingUp() {
  const [tasks, setTasks] = useState<CalendarTask[] | null>(null);
  const now = new Date();
  const today = toDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const to = toDay(new Date(Date.parse(today) + 60 * 86_400_000));

  function load() {
    api.calendar
      .tasks(today, to)
      .then((t) => setTasks(t.filter((x) => !x.done)))
      .catch(() => setTasks([]));
  }
  useEffect(load, [today, to]);

  if (tasks === null) return null;
  const overdue = tasks.filter((t) => t.date < today).length;
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Coming up <HelpLink topic="calendar" />
        </h3>
        <Link className="btn secondary" to="/calendar">
          Open calendar
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="empty-state">Nothing due in the next two months.</p>
      ) : (
        <>
          {overdue > 0 && <p className="cap-explain">{overdue === 1 ? "1 thing is overdue" : `${overdue} things are overdue`} — still to do.</p>}
          <ul className="task-list">
            {tasks.slice(0, 8).map((t) => (
              <TaskRow key={t.key} task={t} today={today} onChange={load} />
            ))}
          </ul>
          {tasks.length > 8 && (
            <p className="cap-explain" style={{ marginBottom: 0 }}>
              <Link to="/calendar">{tasks.length - 8} more in the calendar</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
