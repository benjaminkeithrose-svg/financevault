import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, BorrowingAssumptions, BorrowingEstimate } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

/**
 * "How much could I borrow?" — a range, not a promise: roughly what most
 * lenders would lend on your recorded income, debts and properties, with
 * every assumption visible and changeable. The lender's calculator decides.
 */

type Pair = [number, number];

export function Borrowing() {
  const [people, setPeople] = useState<Array<{ id: string; name: string; grossSalary: number | null; variableIncome: number | null }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<BorrowingAssumptions | null>(null);
  const [defaults, setDefaults] = useState<BorrowingAssumptions | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<BorrowingEstimate | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.borrowing.get().then((v) => {
      setPeople(v.people);
      setSelected(v.people.filter((p) => p.grossSalary || p.variableIncome).map((p) => p.id));
      setAssumptions(v.assumptions);
      setDefaults(v.defaults);
      setHint(v.spendingHintMonthly);
    });
  }, []);

  // Recalculate shortly after anything changes.
  useEffect(() => {
    if (!assumptions) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.borrowing
        .estimate(selected, assumptions)
        .then((e) => {
          setEstimate(e);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 300);
  }, [selected, assumptions]);

  if (!assumptions || !defaults) return <div className="empty-state">Loading…</div>;
  const set = (patch: Partial<BorrowingAssumptions>) => {
    setSaved(false);
    setAssumptions({ ...assumptions, ...patch });
  };
  const r = estimate?.residential;
  const [low, high] = r ? r.scenarios : [null, null];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            How much could I borrow? <HelpLink topic="borrowing-capacity" />
          </h2>
          <p>An estimate from your records, with every assumption shown. The broker's lender calculators have the final say.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>A new home or investment loan</h3>
        {low && high ? (
          <>
            <p style={{ fontSize: 26, margin: "4px 0" }}>
              <strong>
                {formatCurrency(Math.max(0, low.maxNewLoan))} – {formatCurrency(Math.max(0, high.maxNewLoan))}
              </strong>
            </p>
            <p className="cap-explain">
              Assessed at {low.assessmentRate.toFixed(2)}% ({assumptions.newLoanRate}% plus the {assumptions.buffer}% buffer) over{" "}
              {assumptions.newLoanTermYears} years. Conservative to generous lender assumptions.
            </p>
            {r!.dtiWarning && <div className="message-box warning">{r!.dtiWarning}</div>}
            {r!.notes.map((n) => (
              <p key={n} className="cap-explain">
                {n}
              </p>
            ))}
          </>
        ) : (
          <p className="empty-state">{error ?? "Working it out…"}</p>
        )}

        <label>Who's borrowing</label>
        <div className="chip-row">
          {people.map((p) => (
            <button
              key={p.id}
              className={`chip ${selected.includes(p.id) ? "selected" : ""}`}
              onClick={() => setSelected(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
            >
              {p.name}
              {!p.grossSalary && !p.variableIncome ? " (no income recorded)" : ""}
            </button>
          ))}
        </div>
        <div className="grid grid-2">
          <div>
            <label>Your living expenses a month</label>
            <input
              type="number"
              value={assumptions.declaredExpenses ?? ""}
              onChange={(e) => set({ declaredExpenses: e.target.value === "" ? null : Number(e.target.value) })}
            />
            {hint !== null && hint > 0 && (
              <p className="cap-explain">
                Your accounts show about {formatCurrency(hint)} a month going out (that includes loan repayments, so it's higher
                than living expenses).
              </p>
            )}
          </div>
          <div>
            <label>Lender's benchmark a month (if the broker gives you one)</label>
            <input
              type="number"
              value={assumptions.benchmarkExpenses ?? ""}
              onChange={(e) => set({ benchmarkExpenses: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <p className="cap-explain">Lenders use whichever is higher.</p>
          </div>
        </div>
      </div>

      {low && high && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>How it's worked out</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Conservative</th>
                  <th>Generous</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Income counted a year (after shading)" a={low.countedIncome} b={high.countedIncome} />
                <Row label="Less tax and Medicare" a={-low.tax} b={-high.tax} />
                <Row label="Take-home a month" a={low.netIncomeMonthly} b={high.netIncomeMonthly} />
                <Row label="Less living expenses a month" a={-low.expensesMonthly} b={-high.expensesMonthly} />
                <Row label="Less existing loans and cards a month" a={-low.commitmentsMonthly} b={-high.commitmentsMonthly} />
                <Row label="Left over a month" a={low.surplusMonthly} b={high.surplusMonthly} strong />
                <Row label="A new loan that carries" a={Math.max(0, low.maxNewLoan)} b={Math.max(0, high.maxNewLoan)} strong />
              </tbody>
            </table>
          </div>
          {low.commitments.length > 0 && (
            <>
              <h4>Existing loans and cards, as a lender counts them</h4>
              <ul className="plain-list">
                {low.commitments.map((c, i) => (
                  <li key={c.name + i}>
                    {c.name}: {formatCurrency(c.monthly)} a month <span className="cap-explain">({c.how})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="cap-explain">
            Total income {formatCurrency(r!.totalIncome)} a year; debts and card limits {formatCurrency(r!.existingDebt)}. Staying under
            6× income means borrowing no more than {formatCurrency(r!.dtiLimitLoan)}.
          </p>
        </div>
      )}

      {estimate && estimate.equity.properties.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Drawing equity from your properties</h3>
          <table className="kv-table">
            <tbody>
              {estimate.equity.properties.map((p) => (
                <tr key={p.name}>
                  <td>
                    {p.name}
                    <div className="cap-explain">
                      {formatCurrency(p.value)} × {Math.round(p.lvr)}% − {formatCurrency(p.owing)} owed
                    </div>
                  </td>
                  <td>{formatCurrency(p.usable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Equity there: <strong>{formatCurrency(estimate.equity.usableTotal)}</strong>. What income can carry limits it to{" "}
            <strong>
              {formatCurrency(estimate.equity.release[0])} – {formatCurrency(estimate.equity.release[1])}
            </strong>
            .
          </p>
          <p className="cap-explain">
            Drawing equity is new borrowing: the interest is deductible only if the money goes to producing income. Record its use
            on the loan (<Link to="/help#loan-purposes">how</Link>).
          </p>
        </div>
      )}

      {estimate && estimate.propertyLoans.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Commercial, lease-doc and SMSF loans</h3>
          <p className="cap-explain">
            These are assessed on the property's own rent — no personal income needed (a "lease doc" loan). The most is the lower of
            what the net rent covers and the value × LVR, assessed interest-only at the rate plus {assumptions.commercialBuffer}%.
          </p>
          {estimate.propertyLoans.map((p) => (
            <div key={p.recordId} className="member-block">
              <strong>{p.name}</strong>
              {p.kind === "SMSF" ? <span className="cap-explain"> · SMSF</span> : null}
              <table className="kv-table" style={{ marginTop: 6 }}>
                <tbody>
                  {p.range.map((x) => (
                    <tr key={x.label}>
                      <td>
                        {x.label}
                        <div className="cap-explain">
                          Rent covers {formatCurrency(x.byServicing)}
                          {x.byLvr !== null ? `; LVR allows ${formatCurrency(x.byLvr)}` : ""}
                        </div>
                      </td>
                      <td>
                        {formatCurrency(x.total)} total
                        <div className="cap-explain">{formatCurrency(x.release)} more than owed now</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.notes.map((n) => (
                <p key={n} className="cap-explain">
                  {n}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <details>
          <summary style={{ minHeight: 40, lineHeight: "40px", cursor: "pointer", fontWeight: 600 }}>Lender assumptions (change any)</summary>
          <div className="grid grid-2">
            <NumberField label="New loan rate %" value={assumptions.newLoanRate} onChange={(v) => set({ newLoanRate: v })} />
            <NumberField label="Buffer added to rates % (APRA: 3)" value={assumptions.buffer} onChange={(v) => set({ buffer: v })} />
            <NumberField label="Assessment floor rate % (0 = none)" value={assumptions.floorRate} onChange={(v) => set({ floorRate: v })} />
            <NumberField label="New loan term (years)" value={assumptions.newLoanTermYears} onChange={(v) => set({ newLoanTermYears: v })} />
            <NumberField
              label="Remaining term of existing loans (years)"
              value={assumptions.existingTermYears}
              onChange={(v) => set({ existingTermYears: v })}
            />
            <NumberField label="Max LVR on homes %" value={assumptions.residentialLvr} onChange={(v) => set({ residentialLvr: v })} />
          </div>
          <PairField label="Bonus and overtime counted %" value={assumptions.variableShading} onChange={(v) => set({ variableShading: v })} />
          <PairField label="Rent counted %" value={assumptions.rentShading} onChange={(v) => set({ rentShading: v })} />
          <PairField label="Credit cards: % of the limit a month" value={assumptions.cardPercent} onChange={(v) => set({ cardPercent: v })} />
          <PairField label="Commercial interest cover needed (×)" value={assumptions.commercialIcr} onChange={(v) => set({ commercialIcr: v })} />
          <PairField label="Commercial max LVR %" value={assumptions.commercialLvr} onChange={(v) => set({ commercialLvr: v })} />
          <PairField label="SMSF max LVR %" value={assumptions.smsfLvr} onChange={(v) => set({ smsfLvr: v })} />
          <NumberField label="Commercial buffer % (added to the rate)" value={assumptions.commercialBuffer} onChange={(v) => set({ commercialBuffer: v })} />
          <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() =>
                api.borrowing
                  .saveAssumptions(assumptions)
                  .then(() => setSaved(true))
                  .catch((e: Error) => setError(e.message))
              }
            >
              Save as my assumptions
            </button>
            <button className="btn secondary" onClick={() => set({ ...defaults, declaredExpenses: assumptions.declaredExpenses, benchmarkExpenses: assumptions.benchmarkExpenses })}>
              Back to the usual figures
            </button>
          </div>
          {saved && <div className="message-box info">Saved — they'll be used next time.</div>}
          <p className="cap-explain">
            Ask your broker for the figures their usual lenders use (rent and bonus shading, card percentage, expense benchmark, LVRs,
            commercial interest cover) and put them here.
          </p>
        </details>
      </div>
    </div>
  );
}

function Row({ label, a, b, strong }: { label: string; a: number; b: number; strong?: boolean }) {
  const cell = (v: number) => (strong ? <strong>{formatCurrency(v)}</strong> : formatCurrency(v));
  return (
    <tr>
      <td>{strong ? <strong>{label}</strong> : label}</td>
      <td>{cell(a)}</td>
      <td>{cell(b)}</td>
    </tr>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label>{label}</label>
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function PairField({ label, value, onChange }: { label: string; value: Pair; onChange: (v: Pair) => void }) {
  return (
    <div className="grid grid-2">
      <div>
        <label>{label} — conservative</label>
        <input type="number" step="any" value={value[0]} onChange={(e) => onChange([Number(e.target.value), value[1]])} />
      </div>
      <div>
        <label>{label} — generous</label>
        <input type="number" step="any" value={value[1]} onChange={(e) => onChange([value[0], Number(e.target.value)])} />
      </div>
    </div>
  );
}
