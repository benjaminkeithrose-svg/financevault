import { useEffect, useState } from "react";
import { api, EstimateField, EstimateVsActual } from "../api/client.js";
import { formatCurrency, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

const LABELS: Record<EstimateField, string> = {
  price: "Price",
  buyingCosts: "Stamp duty and buying costs",
  rent: "Rent a year",
  runningCosts: "Running costs a year",
  cashYear: "Cash a year",
};

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatCurrency(n));
const diff = (actual: number | null | undefined, est: number | null | undefined) =>
  actual === null || actual === undefined || est === null || est === undefined ? "—" : `${actual - est >= 0 ? "+" : "−"}${formatCurrency(Math.abs(actual - est))}`;

/**
 * On a property bought through Properties I'm considering: what was expected
 * when it was bought (kept unchanged) against what really happened — the
 * price and buying costs, then each year's rent, running costs and cash.
 * An estimate can be corrected; the original and the date stay shown.
 */
export function EstimateVsActualCard({ assetId }: { assetId: string }) {
  const [e, setE] = useState<EstimateVsActual | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [field, setField] = useState<EstimateField>("rent");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.considering.estimateVsActual(assetId).then(setE).catch(() => setE(null));
  }, [assetId]);
  if (!e) return null;

  async function save() {
    try {
      setE(await api.considering.correctEstimate(assetId, field, value.trim() === "" ? null : Number(value)));
      setCorrecting(false);
      setValue("");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>
          Estimate vs actual <HelpLink topic="considering" />
        </h3>
        {!correcting && (
          <button className="btn secondary" onClick={() => setCorrecting(true)}>
            Correct an estimate
          </button>
        )}
      </div>
      <p className="cap-explain">What you expected when it was bought ({formatDate(e.frozenAt)}), against what really happened.</p>
      {correcting && (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Which estimate</label>
              <select value={field} onChange={(ev) => setField(ev.target.value as EstimateField)}>
                {(Object.keys(LABELS) as EstimateField[]).map((k) => (
                  <option key={k} value={k}>
                    {LABELS[k]} (now {money(e.estimates[k])})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Corrected to ($)</label>
              <input type="number" value={value} onChange={(ev) => setValue(ev.target.value)} />
            </div>
          </div>
          <p className="cap-explain">The original stays on record, with the date you corrected it.</p>
          <div className="toolbar">
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setCorrecting(false)}>
              Cancel
            </button>
          </div>
          {error && <div className="message-box error">{error}</div>}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th />
              <th>Expected</th>
              <th>Actual</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Price</td>
              <td>{money(e.estimates.price)}</td>
              <td>{money(e.actual.price)}</td>
              <td>{diff(e.actual.price, e.estimates.price)}</td>
            </tr>
            <tr>
              <td>Stamp duty and buying costs</td>
              <td>{money(e.estimates.buyingCosts)}</td>
              <td>{e.actual.buyingCosts !== null ? money(e.actual.buyingCosts) : "not entered"}</td>
              <td>{diff(e.actual.buyingCosts, e.estimates.buyingCosts)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {e.years.length === 0 ? (
        <p className="cap-explain">Each year's real rent, costs and cash appear here from Profit year by year.</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Rent: expected / actual</th>
                <th>Running costs: expected / actual</th>
                <th>Cash: expected / actual</th>
              </tr>
            </thead>
            <tbody>
              {e.years.map((y) => (
                <tr key={y.fyLabel}>
                  <td>
                    {y.fyLabel}
                    {y.soFar ? " (so far)" : ""}
                  </td>
                  <td>
                    {money(e.estimates.rent)} / {money(y.rent)}
                  </td>
                  <td>
                    {money(e.estimates.runningCosts)} / {money(y.runningCosts)}
                  </td>
                  <td>
                    {money(e.estimates.cashYear)} / {money(y.cash)}
                    {!y.cashAfterTax ? " before tax" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {e.corrections.length > 0 && (
        <ul className="cap-explain" style={{ paddingLeft: 18 }}>
          {e.corrections.map((c, i) => (
            <li key={i}>
              {LABELS[c.field as EstimateField] ?? c.field} corrected from {money(c.from as number | null)} to {money(c.to as number | null)} on{" "}
              {formatDate(c.at)}.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
