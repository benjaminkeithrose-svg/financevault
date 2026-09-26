import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Document, PaygView, Person } from "../api/client.js";
import { confirmThenDelete, financialYearLabelForToday, formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";
import { WhyClaimed } from "./WhyClaimed.js";

/**
 * An employee's job, work-related deductions and income statement (IDEAS.md
 * idea 10) — on their page. The deduction checklist follows the ATO's
 * work-related deductions pages; every claim can carry its record and a
 * "why is this claimed?" note.
 */

const OCCUPATION_GUIDES =
  "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/guides-for-occupations-and-industries/occupation-and-industry-specific-guides";
const EMPLOYMENT_TYPES: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
  SELF_EMPLOYED: "Self-employed",
};
const BENEFITS: Record<string, string> = {
  NOVATED_LEASE: "Novated lease",
  COMPANY_CAR: "Company car",
  FUEL_CARD: "Fuel card",
  PHONE: "Phone",
  LAPTOP: "Laptop",
  SALARY_SACRIFICE_SUPER: "Salary sacrifice to super",
  OTHER: "Other packaging",
};

export function PaygPanel({ person, onChange }: { person: Person; onChange: () => void }) {
  return (
    <>
      <EmploymentCard person={person} onChange={onChange} />
      <WorkDeductionsCard person={person} />
    </>
  );
}

