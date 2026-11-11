import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, CalendarTask } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { ReminderForm } from "../components/ReminderForm.js";
import { TaskRow } from "../components/TaskRow.js";

/**
 * The calendar for money matters only — renewals, rego, services, tax and
 * the person's own reminders — kept apart from their work calendar. Year,
 * month, week and day views, and a list of what's to do. Every date is a
 * task: it stays until it's ticked off.
 */

type View = "list" | "day" | "week" | "month" | "year";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "list", label: "To do" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];
const VIEW_KEY = "fv-calendar-view";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Dates as YYYY-MM-DD, worked out in UTC so a day is the same day everywhere.
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
function addDays(s: string, n: number) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}
function addMonths(s: string, n: number) {
  const d = parse(s);
  return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}
const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
const monthEnd = (s: string) => {
  const d = parse(monthStart(s));
  return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};
/** Monday of the week the day falls in. */
const weekStart = (s: string) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => parse(s).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

function localToday() {
  const n = new Date();
  return toDay(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

function rangeFor(view: View, at: string): { from: string; to: string } {
  switch (view) {
    case "day":
      return { from: at, to: at };
    case "week":
      return { from: weekStart(at), to: addDays(weekStart(at), 6) };
    case "month":
      return { from: weekStart(monthStart(at)), to: addDays(weekStart(monthEnd(at)), 6) };
    case "year":
      return { from: `${at.slice(0, 4)}-01-01`, to: `${at.slice(0, 4)}-12-31` };
    default:
      return { from: localToday(), to: addDays(localToday(), 365) };
  }
}

function heading(view: View, at: string): string {
  switch (view) {
    case "day":
      return fmt(at, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    case "week": {
      const end = addDays(weekStart(at), 6);
      return `${fmt(weekStart(at), { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    case "month":
      return fmt(at, { month: "long", year: "numeric" });
    case "year":
      return at.slice(0, 4);
    default:
      return "The next 12 months";
  }
}

function step(view: View, at: string, n: number): string {
  if (view === "day") return addDays(at, n);
  if (view === "week") return addDays(at, 7 * n);
  if (view === "month") return addMonths(at, n);
  if (view === "year") return `${Number(at.slice(0, 4)) + n}-01-01`;
  return at;
}

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    return v && VIEWS.some((x) => x.id === v) ? v : "list";
  } catch {
    return "list";
  }
}

export function Calendar() {
  const navigate = useNavigate();
  const today = localToday();
  const [view, setViewState] = useState<View>(readView);
  const [at, setAt] = useState(today);
  const [tasks, setTasks] = useState<CalendarTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);

  function setView(v: View) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* just for this visit */
    }
  }

  const { from, to } = rangeFor(view, at);
  function load() {
    api.calendar
      .tasks(from, to)
      .then((t) => {
        setTasks(t);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, [from, to]);

  const all = tasks ?? [];
  const overdue = all.filter((t) => !t.done && t.date < today && (view === "list" || t.date < from));
  const visible = all.filter((t) => t.date >= from && t.date <= to && (showDone || !t.done) && !(view === "list" && t.date < today));
  const onDay = (d: string) => visible.filter((t) => t.date === d);
  const open = (d: string, v: View) => {
    setAt(d);
    setView(v);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Calendar <HelpLink topic="calendar" />
          </h2>
          <p>Renewals, rego, services, tax and your own reminders — each stays until you tick it off.</p>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add reminder"}
        </button>
      </div>

      {adding && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New reminder</h3>
          <ReminderForm
            defaultDate={view === "list" ? today : at}
            onSaved={(r) => {
              setAdding(false);
              navigate(`/reminders/${r.id}`);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div className="card calendar-controls">
        <div className="segmented" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={view === v.id ? "selected" : ""} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="calendar-nav">
          {view !== "list" && (
            <>
              <button className="btn secondary" aria-label="Earlier" onClick={() => setAt(step(view, at, -1))}>
                ‹
              </button>
              <button className="btn secondary" onClick={() => setAt(today)}>
                Today
              </button>
              <button className="btn secondary" aria-label="Later" onClick={() => setAt(step(view, at, 1))}>
                ›
              </button>
            </>
          )}
          <strong className="calendar-heading">{heading(view, at)}</strong>
        </div>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show what's done
          </label>
          <a className="link-button" href={api.calendar.icsUrl} download>
            Copy to my other calendar (file)
          </a>
        </div>
      </div>

      {error && <div className="message-box warning">{error}</div>}
      {tasks === null && !error && <p className="empty-state">Loading…</p>}

      {tasks !== null && overdue.length > 0 && (
        <div className="card calendar-overdue">
          <h3 style={{ marginTop: 0 }}>Overdue — still to do</h3>
          <ul className="task-list">
            {overdue.map((t) => (
              <TaskRow key={t.key} task={t} today={today} onChange={load} />
            ))}
          </ul>
        </div>
      )}

      {tasks !== null && view === "list" && <ListView tasks={visible} today={today} onChange={load} />}
      {tasks !== null && view === "day" && (
        <div className="card">
          <DayList tasks={onDay(at)} today={today} onChange={load} empty="Nothing on this day." />
        </div>
      )}
      {tasks !== null && view === "week" && (
        <div className="calendar-week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(at), i)).map((d) => (
            <div key={d} className={`card calendar-week-day${d === today ? " today" : ""}`}>
              <button className="link-button calendar-day-link" onClick={() => open(d, "day")}>
                {fmt(d, { weekday: "short", day: "numeric", month: "short" })}
              </button>
              <DayList tasks={onDay(d)} today={today} onChange={load} empty="—" compact />
            </div>
          ))}
        </div>
      )}
      {tasks !== null && view === "month" && <MonthGrid at={at} today={today} tasks={visible} onOpenDay={(d) => open(d, "day")} />}
      {tasks !== null && view === "year" && (
        <div className="calendar-year">
          {Array.from({ length: 12 }, (_, m) => `${at.slice(0, 4)}-${String(m + 1).padStart(2, "0")}-01`).map((m) => {
            const inMonth = visible.filter((t) => t.date.slice(0, 7) === m.slice(0, 7));
            return (
              <button key={m} className={`card calendar-year-month${m.slice(0, 7) === today.slice(0, 7) ? " today" : ""}`} onClick={() => open(m, "month")}>
                <strong>{fmt(m, { month: "long" })}</strong>
                <span className="cap-explain">{inMonth.length === 0 ? "Nothing due" : `${inMonth.length} to do`}</span>
                <ul>
                  {inMonth.slice(0, 3).map((t) => (
                    <li key={t.key} className={t.done ? "done" : ""}>
                      {fmt(t.date, { day: "numeric" })} · {t.title}
                    </li>
                  ))}
                  {inMonth.length > 3 && <li>and {inMonth.length - 3} more</li>}
                </ul>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayList({ tasks, today, onChange, empty, compact }: { tasks: CalendarTask[]; today: string; onChange: () => void; empty: string; compact?: boolean }) {
  if (tasks.length === 0) return <p className={compact ? "cap-explain" : "empty-state"}>{empty}</p>;
  return (
    <ul className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.key} task={t} today={today} showDate={false} onChange={onChange} />
      ))}
    </ul>
  );
}

function ListView({ tasks, today, onChange }: { tasks: CalendarTask[]; today: string; onChange: () => void }) {
  const byMonth = new Map<string, CalendarTask[]>();
  for (const t of tasks) byMonth.set(t.date.slice(0, 7), [...(byMonth.get(t.date.slice(0, 7)) ?? []), t]);
  if (byMonth.size === 0) {
    return (
      <div className="card">
        <p className="empty-state">Nothing due in the next 12 months. Add a reminder, or record renewal and expiry dates on policies, vehicles and ID.</p>
      </div>
    );
  }
  return (
    <>
      {[...byMonth.entries()].map(([month, list]) => (
        <div key={month} className="card">
          <h3 style={{ marginTop: 0 }}>{fmt(`${month}-01`, { month: "long", year: "numeric" })}</h3>
          <ul className="task-list">
            {list.map((t) => (
              <TaskRow key={t.key} task={t} today={today} onChange={onChange} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function MonthGrid({ at, today, tasks, onOpenDay }: { at: string; today: string; tasks: CalendarTask[]; onOpenDay: (d: string) => void }) {
  const start = weekStart(monthStart(at));
  const end = addDays(weekStart(monthEnd(at)), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const month = at.slice(0, 7);
  return (
    <div className="card calendar-month-grid">
      <div className="calendar-grid" role="grid" aria-label={fmt(at, { month: "long", year: "numeric" })}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-grid-head" role="columnheader">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = tasks.filter((t) => t.date === d);
          return (
            <button
              key={d}
              className={`calendar-cell${d.slice(0, 7) !== month ? " other-month" : ""}${d === today ? " today" : ""}${list.length ? " has-tasks" : ""}`}
              onClick={() => onOpenDay(d)}
              aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}: ${list.length === 0 ? "nothing due" : `${list.length} to do`}`}
            >
              <span className="calendar-cell-day">{Number(d.slice(8))}</span>
              {list.slice(0, 3).map((t) => (
                <span key={t.key} className={`calendar-chip${t.category === "REMINDER" ? " mine" : ""}${t.done ? " done" : ""}${!t.done && t.date < today ? " overdue" : ""}`}>
                  {t.title}
                </span>
              ))}
              {list.length > 3 && <span className="calendar-more">+{list.length - 3}</span>}
              {list.length > 0 && <span className="calendar-count">{list.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
