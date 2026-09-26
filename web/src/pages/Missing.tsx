import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Expectation, ExpectationGroup, ExpectedResult } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";

/**
 * "What's missing" (IDEAS.md idea 13): the insurance and paperwork that's
 * normal for what's recorded, and which of it isn't here yet — grouped by
 * property, vehicle, person and trust. Items tick themselves off as policies
 * are added and documents linked. Printable to take to the broker or
 * accountant.
 */

const LEVEL = {
  RED: { label: "Required", explain: "Required by law or by a lender, or effectively essential." },
  AMBER: { label: "Worth checking", explain: "Normal for people in your position." },
};

const REASONS = ["Covered by another policy", "Held in super", "Not needed", "The tenant pays it", "Not received yet"];

/** Where to go to add it: the insurance card (opened on that kind) or the documents card. */
export function addLink(group: ExpectationGroup, item: Expectation): string {
  if (item.kind === "INSURANCE") {
    return item.addAs === "PRIVATE_HEALTH" ? group.route : `${group.route}?addPolicy=${item.addAs}`;
  }
  return group.route;
}

export function Missing() {
  const [fy, setFy] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ExpectedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMet, setShowMet] = useState(false);
  const [asideFor, setAsideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function load() {
    api.expected
      .get({ fy })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, [fy]);

  async function setAside(key: string) {
    if (!reason.trim()) return;
    await api.expected.setAside(key, reason.trim());
    setAsideFor(null);
    setReason("");
    load();
  }

  async function restore(key: string) {
    await api.expected.restore(key);
    load();
  }

  if (!data) return <div className="empty-state">{error ?? "Loading…"}</div>;
  const open = (i: Expectation) => !i.met && !i.dismissed;
  const groups = data.groups
    .map((g) => ({ ...g, items: showMet ? g.items : g.items.filter(open) }))
    .filter((g) => g.items.length > 0);
  const total = data.counts.red + data.counts.amber;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            What's missing <HelpLink topic="whats-missing" />
          </h2>
          <p>Insurance and paperwork that's normal for what you've recorded, and what isn't here yet.</p>
        </div>
        <button className="btn secondary no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {total === 0
            ? "Nothing missing"
            : `${total} thing${total === 1 ? "" : "s"} missing${data.counts.red ? ` — ${data.counts.red} required` : ""}`}
        </h3>
        <p className="cap-explain">
          {data.counts.met} in place{data.counts.setAside ? ` · ${data.counts.setAside} set aside as not needed` : ""}. Yearly paperwork
          is for the {data.fyLabel} financial year.
        </p>
        <div className="toolbar no-print" style={{ flexWrap: "wrap" }}>
          <label className="checkbox-row" style={{ margin: 0 }}>
            Paperwork for
            <select value={data.fyLabel} onChange={(e) => setFy(e.target.value)} style={{ width: "auto", marginLeft: 8 }}>
              {data.fyOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showMet} onChange={(e) => setShowMet(e.target.checked)} /> Show what's already in place
          </label>
        </div>
      </div>

      {groups.length === 0 && data.groups.length === 0 && (
        <div className="card">
          <p className="empty-state">
            Nothing to check yet. Add properties, vehicles, people with their income, and trusts — this list works out what's normal
            for each.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.target} className="card missing-group">
          <h3 style={{ marginTop: 0 }}>
            <Link to={g.route}>{g.name}</Link>
          </h3>
          <ul className="missing-list">
            {g.items.map((i) => (
              <li key={i.key} className={i.met ? "met" : i.dismissed ? "aside" : i.level === "RED" ? "required" : "worth"}>
                <span className="missing-mark" aria-hidden="true">
                  {i.met ? "✓" : i.dismissed ? "–" : i.level === "RED" ? "!" : "?"}
                </span>
                <div className="missing-body">
                  <div>
                    <strong>{i.label}</strong>
                    {i.fyLabel && <span className="cap-explain" style={{ display: "inline" }}> · {i.fyLabel}</span>}
                    {!i.met && !i.dismissed && <span className={`missing-level ${i.level === "RED" ? "required" : "worth"}`}>{LEVEL[i.level].label}</span>}
                  </div>
                  {i.met && i.metBy ? (
                    <div className="cap-explain">
                      In place: <Link to={i.metBy.route}>{i.metBy.label}</Link>
                    </div>
                  ) : i.dismissed ? (
                    <div className="cap-explain">Set aside: {i.dismissed.reason}</div>
                  ) : (
                    <div className="cap-explain">{i.why}</div>
                  )}
                  {asideFor === i.key && (
                    <div className="sub-form no-print">
                      <label>Why isn't it needed?</label>
                      <div className="chip-row">
                        {REASONS.map((r) => (
                          <button key={r} className={`chip ${reason === r ? "selected" : ""}`} onClick={() => setReason(r)}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or say why in your own words" />
                      <div className="toolbar" style={{ marginTop: 8 }}>
                        <button className="btn" disabled={!reason.trim()} onClick={() => setAside(i.key)}>
                          Set aside
                        </button>
                        <button className="btn secondary" onClick={() => setAsideFor(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="missing-actions no-print">
                  {!i.met && !i.dismissed && asideFor !== i.key && (
                    <>
                      <Link className="btn secondary" to={addLink(g, i)}>
                        {i.kind === "INSURANCE" ? "Add policy" : "Add document"}
                      </Link>
                      <button
                        className="link-button"
                        onClick={() => {
                          setAsideFor(i.key);
                          setReason("");
                        }}
                      >
                        Not needed
                      </button>
                    </>
                  )}
                  {i.dismissed && (
                    <button className="link-button" onClick={() => restore(i.key)}>
                      Flag it again
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="cap-explain">
        Documents count when they're filed as the right type and linked to the property, person or trust (on its page, under
        Documents), and — for yearly ones — dated in or filed to the financial year. General guidance only: your broker and
        accountant know your situation.
      </p>
    </div>
  );
}
