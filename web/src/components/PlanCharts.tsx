import { PortfolioPlanProjection } from "../api/client.js";

// Graphs of a Portfolio Plan, drawn by the app itself (no chart library):
// the portfolio's value, loans and equity; each year's cash and the cash
// pool; and a timeline of purchases, refinances and equity draws. Each has
// the figures as hover text, and the tables below the graphs have them all.

const W = 720;
const H = 260;
const PAD = { left: 64, right: 16, top: 16, bottom: 32 };

/** "$1.2m", "$450k", "$900". */
function short(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-AU")}`;

/** Round numbers for the side of a graph, covering min..max (and 0). */
function ticks(min: number, max: number, count = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max, 1);
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

function Frame({ years, yTicks, y, children, label }: { years: number[]; yTicks: number[]; y: (v: number) => number; children: React.ReactNode; label: string }) {
  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * (i + 0.5)) / years.length;
  const every = Math.ceil(years.length / 12);
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={label}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-zero" : "chart-grid"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {short(t)}
            </text>
          </g>
        ))}
        {years.map((yr, i) =>
          i % every === 0 ? (
            <text key={yr} x={x(i)} y={H - 10} textAnchor="middle" className="chart-axis">
              Yr {yr}
            </text>
          ) : null
        )}
        {children}
      </svg>
    </div>
  );
}

function Legend({ items }: { items: Array<{ cls: string; label: string }> }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className={`chart-key ${i.cls}`} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Value, loans and the equity between them — and a what-if's base plan's equity to compare. */
export function GrowthChart({ projection, compare }: { projection: PortfolioPlanProjection; compare?: { name: string; projection: PortfolioPlanProjection } | null }) {
  const rows = projection.portfolioByYear;
  const other = compare?.projection.portfolioByYear ?? [];
  const years = rows.map((r) => r.yearNumber);
  const max = Math.max(...rows.map((r) => r.totalValue), ...other.map((r) => r.totalEquity), 1);
  const yTicks = ticks(0, max);
  const top = yTicks[yTicks.length - 1];
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / top);
  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * (i + 0.5)) / years.length;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const equityArea =
    rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.totalValue).toFixed(1)}`).join(" ") +
    " " +
    [...rows].reverse().map((r, j) => `L${x(rows.length - 1 - j).toFixed(1)},${y(r.totalLoan).toFixed(1)}`).join(" ") +
    " Z";
  return (
    <div>
      <h4 className="chart-title">What it's worth, what's owed, and your equity</h4>
      <Frame years={years} yTicks={yTicks} y={y} label="Value, loans and equity by year">
        <path d={equityArea} className="chart-area" />
        <path d={line(rows.map((r) => r.totalValue))} className="chart-line value" />
        <path d={line(rows.map((r) => r.totalLoan))} className="chart-line loan" />
        {compare && other.length > 0 && <path d={line(other.slice(0, years.length).map((r) => r.totalEquity))} className="chart-line compare" />}
        {rows.map((r, i) => (
          <circle key={r.yearNumber} cx={x(i)} cy={y(r.totalValue)} r={9} className="chart-hit">
            <title>
              {`Year ${r.yearNumber}: worth ${money(r.totalValue)}, owed ${money(r.totalLoan)}, equity ${money(r.totalEquity)}`}
              {compare && other[i] ? ` (${compare.name}: equity ${money(other[i].totalEquity)})` : ""}
            </title>
          </circle>
        ))}
      </Frame>
      <Legend
        items={[
          { cls: "value", label: "What it's worth" },
          { cls: "loan", label: "Loans" },
          { cls: "area", label: "Equity (the gap)" },
          ...(compare ? [{ cls: "compare", label: `Equity in ${compare.name}` }] : []),
        ]}
      />
    </div>
  );
}

/** Each year's cash (after funding costs) as bars, and the cash pool as a line; short years marked. */
export function CashChart({ projection, compare }: { projection: PortfolioPlanProjection; compare?: { name: string; projection: PortfolioPlanProjection } | null }) {
  const rows = projection.portfolioByYear;
  const other = compare?.projection.portfolioByYear.slice(0, rows.length) ?? [];
  const years = rows.map((r) => r.yearNumber);
  const all = [...rows.map((r) => r.totalCashflowAfterFunding), ...rows.map((r) => r.cashPool), ...other.map((r) => r.cashPool)];
  const yTicks = ticks(Math.min(...all, 0), Math.max(...all, 1));
  const lo = yTicks[0];
  const hi = yTicks[yTicks.length - 1];
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * ((hi - v) / (hi - lo));
  const slot = (W - PAD.left - PAD.right) / years.length;
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  const barW = Math.max(3, Math.min(28, slot * 0.5));
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const positiveFrom = rows.find((r, i) => r.totalCashflowAfterFunding >= 0 && rows.slice(i).every((s) => s.totalCashflowAfterFunding >= 0));
  return (
    <div>
      <h4 className="chart-title">Cash each year, and cash in hand</h4>
      <Frame years={years} yTicks={yTicks} y={y} label="Cash each year and the cash pool">
        {rows.map((r, i) => {
          const v = r.totalCashflowAfterFunding;
          return (
            <rect key={r.yearNumber} x={x(i) - barW / 2} y={Math.min(y(v), y(0))} width={barW} height={Math.max(1, Math.abs(y(v) - y(0)))} className={v >= 0 ? "chart-bar" : "chart-bar negative"}>
              <title>{`Year ${r.yearNumber}: ${v >= 0 ? "cash in" : "cash out"} ${money(Math.abs(v))} from rent less interest and funding costs`}</title>
            </rect>
          );
        })}
        {compare && other.length > 0 && <path d={line(other.map((r) => r.cashPool))} className="chart-line compare" />}
        <path d={line(rows.map((r) => r.cashPool))} className="chart-line pool" />
        {rows.map((r, i) => (
          <circle key={r.yearNumber} cx={x(i)} cy={y(r.cashPool)} r={r.short ? 5 : 3} className={r.short ? "chart-dot short" : "chart-dot"}>
            <title>{`Year ${r.yearNumber}: ${money(r.cashPool)} in hand at the end of the year${r.short ? " — short" : ""}`}</title>
          </circle>
        ))}
      </Frame>
      <Legend
        items={[
          { cls: "bar", label: "Cash in (rent less interest)" },
          { cls: "bar negative", label: "Cash out" },
          { cls: "pool", label: "Cash in hand" },
          ...(rows.some((r) => r.short) ? [{ cls: "short", label: "Short of cash" }] : []),
          ...(compare ? [{ cls: "compare", label: `Cash in hand in ${compare.name}` }] : []),
        ]}
      />
      <p className="cap-explain">
        {positiveFrom
          ? `The properties pay for themselves (after interest and funding costs) from Year ${positiveFrom.yearNumber}.`
          : `The properties don't pay for themselves within the ${years.length} years — the gap comes from your pay or savings.`}
      </p>
    </div>
  );
}

