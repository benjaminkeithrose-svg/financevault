import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  DebtSummaryRow,
  FinancialYear,
  InvestmentPortfolioRow,
  PropertyPerformanceRow,
  TaxSummaryRow,
} from "../api/client.js";
import { formatCurrency } from "../utils.js";

const TABS = ["Property Performance", "Investment Portfolio", "Tax Summary", "Debt Summary"] as const;
type Tab = (typeof TABS)[number];

function pct(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

export function Reports() {
  const [tab, setTab] = useState<Tab>("Property Performance");

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Reports</h2>
          <p>Assembled from your own records. Not financial or tax advice.</p>
        </div>
      </div>

      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t} className={`btn ${tab === t ? "" : "secondary"}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Property Performance" && <PropertyPerformance />}
      {tab === "Investment Portfolio" && <InvestmentPortfolio />}
      {tab === "Tax Summary" && <TaxSummary />}
      {tab === "Debt Summary" && <DebtSummary />}
    </div>
  );
}

function PropertyPerformance() {
  const [rows, setRows] = useState<PropertyPerformanceRow[] | null>(null);

  useEffect(() => {
    api.reports.propertyPerformance().then((r) => setRows(r.rows));
  }, []);

  if (!rows) return <div className="empty-state">Loading…</div>;

  return (
    <div className="card">
      {rows.length === 0 ? (
        <p className="empty-state">No residential properties recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Entity</th>
              <th>Purchase price</th>
              <th>Current value</th>
              <th>Equity</th>
              <th>Gross rent</th>
              <th>Expenses</th>
              <th>Net cash flow</th>
              <th>Est. yield</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/properties/${r.id}`}>{r.name}</Link>
                </td>
                <td>{r.entityName}</td>
                <td>{formatCurrency(r.purchasePrice)}</td>
                <td>{formatCurrency(r.currentValue)}</td>
                <td>{formatCurrency(r.equity)}</td>
                <td>{formatCurrency(r.grossRent)}</td>
                <td>{formatCurrency(r.expenses)}</td>
                <td>{formatCurrency(r.netCashFlow)}</td>
                <td>{pct(r.estimatedYield)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InvestmentPortfolio() {
  const [data, setData] = useState<{ rows: InvestmentPortfolioRow[]; totals: { totalCostBase: number; realisedGainLoss: number }; note: string } | null>(
    null
  );

  useEffect(() => {
    api.reports.investmentPortfolio().then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading…</div>;

  return (
    <div className="card">
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{data.note}</p>
      <div className="grid grid-2">
        <div className="stat-tile">
          <div className="label">Total cost base</div>
          <div className="value">{formatCurrency(data.totals.totalCostBase)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Realised gain / loss</div>
          <div className="value">{formatCurrency(data.totals.realisedGainLoss)}</div>
        </div>
      </div>
      {data.rows.length === 0 ? (
        <p className="empty-state">No investment accounts recorded yet.</p>
      ) : (
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Entity</th>
              <th>Type</th>
              <th>Holdings</th>
              <th>Cost base</th>
              <th>Realised gain / loss</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/investments/${r.id}`}>{r.institution}</Link>
                </td>
                <td>{r.entityName}</td>
                <td>{r.accountType}</td>
                <td>{r.holdingCount}</td>
                <td>{formatCurrency(r.costBase)}</td>
                <td>{formatCurrency(r.realisedGainLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TaxSummary() {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearId] = useState("");
  const [rows, setRows] = useState<TaxSummaryRow[] | null>(null);

  useEffect(() => {
    api.financialYears.list().then(setFinancialYears);
  }, []);

  useEffect(() => {
    api.reports.taxSummary(financialYearId || undefined).then((r) => setRows(r.rows));
  }, [financialYearId]);

  return (
    <div className="card">
      <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} style={{ width: 200, marginBottom: 12 }}>
        <option value="">All financial years</option>
        {financialYears.map((y) => (
          <option key={y.id} value={y.id}>
            {y.label}
          </option>
        ))}
      </select>
      {!rows ? (
        <p className="empty-state">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">No tax records for this selection.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Income</th>
              <th>Expenses</th>
              <th>Capital gains</th>
              <th>Capital losses</th>
              <th>Needs review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entityId}>
                <td>
                  <Link to={`/entities/${r.entityId}`}>{r.entityName}</Link>
                </td>
                <td>{formatCurrency(r.income)}</td>
                <td>{formatCurrency(r.expenses)}</td>
                <td>{formatCurrency(r.capitalGains)}</td>
                <td>{formatCurrency(r.capitalLosses)}</td>
                <td>{r.needsReview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DebtSummary() {
  const [data, setData] = useState<{ rows: DebtSummaryRow[]; totalDebt: number } | null>(null);

  useEffect(() => {
    api.reports.debtSummary().then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading…</div>;

  return (
    <div className="card">
      <div className="stat-tile" style={{ maxWidth: 220, marginBottom: 16 }}>
        <div className="label">Total debt</div>
        <div className="value">{formatCurrency(data.totalDebt)}</div>
      </div>
      {data.rows.length === 0 ? (
        <p className="empty-state">No liabilities recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Loan</th>
              <th>Entity</th>
              <th>Lender</th>
              <th>Balance</th>
              <th>Rate</th>
              <th>Repayment</th>
              <th>Security</th>
              <th>LVR</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/liabilities/${r.id}`}>{r.name}</Link>
                </td>
                <td>{r.entityName}</td>
                <td>{r.lender || "—"}</td>
                <td>{formatCurrency(r.currentBalance)}</td>
                <td>{r.interestRate ? `${r.interestRate}%` : "—"}</td>
                <td>{formatCurrency(r.repaymentAmount)}</td>
                <td>{r.securedAsset || "—"}</td>
                <td>{pct(r.lvr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
