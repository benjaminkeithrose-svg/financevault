import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, DashboardSummary, Entity } from "../api/client.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.entities.list().then(setEntities).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .dashboard(entityId || undefined)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [entityId]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!summary) return <div className="empty-state">Loading…</div>;

  const { documents, financialSnapshot, tax, consolidated, upcomingLeaseEvents } = summary;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Your financial world at a glance. Nothing here replaces advice from a registered professional.</p>
        </div>
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ width: 220 }}>
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-4">
        <div className="stat-tile">
          <div className="label">Total Assets</div>
          <div className="value">{formatCurrency(financialSnapshot.totalAssets)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total Liabilities</div>
          <div className="value">{formatCurrency(financialSnapshot.totalLiabilities)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Net Position</div>
          <div className="value">{formatCurrency(financialSnapshot.netPosition)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Cash</div>
          <div className="value">{formatCurrency(financialSnapshot.cash)}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="label">Property Value</div>
          <div className="value">{formatCurrency(financialSnapshot.propertyValue)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Investments</div>
          <div className="value">{formatCurrency(financialSnapshot.investmentValue)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Superannuation</div>
          <div className="value">{formatCurrency(financialSnapshot.superannuation)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Documents</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ marginBottom: 8 }}>
              <Link to="/documents?reviewStatus=PENDING_CLASSIFICATION">
                {documents.pendingClassification} awaiting classification
              </Link>
            </li>
            <li style={{ marginBottom: 8 }}>
              <Link to="/documents?reviewStatus=NEEDS_CONFIRMATION">
                {documents.needsConfirmation} requiring confirmation
              </Link>
            </li>
            <li style={{ marginBottom: 8 }}>
              <Link to="/documents?reviewStatus=MISSING_INFORMATION">
                {documents.missingInformation} with missing information
              </Link>
            </li>
          </ul>
          <h4>Upcoming renewals</h4>
          {documents.upcomingRenewals.length === 0 ? (
            <p className="empty-state">Nothing renewing in the next 90 days.</p>
          ) : (
            <table>
              <tbody>
                {documents.upcomingRenewals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/documents/${d.id}`}>{d.documentType || d.originalFilename}</Link>
                    </td>
                    <td>{formatDate(d.renewalDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Tax — FY {tax.financialYearLabel}</h3>
          <table>
            <tbody>
              <tr>
                <td>Income recorded</td>
                <td>{formatCurrency(tax.incomeRecorded)}</td>
              </tr>
              <tr>
                <td>Expenses recorded</td>
                <td>{formatCurrency(tax.expensesRecorded)}</td>
              </tr>
              <tr>
                <td>Needs review</td>
                <td>{tax.needsReviewCount}</td>
              </tr>
              <tr>
                <td>Unclassified transactions</td>
                <td>{tax.unclassifiedTransactions}</td>
              </tr>
            </tbody>
          </table>
          <p className="empty-state" style={{ textAlign: "left", padding: "8px 0" }}>
            Figures are <strong>Recorded</strong> from your own data, not tax advice. Confirm with your accountant
            before lodging.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Upcoming lease events</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Active tenancies with a lease expiry in the next 180 days, or a rent review due in the next 90.
        </p>
        {upcomingLeaseEvents.length === 0 ? (
          <p className="empty-state">Nothing due soon.</p>
        ) : (
          <table>
            <tbody>
              {upcomingLeaseEvents.map((e) => (
                <tr key={`${e.tenancyId}-${e.eventType}`}>
                  <td>
                    <Link to={`/commercial-properties/${e.commercialPropertyId}`}>{e.commercialPropertyName}</Link> —{" "}
                    {e.tenantName}
                  </td>
                  <td>{e.eventType === "EXPIRY" ? "Lease expiry" : "Rent review"}</td>
                  <td>{formatDate(e.eventDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!entityId && consolidated.byEntity.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Consolidated position by entity</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {consolidated.note} Each asset belongs to exactly one entity below — nothing here is double-counted.
          </p>
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Type</th>
                <th>Assets</th>
                <th>Liabilities</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {consolidated.byEntity.map((e) => (
                <tr key={e.entityId}>
                  <td>
                    <Link to={`/entities/${e.entityId}`}>{e.entityName}</Link>
                  </td>
                  <td>{humanize(e.entityType)}</td>
                  <td>{formatCurrency(e.totalAssets)}</td>
                  <td>{formatCurrency(e.totalLiabilities)}</td>
                  <td>{formatCurrency(e.netAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recently imported</h3>
        {documents.recentDocuments.length === 0 ? (
          <p className="empty-state">No documents yet. Head to the Inbox to upload your first one.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.recentDocuments.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                  </td>
                  <td>{d.documentType || "—"}</td>
                  <td>{d.entity?.name || "—"}</td>
                  <td>
                    <span className={`badge status-${d.reviewStatus}`}>{humanize(d.reviewStatus)}</span>
                  </td>
                  <td>{formatDate(d.uploadDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
