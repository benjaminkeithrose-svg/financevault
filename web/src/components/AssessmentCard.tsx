import { useEffect, useState, type ReactNode } from "react";
import { api, Assessment, AssessmentColumn, AssessmentInputs } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";
import { BORROWING_STATUS } from "./PlanBorrowingCard.js";

const pct = (n: number | null | undefined, dp = 1) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(dp)}%`);
const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatCurrency(n));
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

type Form = Record<keyof AssessmentInputs, string>;
const FIELDS: Array<keyof AssessmentInputs> = [
  "price",
  "lvrPercent",
  "stampDuty",
  "otherCosts",
  "repaymentType",
  "loanTermYears",
  "advertisedYieldPercent",
  "expectedVacancyWeeks",
  "expectedRatePercent",
  "conservativeRent",
  "conservativeVacancyWeeks",
  "conservativeCosts",
  "conservativeRatePercent",
  "badRent",
  "badVacancyWeeks",
  "badCosts",
  "badRatePercent",
];

function toForm(a: Assessment): Form {
  const f = {} as Form;
  for (const k of FIELDS) f[k] = k === "repaymentType" ? (a.inputs?.repaymentType ?? "IO") : str(a.inputs?.[k] as number | null | undefined);
  return f;
}

/**
 * The quick assessment on a property you're considering: the purchase, then
 * three columns (expected from the property's own rent and running costs;
 * conservative and bad case with their own), what cash it needs, and whether
 * a lender might lend it. Only what's entered is used.
 */
export function AssessmentCard({ assetId, reloadKey }: { assetId: string; reloadKey?: unknown }) {
  const [a, setA] = useState<Assessment | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.considering
      .assessment(assetId)
      .then((x) => {
        setA(x);
        setForm(toForm(x));
      })
      .catch((e) => setError((e as Error).message));
  }, [assetId, reloadKey]);

  if (!a || !form) return <div className="card">{error ?? "Loading the assessment…"}</div>;
  const commercial = a.kind === "COMMERCIAL";
  const set = (k: keyof AssessmentInputs, v: string) => setForm({ ...form, [k]: v });

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const data: AssessmentInputs = {};
      for (const k of FIELDS) {
        if (k === "repaymentType") data.repaymentType = form.repaymentType === "PI" ? "PI" : "IO";
        else (data as Record<string, number | null>)[k] = num(form[k]);
      }
      const x = await api.considering.saveAssessment(assetId, data);
      setA(x);
      setForm(toForm(x));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input = (k: keyof AssessmentInputs, label: string, extra?: { placeholder?: string; step?: string }) => (
    <input type="number" aria-label={label} value={form[k]} step={extra?.step} placeholder={extra?.placeholder} onChange={(e) => set(k, e.target.value)} />
  );
  const shown = a.columns.filter((c) => c.shown);
  const field = (c: AssessmentColumn, what: "Rent" | "VacancyWeeks" | "Costs" | "RatePercent") => `${c.key}${what}` as keyof AssessmentInputs;
  const row = (label: string, render: (c: AssessmentColumn) => ReactNode) => (
    <tr>
      <td>{label}</td>
      {shown.map((c) => (
        <td key={c.key}>{render(c)}</td>
      ))}
    </tr>
  );
  const expected = a.columns[0];
  const b = a.borrowing;
  const status = b?.status ? BORROWING_STATUS[b.status] : null;

  return (
    <div className="card assessment">
      <h3 style={{ marginTop: 0 }}>
        Quick assessment <HelpLink topic="considering" />
      </h3>
      <p className="cap-explain" style={{ marginTop: 0 }}>
        Is it worth a closer look? Worked out only from what you've entered — an estimate, not advice.
      </p>

      <h4>The purchase</h4>
      <div className="grid grid-3">
        <div>
          <label>Price ($)</label>
          {input("price", "Price", { placeholder: a.priceIsAsking && a.price ? `Asking ${formatCurrency(a.price)}` : "" })}
        </div>
        <div>
          <label>Borrowing (% of price)</label>
          {input("lvrPercent", "Borrowing as a percentage of the price", { placeholder: "e.g. 80" })}
        </div>
        <div>
          <label>Stamp duty ($)</label>
          {input("stampDuty", "Stamp duty", {
            placeholder: a.purchase.dutyEstimated && a.purchase.stampDuty !== null ? `NSW estimate ${formatCurrency(a.purchase.stampDuty)}` : "",
          })}
        </div>
        <div>
          <label>Other buying costs ($)</label>
          {input("otherCosts", "Other buying costs", { placeholder: "legal, inspections, fees" })}
        </div>
        <div>
          <label>Loan</label>
          <select value={form.repaymentType} onChange={(e) => set("repaymentType", e.target.value)}>
            <option value="IO">Interest only</option>
            <option value="PI">Principal and interest</option>
          </select>
        </div>
        {form.repaymentType === "PI" && (
          <div>
            <label>Over (years)</label>
            {input("loanTermYears", "Loan term in years", { placeholder: "30" })}
          </div>
        )}
        {commercial && (
          <div>
            <label>Advertised yield (%)</label>
            {input("advertisedYieldPercent", "Advertised yield", { step: "0.1" })}
          </div>
        )}
      </div>

      <h4>Three ways it could go</h4>
      <div className="table-scroll">
        <table className="assessment-table">
          <thead>
            <tr>
              <th />
              {a.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rent a year</td>
              {a.columns.map((c) =>
                c.key === "expected" ? (
                  <td key={c.key}>
                    {money(a.expectedFrom.rent)}
                    <div className="cap-explain">{commercial ? "from the leases" : "from the property"}</div>
                  </td>
                ) : (
                  <td key={c.key}>{input(field(c, "Rent"), `${c.label} rent a year`)}</td>
                )
              )}
            </tr>
            <tr>
              <td>Weeks empty a year</td>
              {a.columns.map((c) => (
                <td key={c.key}>{input(field(c, "VacancyWeeks"), `${c.label} weeks empty`, { placeholder: "0" })}</td>
              ))}
            </tr>
            <tr>
              <td>Running costs a year</td>
              {a.columns.map((c) =>
                c.key === "expected" ? (
                  <td key={c.key}>
                    {money(a.expectedFrom.costs)}
                    <div className="cap-explain">{commercial ? "outgoings not recovered" : "running costs below"}</div>
                  </td>
                ) : (
                  <td key={c.key}>{input(field(c, "Costs"), `${c.label} running costs a year`)}</td>
                )
              )}
            </tr>
            <tr>
              <td>Interest rate (%)</td>
              {a.columns.map((c) => (
                <td key={c.key}>{input(field(c, "RatePercent"), `${c.label} interest rate`, { step: "0.01" })}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Working it out…" : "Work it out"}
        </button>
      </div>
      {error && <div className="message-box error">{error}</div>}

      {shown.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="assessment-table results">
            <thead>
              <tr>
                <th />
                {shown.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row("Gross yield", (c) => pct(c.figures.grossYield))}
              {row("Net yield", (c) => pct(c.figures.netYield))}
              {row(a.purchase.repaymentType === "PI" ? "Loan repayments a year" : "Interest a year", (c) => money(c.figures.repayments))}
              {row("Cash a year before tax", (c) => money(c.figures.cashBeforeTax))}
              {row("Tax (− saved, + extra)", (c) => money(c.figures.taxEffect))}
              {row("Cash a year after tax", (c) => money(c.figures.cashAfterTax))}
              {row("A week", (c) => money(c.figures.weeklyCash))}
              {row("Return on the cash put in", (c) => pct(c.figures.returnOnCash))}
              {commercial && row("Rent cover (DSCR)", (c) => (c.figures.dscr === null ? "—" : `${c.figures.dscr.toFixed(2)}×`))}
            </tbody>
          </table>
        </div>
      )}
      {expected.missing.length > 0 && <p className="cap-explain">To see the rest, enter {expected.missing.join(", ")}.</p>}
      {commercial && (
        <p>
          Advertised yield <strong>{pct(a.advertisedYield, 2)}</strong> · yield the leases and outgoings support{" "}
          <strong>{pct(a.supportedYield, 2)}</strong>
        </p>
      )}

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div>
          <h4>Cash needed</h4>
          <table className="kv-table">
            <tbody>
              <tr>
                <td>Deposit</td>
                <td>{money(a.purchase.deposit)}</td>
              </tr>
              <tr>
                <td>Stamp duty{a.purchase.dutyEstimated ? ` (NSW estimate, ${a.purchase.dutyRatesYear} rates)` : ""}</td>
                <td>{money(a.purchase.stampDuty)}</td>
              </tr>
              <tr>
                <td>Other buying costs</td>
                <td>{money(a.purchase.otherCosts)}</td>
              </tr>
              {a.purchase.openIssueCosts > 0 && (
                <tr>
                  <td>Open issues found</td>
                  <td>{money(a.purchase.openIssueCosts)}</td>
                </tr>
              )}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{money(a.purchase.cashNeeded)}</strong>
                </td>
              </tr>
              <tr>
                <td>Loan</td>
                <td>
                  {money(a.purchase.loan)}
                  {a.purchase.lvr !== null ? ` (LVR ${a.purchase.lvr}%)` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h4>Can we borrow it?</h4>
          {!b ? (
            <p className="cap-explain">Shows once the price and how much you'd borrow are entered.</p>
          ) : (
            <>
              <p style={{ margin: "0 0 6px" }}>
                {status && <span className={`badge ${status.cls}`}>{status.label}</span>} A lender might lend {formatCurrency(b.capacity[0])} to{" "}
                {formatCurrency(b.capacity[1])} more. {b.reason}
              </p>
              <p className="cap-explain" style={{ margin: 0 }}>
                Backed by {b.people.length ? b.people.join(", ") : "no one's income yet"}. Worked out as the How much could I borrow? page does,
                counting this property's rent. The lender decides.
              </p>
              {b.notes.map((n) => (
                <p key={n} className="cap-explain" style={{ margin: "4px 0 0" }}>
                  {n}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
      {a.notes.length > 0 && (
        <ul className="cap-explain" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {a.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
