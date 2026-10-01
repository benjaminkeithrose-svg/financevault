import { useEffect, useState } from "react";
import { api, Person } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * A person's income a year, before tax — used for the after-tax property
 * figures and the borrowing estimate. Variable income (bonus, overtime,
 * commission) is kept separate because lenders count only part of it.
 */
export function IncomeCard({ person, onChange }: { person: Person; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ grossSalary: "", variableIncome: "" });
  useEffect(() => {
    setForm({ grossSalary: str(person.grossSalary), variableIncome: str(person.variableIncome) });
  }, [person]);

  async function save() {
    await api.people.update(person.id, {
      grossSalary: form.grossSalary === "" ? null : Number(form.grossSalary),
      variableIncome: form.variableIncome === "" ? null : Number(form.variableIncome),
    });
    setEditing(false);
    onChange();
  }

  const recorded = person.grossSalary != null || person.variableIncome != null;
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Income <HelpLink topic="property-profit" />
        </h3>
        {!editing && (
          <button className="btn secondary" onClick={() => setEditing(true)}>
            {recorded ? "Change" : "Add income"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Salary a year, before tax</label>
              <input type="number" value={form.grossSalary} onChange={(e) => setForm({ ...form, grossSalary: e.target.value })} />
            </div>
            <div>
              <label>Bonus, overtime, commission a year</label>
              <input type="number" value={form.variableIncome} onChange={(e) => setForm({ ...form, variableIncome: e.target.value })} />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : recorded ? (
        <p style={{ margin: "8px 0 0" }}>
          {formatCurrency(person.grossSalary ?? 0)} salary
          {person.variableIncome ? ` + ${formatCurrency(person.variableIncome)} bonus, overtime or commission` : ""} a year, before tax.
        </p>
      ) : (
        <p className="cap-explain">Not recorded. It's used to work out the tax on rental profits and how much you could borrow.</p>
      )}
    </div>
  );
}

const str = (v?: number | null) => (v === null || v === undefined ? "" : String(v));