const MARK: Record<string, { cls: string; text: string }> = {
  BUY: { cls: "buy", text: "Bought" },
  REFINANCE: { cls: "refinance", text: "Refinanced" },
  DRAW_FOR: { cls: "draw-for", text: "Equity drawn for it" },
  DRAW_FROM: { cls: "draw-from", text: "Equity drawn from it" },
};

/** One row per property; when each is bought, refinanced, or drawn on. */
export function PlanTimeline({ projection }: { projection: PortfolioPlanProjection }) {
  const years = projection.portfolioByYear.map((r) => r.yearNumber);
  const rows = [
    ...projection.holdings.map((h) => ({ key: h.holdingId, name: h.name, owned: true, from: 1, events: h.events })),
    ...projection.properties.map((p) => ({ key: p.planPropertyId, name: p.name, owned: false, from: p.acquisitionYearNumber, events: p.events })),
  ];
  if (!rows.length) return null;
  const nameW = 150;
  const rowH = 34;
  const h = PAD.top + rows.length * rowH + 28;
  const slot = (W - nameW - PAD.right) / years.length;
  const x = (yr: number) => nameW + slot * (yr - 0.5);
  const every = Math.ceil(years.length / 12);
  return (
    <div>
      <h4 className="chart-title">Timeline</h4>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label="When each property is bought, refinanced or drawn on">
          {years.map((yr) =>
            (yr - 1) % every === 0 ? (
              <text key={yr} x={x(yr)} y={h - 8} textAnchor="middle" className="chart-axis">
                Yr {yr}
              </text>
            ) : null
          )}
          {rows.map((r, i) => {
            const cy = PAD.top + i * rowH + rowH / 2;
            return (
              <g key={r.key}>
                <text x={0} y={cy + 4} className="chart-label">
                  {r.name.length > 20 ? `${r.name.slice(0, 19)}…` : r.name}
                  <title>{r.owned ? `${r.name} (already owned)` : r.name}</title>
                </text>
                <line x1={x(r.from) - (r.owned ? slot / 2 : 0)} x2={x(years.length) + slot / 2} y1={cy} y2={cy} className={r.owned ? "chart-held owned" : "chart-held"} />
                {r.events.map((e, j) => {
                  const same = r.events.filter((o) => o.yearNumber === e.yearNumber);
                  const offset = (same.indexOf(e) - (same.length - 1) / 2) * 12;
                  const m = MARK[e.type];
                  return (
                    <circle key={j} cx={x(e.yearNumber) + offset} cy={cy} r={7} className={`chart-mark ${m.cls}`}>
                      <title>{`Year ${e.yearNumber}: ${e.label}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <Legend
        items={[
          { cls: "mark buy", label: "Bought" },
          { cls: "mark refinance", label: "Refinanced" },
          { cls: "mark draw-for", label: "Equity drawn for it" },
          { cls: "mark draw-from", label: "Equity drawn from it" },
          ...(projection.holdings.length ? [{ cls: "held-owned", label: "Already owned" }] : []),
        ]}
      />
    </div>
  );
}
