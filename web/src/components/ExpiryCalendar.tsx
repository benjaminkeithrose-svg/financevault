import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CalendarEvent } from "../api/client.js";
import { HelpLink } from "./HelpLink.js";

const CATEGORY_LABEL: Record<CalendarEvent["category"], string> = {
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
};

const CATEGORY_COLOUR: Record<CalendarEvent["category"], string> = {
  ID: "#4f8cff",
  RENEWAL: "#8b5cf6",
  VEHICLE: "#0ea5e9",
  WARRANTY: "#14b8a6",
  SERVICE: "#f59e0b",
  LEASE: "#35c98f",
  LOAN: "#64748b",
  SMSF: "#7c3aed",
  INSURANCE: "#0ea5e9",
  ESTATE: "#64748b",
  REFERENCE: "#64748b",
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Everything that expires or falls due — ID, insurance, rego, warranties,
 * services, leases, fixed rates — month by month. "Add to my calendar"
 * downloads a calendar file with each date and a reminder two weeks before.
 */
export function ExpiryCalendar() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.calendar.list().then(setEvents).catch(() => setEvents([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const overdue = (events ?? []).filter((e) => e.date < today);
  const upcoming = (events ?? []).filter((e) => e.date >= today && (showAll || e.date <= inAYear));
  const later = (events ?? []).filter((e) => e.date > inAYear).length;

  const byMonth = new Map<string, CalendarEvent[]>();
  for (const e of upcoming) {
    const key = e.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <div className="card expiry-calendar">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Expiries & renewals <HelpLink topic="calendar" />
        </h3>
        <a className="btn secondary" href={api.calendar.icsUrl} download>
          Add to my calendar
        </a>
      </div>

      {events === null ? (
        <p className="empty-state">Loading…</p>
      ) : events.length === 0 ? (
        <p className="empty-state">Nothing with an expiry date recorded yet.</p>
      ) : (
        <>
          {overdue.length > 0 && (
            <div className="calendar-month overdue">
              <h4>Passed in the last month</h4>
              <EventList events={overdue} />
            </div>
          )}
          {[...byMonth.entries()].map(([key, list]) => (
            <div key={key} className="calendar-month">
              <h4>{monthLabel(key)}</h4>
              <EventList events={list} />
            </div>
          ))}
          {upcoming.length === 0 && overdue.length === 0 && <p className="empty-state">Nothing due in the next 12 months.</p>}
          {!showAll && later > 0 && (
            <button className="link-button" onClick={() => setShowAll(true)}>
              Show {later} more after the next 12 months
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EventList({ events }: { events: CalendarEvent[] }) {
  return (
    <ul className="calendar-events">
      {events.map((e) => (
        <li key={e.id}>
          <span className="calendar-day">{dayLabel(e.date)}</span>
          <span className="calendar-tag" style={{ borderLeftColor: CATEGORY_COLOUR[e.category] }}>
            {CATEGORY_LABEL[e.category]}
          </span>
          <span className="calendar-title">
            <Link to={e.route}>{e.title}</Link>
            {e.detail && <span className="calendar-detail"> · {e.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
