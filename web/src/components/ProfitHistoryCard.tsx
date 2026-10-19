import { useEffect, useState } from "react";
import { api, PropertyProfitYear } from "../api/client.js";
import { confirmThenDelete, formatCurrency } from "../utils.js";
import { IconBin } from "./icons.js";

// A property's profit year by year: rent against costs and interest as
// bars, and the cash it left (after tax where known) as a line. This year
// keeps updating; past years are typed in from old tax returns.

const W = 720;
const H = 240;
const PAD = { left: 64, right: 16, top: 16, bottom: 32 };

function short(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  return a >= 1_000_000 ? `${s}$${(a / 1_000_000).toFixed(1)}m` : a >= 1_000 ? `${s}$${Math.round(a / 1_000)}k` : `${s}$${Math.round(a)}`;
}

function YearsChart({ years }: { years: PropertyProfitYear[] }) {
  const cash = (y: PropertyProfitYear) => y.cashAfterTax ?? y.cashBeforeTax;
  const out = (y: PropertyProfitYear) => y.costs + y.interest;
  const all = years.flatMap((y) => [y.rent, out(y), cash(y), 0]);
  const lo = Math.min(...all);
  const hi = Math.max(...all, 1);
  // Round steps ($5k, $10k, $20k…) for the side labels.
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) ?? raw;
  const bottom = Math.floor(lo / step) * step;
  const top = Math.ceil(hi / step) * step;
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * ((top - v) / (top - bottom));
  const slot = (W - PAD.left - PAD.right) / years.length;
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  const barW = Math.max(4, Math.min(26, slot * 0.28));
  const ticks: number[] = [];
  for (let t = bottom; t <= top + step / 2; t += step) ticks.push(t);
  const line = years.map((yr, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(cash(yr)).toFixed(1)}`).join(" ");
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Rent, costs and cash left, each financial year">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {short(t)}
            </text>
          </g>
        ))}
        {bottom < 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-zero" />}
        {years.map((yr, i) => (
          <g key={yr.fyLabel}>
            <rect x={x(i) - barW - 1} y={y(yr.rent)} width={barW} height={Math.max(1, y(0) - y(yr.rent))} className="chart-bar">
              <title>{`${yr.fyLabel}: rent ${formatCurrency(yr.rent)}`}</title>
            </rect>
            <rect x={x(i) + 1} y={y(out(yr))} width={barW} height={Math.max(1, y(0) - y(out(yr)))} className="chart-bar negative">
              <title>{`${yr.fyLabel}: costs ${formatCurrency(yr.costs)} and interest ${formatCurrency(yr.interest)}`}</title>
            </rect>
            <text x={x(i)} y={H - 10} textAnchor="middle" className="chart-axis">
              {yr.fyLabel}
            </text>
          </g>
        ))}
        <path d={line} className="chart-line pool" />
        {years.map((yr, i) => (
          <circle key={yr.fyLabel} cx={x(i)} cy={y(cash(yr))} r={4} className="chart-dot">
            <title>{`${yr.fyLabel}: ${formatCurrency(cash(yr))} left ${yr.cashAfterTax != null ? "after tax" : "before tax"}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function ProfitHistoryCard({ assetId, title = "Profit year by year", onlyIfSaved = false }: { assetId: string; title?: string; onlyIfSaved?: boolean }) {
  const [data, setData] = useState<{ years: PropertyProfitYear[]; interestByYear: Record<string, number> } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fyLabel: "", rent: "", costs: "", interest: "", depreciation: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.reports.profitYears(assetId).then(setData).catch(() => setData(null));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  function pickYear(fyLabel: string) {
    const interest = data?.interestByYear[fyLabel];
    setForm({ ...form, fyLabel, interest: form.interest || (interest != null ? String(Math.round(interest * 100) / 100) : "") });
  }

  async function save() {
    if (!form.fyLabel || form.rent === "" || form.costs === "" || form.interest === "") {
      setError("Enter the year, the rent, the costs and the interest.");
      return;
    }
    try {
      await api.reports.addProfitYear(assetId, {
        fyLabel: form.fyLabel,
        rent: Number(form.rent),
        costs: Number(form.costs),
        interest: Number(form.interest),
        depreciation: form.depreciation ? Number(form.depreciation) : 0,
      });
      setForm({ fyLabel: "", rent: "", costs: "", interest: "", depreciation: "" });
      setAdding(false);
      setError(null);
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(y: PropertyProfitYear) {
    if (await confirmThenDelete(`Remove ${y.fyLabel} from this property's history?`, () => api.reports.removeProfitYear(y.id))) void load();
  }

  const years = data?.years ?? [];
  const had = new Set(years.map((y) => y.fyLabel));
  // Offer the ten years before the earliest one recorded (or this one).
  const thisStart = (() => {
    const d = new Date();
    return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  })();
  const choices = Array.from({ length: 10 }, (_, i) => thisStart - 1 - i)
    .map((s) => `${s}-${String((s + 1) % 100).padStart(2, "0")}`)
    .filter((l) => !had.has(l) || years.find((y) => y.fyLabel === l)?.source === "ENTERED");

  if (onlyIfSaved && years.length === 0) return null;

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!adding && (
          <button className="btn secondary" onClick={() => setAdding(true)}>
            Add a past year
          </button>
        )}
      </div>
      {years.length >= 2 ? (
        <>
          <YearsChart years={years} />
          <div className="chart-legend">
            <span>
              <span className="chart-key bar" aria-hidden="true" />
              Rent
            </span>
            <span>
              <span className="chart-key bar negative" aria-hidden="true" />
              Costs and interest
            </span>
            <span>
              <span className="chart-key pool" aria-hidden="true" />
              Cash left (after tax where known)
            </span>
          </div>
        </>
      ) : (
        <p className="empty-state">
          {years.length === 1
            ? `This year (${years[0].fyLabel}) is saved and keeps updating. Add past years from old tax returns and the graph appears.`
            : "Nothing saved yet — this year is saved when you open Reports → Property profit. Add past years from old tax returns."}
        </p>
      )}

      {adding && (
        <div className="sub-form">
          <p className="cap-explain" style={{ marginTop: 0 }}>
            From the rental schedule in that year's tax return, or your accountant's figures. Interest is filled in if a statement for that
            year has been read on its loan.
          </p>
          <div className="grid grid-3">
            <div>
              <label>Financial year</label>
              <select value={form.fyLabel} onChange={(e) => pickYear(e.target.value)}>
                <option value="">— Choose —</option>
                {choices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Rent received ($)</label>
              <input type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} />
            </div>
            <div>
              <label>Costs, not interest ($)</label>
              <input type="number" value={form.costs} onChange={(e) => setForm({ ...form, costs: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-3">
            <div>
              <label>Interest ($)</label>
              <input type="number" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
            </div>
            <div>
              <label>Depreciation and building write-off ($, optional)</label>
              <input type="number" value={form.depreciation} onChange={(e) => setForm({ ...form, depreciation: e.target.value })} />
            </div>
          </div>
          {error && <div className="message-box error">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={save}>
              Save the year
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {years.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Rent</th>
                <th>Costs</th>
                <th>Interest</th>
                <th>Tax result</th>
                <th>Cash left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => (
                <tr key={y.id}>
                  <td>
                    {y.fyLabel}
                    {y.source === "AUTO" && !y.final ? " (so far)" : y.source === "ENTERED" ? " (typed in)" : ""}
                  </td>
                  <td>{formatCurrency(y.rent)}</td>
                  <td>{formatCurrency(y.costs)}</td>
                  <td>{formatCurrency(y.interest)}</td>
                  <td>{formatCurrency(y.taxResult)}</td>
                  <td>
                    {formatCurrency(y.cashAfterTax ?? y.cashBeforeTax)}
                    {y.cashAfterTax == null ? " before tax" : ""}
                  </td>
                  <td>
                    {y.source === "ENTERED" && (
                      <button className="icon-btn danger" onClick={() => remove(y)} aria-label={`Remove ${y.fyLabel}`}>
                        <IconBin />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
