import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  CapitalGainsReport,
  DebtSummary as DebtSummaryData,
  FinancialYear,
  InvestmentPortfolioRow,
  PropertyPerformanceRow,
  TaxSummaryRow,
} from "../api/client.js";
import { formatCurrency, formatDate, liabilityTypeLabel } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

const TABS = ["Property Performance", "Investment Portfolio", "Capital Gains", "Tax Summary", "Debt Summary"] as const;
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
          <h2>Reports <HelpLink topic="tax" /></h2>
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
      {tab === "Capital Gains" && <CapitalGains />}
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
  const [data, setData] = useState<Awaited<ReturnType<typeof api.reports.investmentPortfolio>> | null>(null);

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
          <div className="label">Market value</div>
          <div className="value">{formatCurrency(data.totals.totalMarketValue)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Unrealised</div>
          <div className="value">
            {data.totals.totalUnrealisedGain === null ? "—" : formatCurrency(data.totals.totalUnrealisedGain)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="label">Realised (net)</div>
          <div className="value">{formatCurrency(data.totals.realisedNetGain)}</div>
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
              <th>Market value</th>
              <th>Unrealised</th>
              <th>Realised (net of CGT discount)</th>
              <th>Franking credits</th>
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
                <td>{r.unpricedCount > 0 ? `${formatCurrency(r.marketValue)} (${r.unpricedCount} unpriced)` : formatCurrency(r.marketValue)}</td>
                <td>{r.unrealisedGain === null ? "—" : formatCurrency(r.unrealisedGain)}</td>
                <td>{formatCurrency(r.realisedNetGain)}</td>
                <td>{formatCurrency(r.frankingCredits)}</td>
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
              <th>Share sales (calculated net gain)</th>
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
                <td>{financialYearId ? formatCurrency(r.calculatedCapitalGain) : "Choose a year"}</td>
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
  const [data, setData] = useState<DebtSummaryData | null>(null);

  useEffect(() => {
    api.reports.debtSummary().then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading…</div>;

  return (
    <div className="card">
      <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: 13 }}>
        Everything a lender asks about when you apply for a new loan: what you owe, your credit card limits and what your
        debts cost each month. <HelpLink topic="borrowing" />
      </p>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <div className="label">Total debt</div>
          <div className="value">{formatCurrency(data.totalDebt)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Credit card limits</div>
          <div className="value">{formatCurrency(data.totalCreditLimits)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Repayments a month</div>
          <div className="value">{formatCurrency(data.totalMonthlyRepayments)}</div>
        </div>
      </div>
      {(data.cardsWithoutLimit > 0 || data.loansWithoutRepayment > 0) && (
        <div className="message-box warning">
          {data.cardsWithoutLimit > 0 &&
            `${data.cardsWithoutLimit} credit card${data.cardsWithoutLimit === 1 ? " has" : "s have"} no limit recorded. `}
          {data.loansWithoutRepayment > 0 &&
            `${data.loansWithoutRepayment} loan${data.loansWithoutRepayment === 1 ? " has" : "s have"} no repayment amount recorded, so ${data.loansWithoutRepayment === 1 ? "it isn't" : "they aren't"} in the monthly total. `}
          Open each one to add it.
        </div>
      )}
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Lenders count a credit card at its limit, even if it's paid off — reducing or closing unused cards can increase how
        much you can borrow.
      </p>
      {data.rows.length === 0 ? (
        <p className="empty-state">No liabilities recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Debt</th>
              <th>Type</th>
              <th>Entity</th>
              <th>Lender</th>
              <th>Balance</th>
              <th>Limit</th>
              <th>Rate</th>
              <th>A month</th>
              <th>Secured by / for</th>
              <th>LVR</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/liabilities/${r.id}`}>{r.name}</Link>
                </td>
                <td>{liabilityTypeLabel(r.liabilityType)}</td>
                <td>{r.entityName}</td>
                <td>{r.lender || "—"}</td>
                <td>{formatCurrency(r.currentBalance)}</td>
                <td>{r.liabilityType === "CREDIT_CARD" ? formatCurrency(r.creditLimit) : "—"}</td>
                <td>{r.interestRate ? `${r.interestRate}%` : "—"}</td>
                <td>{r.monthlyRepayment !== null ? formatCurrency(r.monthlyRepayment) : "—"}</td>
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

const DISCOUNT_LABEL = { YES: "Yes", NO: "No — held under 12 months", PART: "Part", NONE: "—" } as const;

function CapitalGains() {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearId] = useState("");
  const [data, setData] = useState<CapitalGainsReport | null>(null);

  useEffect(() => {
    api.financialYears.list().then(setFinancialYears);
  }, []);

  useEffect(() => {
    if (!financialYearId) return;
    api.reports.capitalGains(financialYearId).then(setData).catch(() => setData(null));
  }, [financialYearId]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Capital gains <HelpLink topic="capital-gains" /></h3>
      <label>Financial year</label>
      <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)}>
        <option value="">Choose a financial year…</option>
        {financialYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {fy.label}
          </option>
        ))}
      </select>

      {data && (
        <>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <div className="label">Gross gains</div>
              <div className="value">{formatCurrency(data.totals.totalGrossGains)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Losses</div>
              <div className="value">{formatCurrency(data.totals.totalLosses)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">CGT discount</div>
              <div className="value">{formatCurrency(data.totals.totalDiscount)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Net capital gain</div>
              <div className="value">{formatCurrency(data.totals.netCapitalGain)}</div>
            </div>
          </div>
          {data.totals.lossCarriedForward > 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {formatCurrency(data.totals.lossCarriedForward)} of losses are more than this year's gains and carry
              forward to a later year.
            </p>
          )}

          {data.byEntity.length > 0 && (
            <>
              <h3>By entity</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
                Each entity is worked out on its own — one entity's losses can't reduce another's gains.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Gains</th>
                      <th>Losses used</th>
                      <th>Discount</th>
                      <th>Net capital gain</th>
                      <th>Loss carried forward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byEntity.map((e) => (
                      <tr key={e.entityId}>
                        <td>{e.entityName}</td>
                        <td>{formatCurrency(e.totalGains)}</td>
                        <td>{formatCurrency(e.lossesApplied)}</td>
                        <td>
                          {formatCurrency(e.discountAmount)}
                          {e.discountRate > 0 && (
                            <span style={{ color: "var(--text-muted)" }}> ({Math.round(e.discountRate * 1000) / 10}%)</span>
                          )}
                        </td>
                        <td>{formatCurrency(e.netCapitalGain)}</td>
                        <td>{formatCurrency(e.lossCarriedForward)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3>Disposals ({data.totals.disposalCount})</h3>
          {data.rows.length === 0 ? (
            <p className="empty-state">No sales recorded in this year.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Code</th>
                  <th>Entity</th>
                  <th>Units</th>
                  <th>Proceeds</th>
                  <th>Cost base</th>
                  <th>Gain / loss</th>
                  <th>12-month discount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.disposalDate)}</td>
                    <td>{r.code}</td>
                    <td>{r.entityName}</td>
                    <td>{r.quantity}</td>
                    <td>{formatCurrency(r.proceeds)}</td>
                    <td>{formatCurrency(r.costBase)}</td>
                    <td>{formatCurrency(r.grossGain)}</td>
                    <td>{DISCOUNT_LABEL[r.discount]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Dividends and distributions</h3>
          {data.dividends.length === 0 ? (
            <p className="empty-state">No dividends recorded in this year.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Code</th>
                    <th>Entity</th>
                    <th>Franked</th>
                    <th>Unfranked</th>
                    <th>Franking credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dividends.map((d) => (
                    <tr key={d.id}>
                      <td>{formatDate(d.paymentDate)}</td>
                      <td>{d.code}</td>
                      <td>{d.entityName}</td>
                      <td>{formatCurrency(d.frankedAmount)}</td>
                      <td>{formatCurrency(d.unfrankedAmount)}</td>
                      <td>{formatCurrency(d.frankingCredit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Dividend income {formatCurrency(data.totals.dividendIncome)} · franking credits{" "}
                {formatCurrency(data.totals.frankingCredits)}
              </p>
            </>
          )}

          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{data.note}</p>
        </>
      )}
    </div>
  );
}
