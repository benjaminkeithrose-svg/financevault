import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Person, PlanBorrowingCheck } from "../api/client.js";
import { formatCurrency } from "../utils.js";

export const BORROWING_STATUS: Record<string, { label: string; cls: string }> = {
  FINE: { label: "Fine", cls: "status-CONFIRMED" },
  SOME_LENDERS: { label: "Some lenders only", cls: "status-PENDING" },
  TOO_MUCH: { label: "Likely too much", cls: "status-MISSING" },
};

/**
 * "Can you borrow it?" — each year the plan borrows, against roughly what a
 * lender might lend then (careful to generous), and whose income backs it.
 */
export function PlanBorrowingCard({ planId, check, onChange }: { planId: string; check: PlanBorrowingCheck; onChange: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    api.people.list().then(setPeople).catch(() => setPeople([]));
  }, []);

  function start() {
    setPicked(check.people.map((p) => p.id));
    setEditing(true);
  }

  async function save(ids: string[]) {
    await api.portfolioPlans.update(planId, { borrowerIds: ids });
    setEditing(false);
    onChange();
  }

  const borrowingYears = check.years.filter((y) => y.newBorrowing > 0);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Can you borrow it?</h3>
      <p className="cap-explain" style={{ marginTop: 0 }}>
        Each year the plan borrows, against roughly what a lender might lend you then — worked out the way the{" "}
        <Link to="/borrowing">How much could I borrow?</Link> page does, counting the rent and loans of the plan's properties bought by
        then. An estimate: the lender decides.
      </p>
      <p style={{ margin: "0 0 8px" }}>
        Backed by the income of <strong>{check.people.length ? check.people.map((p) => p.name).join(", ") : "no one yet"}</strong>
        {check.chosen ? "" : " (everyone with a salary recorded)"}.{" "}
        {!editing && (
          <button className="link-button" onClick={start}>
            Change who
          </button>
        )}
      </p>
      {editing && (
        <div className="sub-form">
          {people.map((p) => (
            <label key={p.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={picked.includes(p.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
              />
              {p.name}
              {p.grossSalary ? ` — ${formatCurrency(p.grossSalary)} a year` : " — no salary recorded"}
            </label>
          ))}
          <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => save(picked)}>
              Save
            </button>
            <button className="btn secondary" onClick={() => save([])}>
              Everyone with a salary
            </button>
            <button className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {borrowingYears.length === 0 ? (
        <p className="empty-state">The plan doesn't borrow anything yet.</p>
      ) : (
        <ul className="item-card-list">
          {borrowingYears.map((y) => {
            const s = y.status ? BORROWING_STATUS[y.status] : null;
            return (
              <li key={y.yearNumber} className="item-card" style={{ cursor: "default" }}>
                <div className="item-card-body">
                  <div className="item-card-title" style={{ whiteSpace: "normal" }}>
                    Year {y.yearNumber}: borrowing {formatCurrency(y.newBorrowing)}
                  </div>
                  <div className="item-card-subtitle" style={{ whiteSpace: "normal" }}>
                    {y.parts.join(" · ")}. A lender might lend {formatCurrency(y.capacity[0])} to {formatCurrency(y.capacity[1])}. {y.reason}
                  </div>
                </div>
                {s && <span className={`badge ${s.cls}`}>{s.label}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {check.notes.map((n) => (
        <p key={n} className="cap-explain">
          {n}
        </p>
      ))}
    </div>
  );
}