function EmploymentCard({ person, onChange }: { person: Person; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const blank = () => ({
    occupation: person.occupation ?? "",
    employer: person.employer ?? "",
    employmentType: person.employmentType ?? "",
    carAllowance: person.carAllowance != null ? String(person.carAllowance) : "",
    benefits: new Set((person.benefits ?? "").split(",").filter(Boolean)),
  });
  const [form, setForm] = useState(blank);
  useEffect(() => setForm(blank()), [person]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await api.people.update(person.id, {
      occupation: form.occupation || null,
      employer: form.employer || null,
      employmentType: form.employmentType || null,
      carAllowance: form.carAllowance === "" ? null : Number(form.carAllowance),
      benefits: [...form.benefits].join(",") || null,
    });
    setEditing(false);
    onChange();
  }

  const benefits = (person.benefits ?? "").split(",").filter(Boolean);
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Job and work benefits <HelpLink topic="work-deductions" />
        </h3>
        {!editing && (
          <button className="btn secondary" onClick={() => setEditing(true)}>
            {person.occupation || person.employer ? "Change" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Occupation</label>
              <input placeholder="e.g. Teacher, Sales" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
            </div>
            <div>
              <label>Employer</label>
              <input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
            </div>
            <div>
              <label>Employment</label>
              <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                <option value="">—</option>
                {Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Car allowance a year</label>
              <input type="number" value={form.carAllowance} onChange={(e) => setForm({ ...form, carAllowance: e.target.value })} />
            </div>
          </div>
          <label>Benefits and salary packaging</label>
          <div className="chip-row">
            {Object.entries(BENEFITS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                className={`chip ${form.benefits.has(k) ? "selected" : ""}`}
                onClick={() => {
                  const next = new Set(form.benefits);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  setForm({ ...form, benefits: next });
                }}
              >
                {v}
              </button>
            ))}
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
      ) : person.occupation || person.employer ? (
        <>
          <p style={{ margin: "8px 0 0" }}>
            {[person.occupation, person.employer, person.employmentType ? EMPLOYMENT_TYPES[person.employmentType] : null].filter(Boolean).join(" · ")}
          </p>
          {person.carAllowance ? <p className="cap-explain">Car allowance {formatCurrency(person.carAllowance)} a year.</p> : null}
          {benefits.length > 0 && <p className="cap-explain">Benefits: {benefits.map((b) => BENEFITS[b] ?? b).join(", ")}</p>}
        </>
      ) : (
        <p className="cap-explain">Not recorded. It sets up the work deduction checklist below and the car comparison.</p>
      )}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <Link className="btn secondary" to={`/people/${person.id}/car`}>
          Compare car options
        </Link>
        <a className="link-button" href={OCCUPATION_GUIDES} target="_blank" rel="noreferrer">
          The ATO's guide for {person.occupation || "each occupation"}
        </a>
      </div>
    </div>
  );
}

const emptyClaim = { category: "OTHER", description: "", amount: "", method: "", quantity: "", documentId: "" };

function WorkDeductionsCard({ person }: { person: Person }) {
  const [fy, setFy] = useState(financialYearLabelForToday());
  const [view, setView] = useState<PaygView | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyClaim);
  const [addingStatement, setAddingStatement] = useState(false);
  const [statement, setStatement] = useState({ grossPayments: "", taxWithheld: "", allowances: "", reportableFringeBenefits: "", reportableSuper: "", documentId: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.payg.get(person.id, fy).then(setView);
  // Reloads when the job details change too (a new car allowance changes the checks).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, fy]);
  useEffect(() => {
    api.documents.list().then(setDocuments);
  }, []);
  if (!view) return null;

  // The fixed-rate methods work the amount out from kilometres or hours.
  const worked = (): number | null => {
    const q = Number(form.quantity);
    if (form.category === "CAR" && form.method === "CENTS_PER_KM" && form.quantity) return Math.min(q, view.rates.carKmCap) * view.rates.carCentsPerKm;
    if (form.category === "WORK_FROM_HOME" && form.method === "FIXED_RATE" && form.quantity) return q * view.rates.wfhPerHour;
    return null;
  };

  async function addClaim() {
    setError(null);
    const amount = worked() ?? Number(form.amount);
    if (!form.description.trim() || !(amount >= 0) || (form.amount === "" && worked() === null)) {
      setError("Enter what it was and the amount (or the kilometres or hours).");
      return;
    }
    try {
      await api.payg.addDeduction(person.id, {
        fyLabel: fy,
        category: form.category,
        description: form.description.trim(),
        amount: Math.round(amount * 100) / 100,
        method: form.method || null,
        quantity: form.quantity === "" ? null : Number(form.quantity),
        documentId: form.documentId || null,
      });
      setForm(emptyClaim);
      setAdding(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStatement() {
    setError(null);
    if (statement.grossPayments === "") {
      setError("Enter the gross payments from the income statement.");
      return;
    }
    const n = (v: string) => (v === "" ? null : Number(v));
    await api.payg.addStatement(person.id, {
      fyLabel: fy,
      employer: person.employer ?? null,
      grossPayments: Number(statement.grossPayments),
      taxWithheld: n(statement.taxWithheld),
      allowances: n(statement.allowances),
      reportableFringeBenefits: n(statement.reportableFringeBenefits),
      reportableSuper: n(statement.reportableSuper),
      documentId: statement.documentId || null,
    });
    setAddingStatement(false);
    load();
  }

  const years = [0, 1, 2].map((k) => {
    const start = Number(financialYearLabelForToday().slice(0, 4)) - k;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  });
  const statementThisYear = view.incomeStatements.find((s) => s.fyLabel === fy);
  const docOptions = (
    <>
      <option value="">— None —</option>
      {documents.map((d) => (
        <option key={d.id} value={d.id}>
          {d.originalFilename}
        </option>
      ))}
    </>
  );

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>
          Work-related deductions <HelpLink topic="work-deductions" />
        </h3>
        <select value={fy} onChange={(e) => setFy(e.target.value)} style={{ maxWidth: 140 }} aria-label="Financial year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <p style={{ margin: "8px 0" }}>
        <strong>{formatCurrency(view.total)}</strong> claimed for {fy}
        {view.estimatedTaxSaved !== null && view.total > 0 ? ` — about ${formatCurrency(view.estimatedTaxSaved)} less tax` : ""}.
      </p>
      {view.checks.map((c) => (
        <div key={c} className="message-box warning" style={{ marginBottom: 6 }}>
          {c}
        </div>
      ))}

      {view.deductions.length > 0 && (
        <ul className="plain-list">
          {view.deductions.map((d) => (
            <li key={d.id} className="loan-purpose-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{formatCurrency(d.amount)}</strong> · {d.description}
                <div className="cap-explain">
                  {view.categories.find((c) => c.key === d.category)?.label}
                  {d.quantity ? ` · ${d.quantity.toLocaleString("en-AU")} ${d.category === "CAR" ? "km" : "hours"}` : ""}
                  {d.document ? (
                    <>
                      {" "}
                      · <Link to={`/documents/${d.document.id}`}>{d.document.originalFilename}</Link>
                    </>
                  ) : (
                    " · no record attached"
                  )}
                </div>
              </div>
              <WhyClaimed targetType="WORK_DEDUCTION" targetId={d.id} hasReason={view.reasonsFor.includes(d.id)} onChange={load} />
              <button
                className="icon-btn danger"
                aria-label={`Delete ${d.description}`}
                onClick={() =>
                  confirmThenDelete(`Delete "${d.description}"?`, () => api.payg.removeDeduction(d.id)).then((done) => {
                    if (done) load();
                  })
                }
              >
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Kind of claim</label>
              <select value={form.category} onChange={(e) => setForm({ ...emptyClaim, category: e.target.value, description: form.description })}>
                {view.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>What it was</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {form.category === "CAR" && (
              <div>
                <label>Method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="">Choose…</option>
                  <option value="CENTS_PER_KM">Cents per km ({Math.round(view.rates.carCentsPerKm * 100)}c, up to 5,000 km)</option>
                  <option value="LOGBOOK">Logbook</option>
                </select>
              </div>
            )}
            {form.category === "WORK_FROM_HOME" && (
              <div>
                <label>Method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="">Choose…</option>
                  <option value="FIXED_RATE">Fixed rate ({Math.round(view.rates.wfhPerHour * 100)}c an hour)</option>
                  <option value="ACTUAL_COST">Actual costs</option>
                </select>
              </div>
            )}
            {(form.method === "CENTS_PER_KM" || form.method === "FIXED_RATE") && (
              <div>
                <label>{form.method === "CENTS_PER_KM" ? "Work kilometres" : "Hours worked from home"}</label>
                <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            )}
            {worked() === null ? (
              <div>
                <label>Amount</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            ) : (
              <div>
                <label>Claim</label>
                <p style={{ margin: "10px 0" }}>
                  <strong>{formatCurrency(worked())}</strong>
                </p>
              </div>
            )}
          </div>
          <label>Receipt or record</label>
          <select value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })}>
            {docOptions}
          </select>
          <p className="cap-explain">{view.categories.find((c) => c.key === form.category)?.canClaim}</p>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={addClaim}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={() => setAdding(true)}>
            Add a claim
          </button>
        </div>
      )}

      <details className="profit-details" style={{ marginTop: 12 }}>
        <summary>What can be claimed — checklist for {fy}</summary>
        <p className="cap-explain">
          Every claim must be: money you spent and weren't paid back for; directly for earning your income; and backed by a record.
        </p>
        <ul className="plain-list">
          {view.categories.map((c) => (
            <li key={c.key} style={{ padding: "6px 0" }}>
              <strong>{c.claimed ? "✓ " : ""}{c.label}</strong>
              <div className="cap-explain">{c.canClaim}</div>
              <div className="cap-explain">Records: {c.records}</div>
            </li>
          ))}
        </ul>
      </details>

      <h3>Income statement {fy}</h3>
      {statementThisYear ? (
        <div className="loan-purpose-row">
          <div style={{ flex: 1 }}>
            {formatCurrency(statementThisYear.grossPayments)} gross
            {statementThisYear.taxWithheld ? ` · ${formatCurrency(statementThisYear.taxWithheld)} tax withheld` : ""}
            {statementThisYear.allowances ? ` · ${formatCurrency(statementThisYear.allowances)} allowances` : ""}
            {statementThisYear.reportableFringeBenefits ? ` · ${formatCurrency(statementThisYear.reportableFringeBenefits)} reportable fringe benefits` : ""}
            {statementThisYear.reportableSuper ? ` · ${formatCurrency(statementThisYear.reportableSuper)} reportable super` : ""}
          </div>
          <button
            className="icon-btn danger"
            aria-label="Delete this income statement"
            onClick={() =>
              confirmThenDelete(`Delete the ${fy} income statement figures?`, () => api.payg.removeStatement(statementThisYear.id)).then((d) => {
                if (d) load();
              })
            }
          >
            <IconBin />
          </button>
        </div>
      ) : addingStatement ? (
        <div className="sub-form">
          <p className="cap-explain">From the income statement in myGov (or the PAYG payment summary for older years).</p>
          <div className="grid grid-2">
            {(
              [
                ["grossPayments", "Gross payments"],
                ["taxWithheld", "Tax withheld"],
                ["allowances", "Allowances (e.g. car)"],
                ["reportableFringeBenefits", "Reportable fringe benefits"],
                ["reportableSuper", "Reportable employer super"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label>{label}</label>
                <input type="number" value={statement[k]} onChange={(e) => setStatement({ ...statement, [k]: e.target.value })} />
              </div>
            ))}
            <div>
              <label>The statement</label>
              <select value={statement.documentId} onChange={(e) => setStatement({ ...statement, documentId: e.target.value })}>
                {docOptions}
              </select>
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={addStatement}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setAddingStatement(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar">
          <button className="btn secondary" onClick={() => setAddingStatement(true)}>
            Add the income statement figures
          </button>
        </div>
      )}
    </div>
  );
}
