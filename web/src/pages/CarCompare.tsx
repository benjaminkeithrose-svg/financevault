import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, CarOption, Person } from "../api/client.js";
import { financialYearLabelForToday, formatCurrency } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";
import { useBackTo } from "../hooks/useBackTo.js";

/**
 * Car allowance vs novated lease vs an electric car on a novated lease, for
 * one person's own numbers: what the car really costs them a year after tax,
 * and how much each lowers the salary a lender sees.
 */
export function CarCompare() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [form, setForm] = useState({
    leasePayments: "12000",
    runningCosts: "6000",
    carPrice: "50000",
    workKm: "3000",
    allowance: "",
    electricLeasePayments: "",
    electricRunningCosts: "",
    electricCarPrice: "",
  });
  const [result, setResult] = useState<{ baseIncome: number; incomeRecorded: boolean; options: CarOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useBackTo(id ? `/people/${id}` : null);

  useEffect(() => {
    if (!id) return;
    api.people.get(id).then((p) => {
      setPerson(p);
      if (p.carAllowance) setForm((f) => ({ ...f, allowance: String(p.carAllowance) }));
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (timer.current) window.clearTimeout(timer.current);
    const n = (v: string) => (v === "" ? 0 : Number(v));
    const opt = (v: string) => (v === "" ? null : Number(v));
    timer.current = window.setTimeout(() => {
      api.payg
        .carCompare({
          personId: id,
          fy: financialYearLabelForToday(),
          leasePayments: n(form.leasePayments),
          runningCosts: n(form.runningCosts),
          carPrice: n(form.carPrice),
          workKm: n(form.workKm),
          allowance: n(form.allowance),
          electricLeasePayments: opt(form.electricLeasePayments),
          electricRunningCosts: opt(form.electricRunningCosts),
          electricCarPrice: opt(form.electricCarPrice),
        })
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 300);
  }, [id, form]);

  if (!person) return <div className="empty-state">Loading…</div>;
  const best = result ? [...result.options].sort((a, b) => a.netCost - b.netCost)[0] : null;
  const field = (key: keyof typeof form, label: string, placeholder?: string) => (
    <div>
      <label>{label}</label>
      <input type="number" placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Car options for {person.name} <HelpLink topic="work-deductions" />
          </h2>
          <p>What the car costs a year after tax, each way. An estimate — the employer's packaging provider has the exact figures.</p>
        </div>
      </div>

      {result && best && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cheapest after tax: {best.label}</h3>
          {!result.incomeRecorded && (
            <div className="message-box warning">
              No income recorded for {person.name}, so tax is worked out on nothing. Add it on <Link to={`/people/${person.id}`}>their page</Link>.
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  {result.options.map((o) => (
                    <th key={o.key}>{o.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Car costs a year</td>
                  {result.options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.totalCosts)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Paid from pre-tax salary</td>
                  {result.options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.preTax)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Change in your tax</td>
                  {result.options.map((o) => (
                    <td key={o.key}>{o.taxChange < 0 ? `${formatCurrency(-o.taxChange)} less` : `${formatCurrency(o.taxChange)} more`}</td>
                  ))}
                </tr>
                <tr>
                  <td>
                    <strong>What the car costs you after tax</strong>
                  </td>
                  {result.options.map((o) => (
                    <td key={o.key}>
                      <strong>{formatCurrency(o.netCost)}</strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Payslip salary lower by (what a lender sees)</td>
                  {result.options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.salaryReduction)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {result.options.map((o) => (
            <details key={o.key} className="profit-details">
              <summary>{o.label}: how it's worked out</summary>
              <ul>
                {o.workings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {o.notes.map((n) => (
                <p key={n} className="cap-explain">
                  {n}
                </p>
              ))}
            </details>
          ))}
          <p className="cap-explain">
            Planning a loan? A novated lease lowers the salary on your payslip and counts as a commitment — some lenders add part of it
            back, others don't. Worth timing around a loan application; ask your broker.
          </p>
        </div>
      )}
      {error && <div className="message-box warning">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your numbers</h3>
        <div className="grid grid-2">
          {field("leasePayments", "Lease or finance payments a year")}
          {field("runningCosts", "Running costs a year (fuel, rego, insurance, servicing, tyres)")}
          {field("carPrice", "Car price including GST")}
          {field("workKm", "Work kilometres a year (not home to work)")}
          {field("allowance", "Car allowance offered a year")}
        </div>
        <h4>Electric car (if different)</h4>
        <div className="grid grid-2">
          {field("electricLeasePayments", "Lease payments a year", "same as above")}
          {field("electricRunningCosts", "Running costs a year (charging instead of fuel)", "same as above")}
          {field("electricCarPrice", "Car price including GST", "same as above")}
        </div>
      </div>
    </div>
  );
}
