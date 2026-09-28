import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, LoanHistory, StatementProposal } from "../api/client.js";
import { confirmThenDelete, formatCurrency, formatDate } from "../utils.js";
import { IconBin } from "./icons.js";
import { LayoutShare } from "./LayoutShare.js";

// A loan's rate and balance over the years, drawn as graphs, and reading its
// statements: upload one (PDF, photo or CSV), see what it says next to
// what's recorded, tick what to take, and it's filed with the loan.

const W = 720;
const H = 220;
const PAD = { left: 64, right: 16, top: 14, bottom: 30 };

type Point = { t: number; v: number; label: string };

const SOURCE: Record<string, string> = {
  STATEMENT: "statement",
  CSV: "CSV file",
  RATE_CHANGE: "rate change on a statement",
  RECORDED: "added by you",
  EDITED: "changed on this page",
  NOW: "now",
};

function TimeChart({ points, step, format, label }: { points: Point[]; step?: boolean; format: (v: number) => string; label: string }) {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 86_400_000);
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const x = (t: number) => PAD.left + ((W - PAD.left - PAD.right) * (t - t0)) / (t1 - t0);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo));
  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].v).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    if (step) d += ` L${x(points[i].t).toFixed(1)},${y(points[i - 1].v).toFixed(1)}`;
    d += ` L${x(points[i].t).toFixed(1)},${y(points[i].v).toFixed(1)}`;
  }
  const yTicks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const firstYear = new Date(t0).getUTCFullYear();
  const lastYear = new Date(t1).getUTCFullYear();
  const every = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 10));
  const years: number[] = [];
  for (let yr = firstYear + 1; yr <= lastYear; yr += every) years.push(yr);
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={label}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {format(v)}
            </text>
          </g>
        ))}
        {years.map((yr) => {
          const t = Date.UTC(yr, 0, 1);
          return t > t0 && t < t1 ? (
            <text key={yr} x={x(t)} y={H - 8} textAnchor="middle" className="chart-axis">
              {yr}
            </text>
          ) : null;
        })}
        <path d={d} className="chart-line pool" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r={4} className="chart-dot">
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function LoanHistoryCard({ liabilityId, onChange }: { liabilityId: string; onChange: () => void }) {
  const [history, setHistory] = useState<LoanHistory | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ documentId: string; name: string; p: StatementProposal } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [past, setPast] = useState({ asAt: "", interestRate: "", balance: "" });
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.liabilities.history(liabilityId).then(setHistory).catch(() => setHistory(null));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liabilityId]);

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    setDone(null);
    try {
      const { document } = await api.documents.upload(file);
      await api.documents.addLink(document.id, { targetType: "LIABILITY", targetId: liabilityId, label: "Statement" }).catch(() => {});
      const p = await api.liabilities.readStatement(liabilityId, document.id);
      setProposal({ documentId: document.id, name: document.originalFilename, p });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addPast() {
    if (!past.asAt || (!past.interestRate && !past.balance)) {
      setError("Enter the date, and the rate or the balance.");
      return;
    }
    try {
      await api.liabilities.addReading(liabilityId, {
        asAt: past.asAt,
        interestRate: past.interestRate ? Number(past.interestRate) : null,
        balance: past.balance ? Number(past.balance) : null,
      });
      setPast({ asAt: "", interestRate: "", balance: "" });
      setAdding(false);
      setError(null);
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (await confirmThenDelete("Remove this point from the loan's history? Its statement stays in Documents.", () => api.liabilities.removeReading(id))) {
      void load();
    }
  }

  // The graphs: every reading with a rate (or balance), then today's figures on the loan.
  const readings = history?.readings ?? [];
  const now = history?.current;
  const ratePoints: Point[] = readings
    .filter((r) => r.interestRate != null)
    .map((r) => ({ t: Date.parse(r.asAt), v: r.interestRate!, label: `${formatDate(r.asAt)}: ${r.interestRate}% (${SOURCE[r.source] ?? r.source})` }));
  if (now?.interestRate != null && (!ratePoints.length || ratePoints[ratePoints.length - 1].v !== now.interestRate || ratePoints[ratePoints.length - 1].t < Date.parse(now.asAt))) {
    ratePoints.push({ t: Math.max(Date.parse(now.asAt), ratePoints.length ? ratePoints[ratePoints.length - 1].t : 0), v: now.interestRate, label: `Now: ${now.interestRate}%` });
  }
  const balancePoints: Point[] = readings
    .filter((r) => r.balance != null)
    .map((r) => ({ t: Date.parse(r.asAt), v: r.balance!, label: `${formatDate(r.asAt)}: ${formatCurrency(r.balance)} owing` }));
  if (now?.balance != null && (!balancePoints.length || Date.parse(now.asAt) > balancePoints[balancePoints.length - 1].t)) {
    balancePoints.push({ t: Date.parse(now.asAt), v: now.balance, label: `${formatDate(now.asAt)}: ${formatCurrency(now.balance)} owing` });
  }
  const years = history?.interestYears ?? [];
  const stale = now?.balance != null && Date.now() - Date.parse(now.asAt) > 100 * 86_400_000;

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Rate and balance over time</h3>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? "Reading…" : "Read a statement"}
        </button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.csv,image/*,text/csv,application/pdf" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </div>
      <p className="cap-explain">
        Choose a statement from your lender — a PDF, a photo, or a CSV of the loan account — and the app reads the balance, the rate,
        any rate changes, the repayment and the interest charged. You tick what to take. It stays on this computer.
      </p>
      {stale && (
        <div className="message-box warning">
          The balance is from {formatDate(now!.asAt)} — more than three months ago. Reading the latest statement brings it up to date.
        </div>
      )}
      {error && <div className="message-box error">{error}</div>}
      {done && <div className="message-box success">{done}</div>}

      {proposal && (
        <StatementReview
          liabilityId={liabilityId}
          documentId={proposal.documentId}
          name={proposal.name}
          proposal={proposal.p}
          onCancel={() => setProposal(null)}
          onApplied={(msg) => {
            setProposal(null);
            setDone(msg);
            void load();
            onChange();
          }}
        />
      )}

      {ratePoints.length >= 2 ? (
        <>
          <h4 className="chart-title">Interest rate</h4>
          <TimeChart points={ratePoints} step format={(v) => `${v.toFixed(2)}%`} label="The loan's interest rate over time" />
        </>
      ) : (
        <p className="empty-state">
          The graph fills in as you read statements, or add rates you remember below — each one is a point on it.
        </p>
      )}
      {balancePoints.length >= 2 && (
        <>
          <h4 className="chart-title">What's owing</h4>
          <TimeChart
            points={balancePoints}
            format={(v) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}m` : `$${Math.round(v / 1000)}k`)}
            label="What's owing on the loan over time"
          />
        </>
      )}
      {years.length > 0 && (
        <>
          <h4 className="chart-title">Interest charged each financial year</h4>
          <table>
            <tbody>
              {years.map((y) => (
                <tr key={y.fyLabel}>
                  <td>{y.fyLabel}</td>
                  <td>{formatCurrency(y.interestCharged)}</td>
                  <td>{y.documentId ? <Link to={`/documents/${y.documentId}`}>Statement</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
        {!adding && (
          <button className="btn secondary" onClick={() => setAdding(true)}>
            Add a rate from before
          </button>
        )}
        {readings.length > 0 && (
          <button className="btn secondary" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Hide the history" : `See the history (${readings.length})`}
          </button>
        )}
      </div>
      {adding && (
        <div className="sub-form">
          <div className="grid grid-3">
            <div>
              <label>Date</label>
              <input type="date" value={past.asAt} onChange={(e) => setPast({ ...past, asAt: e.target.value })} />
            </div>
            <div>
              <label>Interest rate (%)</label>
              <input type="number" step="0.01" value={past.interestRate} onChange={(e) => setPast({ ...past, interestRate: e.target.value })} />
            </div>
            <div>
              <label>Owing then ($, optional)</label>
              <input type="number" value={past.balance} onChange={(e) => setPast({ ...past, balance: e.target.value })} />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={addPast}>
              Add it
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showAll && (
        <ul className="item-card-list" style={{ marginTop: 8 }}>
          {[...readings].reverse().map((r) => (
            <li key={r.id} className="item-card" style={{ cursor: "default" }}>
              <div className="item-card-body">
                <div className="item-card-title">{formatDate(r.asAt)}</div>
                <div className="item-card-subtitle" style={{ whiteSpace: "normal" }}>
                  {[r.interestRate != null ? `${r.interestRate}%` : null, r.balance != null ? `${formatCurrency(r.balance)} owing` : null, SOURCE[r.source] ?? r.source]
                    .filter(Boolean)
                    .join(" · ")}
                  {r.document && (
                    <>
                      {" · "}
                      <Link to={`/documents/${r.document.id}`}>{r.document.originalFilename}</Link>
                    </>
                  )}
                </div>
              </div>
              <button className="btn secondary" onClick={() => remove(r.id)} aria-label={`Remove the ${formatDate(r.asAt)} point`}>
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What a statement says, next to what's recorded; tick what to take. */
function StatementReview({
  liabilityId,
  documentId,
  name,
  proposal,
  onCancel,
  onApplied,
}: {
  liabilityId: string;
  documentId: string;
  name: string;
  proposal: StatementProposal;
  onCancel: () => void;
  onApplied: (message: string) => void;
}) {
  const s = proposal.statement;
  const c = proposal.csv;
  const cur = proposal.current;
  const asAt = (s?.asAt ?? c?.asAt ?? "").slice(0, 10);
  const older = !!asAt && !!cur.balanceAsAt && asAt < cur.balanceAsAt.slice(0, 10);
  const [v, setV] = useState({
    balance: String(s?.balance ?? c?.balance ?? ""),
    asAt,
    rate: String(s?.interestRate ?? ""),
    repayment: String(s?.repayment ?? ""),
  });
  const years = s?.financialYear ? [{ fyLabel: s.financialYear.fyLabel, interest: s.financialYear.interest, complete: true }] : (c?.interestByYear ?? []);
  const [tick, setTick] = useState({
    balance: (s?.balance ?? c?.balance) != null,
    rate: s?.interestRate != null,
    repayment: s?.repayment != null,
    changes: (s?.rateChanges.length ?? 0) > 0,
    years: Object.fromEntries(years.map((y) => [y.fyLabel, y.complete])) as Record<string, boolean>,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const found = s?.found ?? c?.found ?? [];
  const missing = (s ? ["balance", "interest rate", "repayment", "interest charged"] : ["balance", "interest by year"]).filter((f) => !found.includes(f));

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.liabilities.applyStatement(liabilityId, {
        documentId,
        ...(tick.balance && v.balance && v.asAt ? { balance: { value: Number(v.balance), asAt: v.asAt } } : {}),
        ...(tick.rate && v.rate && v.asAt ? { interestRate: { value: Number(v.rate), asAt: v.asAt } } : {}),
        ...(tick.repayment && v.repayment ? { repayment: { value: Number(v.repayment), frequency: s?.repaymentFrequency ?? null } } : {}),
        ...(tick.changes && s ? { rateChanges: s.rateChanges } : {}),
        interestYears: years.filter((y) => tick.years[y.fyLabel]).map((y) => ({ fyLabel: y.fyLabel, interest: y.interest })),
      });
      onApplied(
        r.changed.length
          ? `Updated: ${r.changed.join(", ")}.${r.olderThanRecorded ? " (This statement is older than the balance you had, so the balance was kept and the statement added to the history.)" : ""} The statement is filed with this loan.`
          : "Added to the loan's history. The statement is filed with this loan."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const row = (key: "balance" | "rate" | "repayment", label: string, input: JSX.Element, recorded: string) => (
    <tr>
      <td>
        <label className="checkbox-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={tick[key]} onChange={(e) => setTick({ ...tick, [key]: e.target.checked })} />
          {label}
        </label>
      </td>
      <td>{input}</td>
      <td className="cap-explain">{recorded}</td>
    </tr>
  );

  return (
    <div className="sub-form review-box">
      <h4 style={{ marginTop: 0 }}>What {name} says</h4>
      {s?.periodStart && s.periodEnd && (
        <p className="cap-explain" style={{ marginTop: 0 }}>
          Covers {formatDate(s.periodStart)} to {formatDate(s.periodEnd)}.
        </p>
      )}
      {older && (
        <div className="message-box info">
          This statement is older than the balance you have ({formatDate(cur.balanceAsAt)}), so the loan's figures stay as they are — its
          figures go into the history and the graphs.
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Take</th>
              <th>From the statement</th>
              <th>Recorded now</th>
            </tr>
          </thead>
          <tbody>
            {(s?.balance != null || c?.balance != null) &&
              row(
                "balance",
                "Balance",
                <div className="toolbar" style={{ flexWrap: "wrap" }}>
                  <input type="number" value={v.balance} onChange={(e) => setV({ ...v, balance: e.target.value })} style={{ maxWidth: 150 }} aria-label="Balance" />
                  <input type="date" value={v.asAt} onChange={(e) => setV({ ...v, asAt: e.target.value })} style={{ maxWidth: 170 }} aria-label="As at" />
                </div>,
                cur.balance != null ? `${formatCurrency(cur.balance)}${cur.balanceAsAt ? ` at ${formatDate(cur.balanceAsAt)}` : ""}` : "—"
              )}
            {s?.interestRate != null &&
              row(
                "rate",
                "Interest rate",
                <input type="number" step="0.01" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} style={{ maxWidth: 110 }} aria-label="Interest rate" />,
                cur.interestRate != null ? `${cur.interestRate}%` : "—"
              )}
            {s?.repayment != null &&
              row(
                "repayment",
                `Repayment${s.repaymentFrequency ? ` (${s.repaymentFrequency.toLowerCase()})` : ""}`,
                <input type="number" value={v.repayment} onChange={(e) => setV({ ...v, repayment: e.target.value })} style={{ maxWidth: 150 }} aria-label="Repayment" />,
                cur.repayment != null ? formatCurrency(cur.repayment) : "—"
              )}
          </tbody>
        </table>
      </div>
      {s && s.rateChanges.length > 0 && (
        <label className="checkbox-row">
          <input type="checkbox" checked={tick.changes} onChange={(e) => setTick({ ...tick, changes: e.target.checked })} />
          Rate changes for the graph: {s.rateChanges.map((r) => `${r.rate}% from ${formatDate(r.date)}`).join(", ")}
        </label>
      )}
      {s?.interestCharged != null && !s.financialYear && (
        <p className="cap-explain">Interest charged over this statement: {formatCurrency(s.interestCharged)} (not a whole financial year, so it isn't saved as the year's).</p>
      )}
      {years.map((y) => (
        <label key={y.fyLabel} className="checkbox-row">
          <input type="checkbox" checked={!!tick.years[y.fyLabel]} onChange={(e) => setTick({ ...tick, years: { ...tick.years, [y.fyLabel]: e.target.checked } })} />
          Interest charged in {y.fyLabel}: {formatCurrency(y.interest)}
          {!y.complete ? " — part of the year only" : ""}
          {proposal.recordedYears[y.fyLabel] != null ? ` (recorded now: ${formatCurrency(proposal.recordedYears[y.fyLabel])})` : ""}
        </label>
      ))}
      {missing.length > 0 && <p className="cap-explain">Not found in it: {missing.join(", ")}. Type those in on this page if you need them.</p>}
      <LayoutShare
        documentId={documentId}
        prompt={
          missing.length > 0
            ? "Help the app read this lender's statements: share this statement's layout — its wording, with every figure and name blanked out."
            : undefined
        }
      />
      {error && <div className="message-box error">{error}</div>}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="btn" onClick={apply} disabled={saving}>
          {saving ? "Saving…" : "Update the loan"}
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
