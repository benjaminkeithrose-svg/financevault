import { useEffect, useRef, useState } from "react";
import { api, StructureOption } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

/**
 * "Who should own the next property?" — the same purchase under each kind of
 * owner, using the family's own incomes and the NSW land they already hold.
 * Modelling to take to the accountant before buying: moving a property later
 * usually costs stamp duty and capital gains tax.
 */

type Person = { id: string; name: string; income: number; incomeRecorded: boolean; existingNswLand: number };

export function StructureComparison() {
  const [people, setPeople] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<string[]>([]);
  const [form, setForm] = useState({
    price: "800000",
    rent: "36400",
    runningCosts: "6000",
    loanAmount: "640000",
    ratePct: "6",
    landValue: "450000",
    depreciation: "5000",
    growthPct: "5",
    yearsHeld: "10",
  });
  const [residential, setResidential] = useState(true);
  const [nsw, setNsw] = useState(true);
  const [options, setOptions] = useState<StructureOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.advice.structurePeople().then((r) => {
      setPeople(r.people);
      const earners = r.people.filter((p) => p.incomeRecorded).map((p) => p.id);
      setChosen(earners.slice(0, 2));
      setBeneficiaries(earners);
    });
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const n = (v: string) => Number(v || 0);
      api.advice
        .compareStructures({
          price: n(form.price),
          rent: n(form.rent),
          runningCosts: n(form.runningCosts),
          loanAmount: n(form.loanAmount),
          ratePct: n(form.ratePct),
          landValue: n(form.landValue),
          depreciation: n(form.depreciation),
          growthPct: n(form.growthPct),
          yearsHeld: Math.max(1, Math.round(n(form.yearsHeld))),
          residential,
          nsw,
          personIds: chosen,
          beneficiaryIds: beneficiaries,
        })
        .then((r) => {
          setOptions(r.options);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 300);
  }, [form, residential, nsw, chosen, beneficiaries]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const field = (key: keyof typeof form, label: string) => (
    <div>
      <label>{label}</label>
      <input type="number" step="any" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );
  const usable = (options ?? []).filter((o) => o.available);
  const best = usable.length ? usable.reduce((a, b) => (b.overallAfterTax > a.overallAfterTax ? b : a)) : null;
  const years = Math.max(1, Math.round(Number(form.yearsHeld || 1)));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Who should own the next property? <HelpLink topic="structure-comparison" />
          </h2>
          <p>The same purchase under each kind of owner. Modelling to take to your accountant before buying — not a decision.</p>
        </div>
      </div>

      {options && (
        <div className="card">
          {best && (
            <h3 style={{ marginTop: 0 }}>
              Best on these numbers over {years} years: {best.label}
            </h3>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  {options.map((o) => (
                    <th key={o.key}>{o.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Land tax a year</td>
                  {options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.landTax)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Tax result a year</td>
                  {options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.taxResult)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Tax a year</td>
                  {options.map((o) => (
                    <td key={o.key}>{o.yearlyTax < 0 ? `${formatCurrency(-o.yearlyTax)} saved` : formatCurrency(o.yearlyTax)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Cash after tax a year</td>
                  {options.map((o) => (
                    <td key={o.key}>{formatCurrency(o.yearlyCashAfterTax)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Tax on selling after {years} years</td>
                  {options.map((o) => (
                    <td key={o.key}>
                      {formatCurrency(o.saleTax)}
                      <div className="cap-explain">on a {formatCurrency(o.saleGain)} gain</div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>
                    <strong>Overall after tax</strong>
                  </td>
                  {options.map((o) => (
                    <td key={o.key}>
                      <strong>{o.available ? formatCurrency(o.overallAfterTax) : "Not available"}</strong>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {options.map((o) => (
            <details key={o.key} className="profit-details">
              <summary>{o.label}: the trade-offs</summary>
              <ul>
                {o.good.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p className="cap-explain">
                <strong>Watch:</strong>
              </p>
              <ul>
                {o.watch.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="cap-explain">Sources: {o.sources.join("; ")}</p>
            </details>
          ))}
          <p className="cap-explain">
            Rent, costs and interest are kept at year-one levels; the gain is value growth only (buying and selling costs aren't counted).
            A company is taxed at 30% and gets no CGT discount; an SMSF is shown in accumulation. Your accountant models the real
            thing.
          </p>
        </div>
      )}
      {error && <div className="message-box warning">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>The purchase</h3>
        <div className="grid grid-2">
          {field("price", "Price")}
          {field("rent", "Rent a year")}
          {field("runningCosts", "Running costs a year (not land tax)")}
          {field("loanAmount", "Loan")}
          {field("ratePct", "Interest rate %")}
          {field("landValue", "Land value")}
          {field("depreciation", "Depreciation and building write-off a year")}
          {field("growthPct", "Value growth % a year")}
          {field("yearsHeld", "Years before selling")}
        </div>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={residential} onChange={(e) => setResidential(e.target.checked)} /> Residential
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={nsw} onChange={(e) => setNsw(e.target.checked)} /> In NSW
          </label>
        </div>
        <label>Compare owning it as</label>
        <div className="chip-row">
          {people.map((p) => (
            <button key={p.id} className={`chip ${chosen.includes(p.id) ? "selected" : ""}`} onClick={() => toggle(chosen, setChosen, p.id)}>
              {p.name}
              {!p.incomeRecorded ? " (no income recorded)" : ""}
            </button>
          ))}
        </div>
        <p className="cap-explain">Each ticked person on their own, and the first two together.</p>
        <label>A family trust would distribute to</label>
        <div className="chip-row">
          {people.map((p) => (
            <button key={p.id} className={`chip ${beneficiaries.includes(p.id) ? "selected" : ""}`} onClick={() => toggle(beneficiaries, setBeneficiaries, p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
