import { useEffect, useState } from "react";
import { api, Entity, NetWorthBreakdown, NetWorthSnapshot } from "../api/client.js";
import { formatCurrency, formatDate, confirmThenDelete } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

const CATEGORY_ROWS: Array<{ key: keyof NetWorthBreakdown; label: string; icon: string }> = [
  { key: "cash", label: "Cash", icon: "💵" },
  { key: "propertyValue", label: "Property", icon: "🏠" },
  { key: "investmentValue", label: "Shares / Investments", icon: "📈" },
  { key: "superValue", label: "Superannuation", icon: "💰" },
  { key: "vehicleValue", label: "Vehicles", icon: "🚗" },
  { key: "otherAssets", label: "Other assets", icon: "📦" },
];

const LIABILITY_ROWS: Array<{ key: keyof NetWorthBreakdown; label: string; icon: string }> = [
  { key: "mortgages", label: "Mortgages", icon: "🏦" },
  { key: "creditCards", label: "Credit cards", icon: "💳" },
  { key: "personalLoans", label: "Personal loans", icon: "📄" },
  { key: "vehicleLoans", label: "Vehicle & boat loans", icon: "🚤" },
  { key: "otherLiabilities", label: "Other liabilities", icon: "📦" },
];

export function NetWorth() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [live, setLive] = useState<NetWorthBreakdown | null>(null);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [asAtDate, setAsAtDate] = useState(new Date().toISOString().slice(0, 10));
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  function loadLive() {
    api.netWorth.preview(entityId || undefined).then(setLive);
  }
  function loadSnapshots() {
    api.netWorth.listSnapshots(entityId || undefined).then(setSnapshots);
  }

  useEffect(loadLive, [entityId]);
  useEffect(loadSnapshots, [entityId]);
  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  async function saveSnapshot() {
    if (!live) return;
    await api.netWorth.saveSnapshot({
      asAtDate: new Date(asAtDate).toISOString(),
      entityId: entityId || null,
      ...live,
    });
    loadSnapshots();
  }

  async function removeSnapshot(id: string) {
    if (!(await confirmThenDelete("Delete this saved snapshot?", () => api.netWorth.removeSnapshot(id)))) return;
    loadSnapshots();
  }

  const snapA = snapshots.find((s) => s.id === compareA);
  const snapB = snapshots.find((s) => s.id === compareB);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Net Worth <HelpLink topic="net-worth" /></h2>
          <p>{entityId ? "This entity's" : "Consolidated"} balance sheet, and how it's changed over time.</p>
        </div>
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ width: 220 }}>
          <option value="">All entities (consolidated)</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {live && (
        <>
          <div className="grid grid-3">
            <div className="stat-tile">
              <div className="label">Total assets</div>
              <div className="value">{formatCurrency(live.totalAssets)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Total liabilities</div>
              <div className="value">{formatCurrency(live.totalLiabilities)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Net position</div>
              <div className="value">{formatCurrency(live.netPosition)}</div>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Assets</h3>
              <table>
                <tbody>
                  {CATEGORY_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td>
                        {r.icon} {r.label}
                      </td>
                      <td>{formatCurrency(live[r.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Liabilities</h3>
              <table>
                <tbody>
                  {LIABILITY_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td>
                        {r.icon} {r.label}
                      </td>
                      <td>{formatCurrency(live[r.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Save a snapshot</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Records the figures above against a date, permanently — a later change to your assets or liabilities
              never rewrites a snapshot you've already saved.
            </p>
            <div className="toolbar">
              <input type="date" value={asAtDate} onChange={(e) => setAsAtDate(e.target.value)} style={{ width: 200 }} />
              <button className="btn" onClick={saveSnapshot}>
                Save snapshot
              </button>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>History</h3>
        {snapshots.length === 0 ? (
          <p className="empty-state">No snapshots saved yet.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total assets</th>
                  <th>Total liabilities</th>
                  <th>Net position</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.asAtDate)}</td>
                    <td>{formatCurrency(s.totalAssets)}</td>
                    <td>{formatCurrency(s.totalLiabilities)}</td>
                    <td>{formatCurrency(s.netPosition)}</td>
                    <td>
                      <button className="btn secondary" onClick={() => removeSnapshot(s.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {snapshots.length >= 2 && (
              <div style={{ marginTop: 16 }}>
                <h4>Compare two snapshots</h4>
                <div className="grid grid-2">
                  <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                    <option value="">— From —</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDate(s.asAtDate)}
                      </option>
                    ))}
                  </select>
                  <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                    <option value="">— To —</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDate(s.asAtDate)}
                      </option>
                    ))}
                  </select>
                </div>
                {snapA && snapB && (
                  <table style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th></th>
                        <th>{formatDate(snapA.asAtDate)}</th>
                        <th>{formatDate(snapB.asAtDate)}</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Total assets</td>
                        <td>{formatCurrency(snapA.totalAssets)}</td>
                        <td>{formatCurrency(snapB.totalAssets)}</td>
                        <td>{formatCurrency(snapB.totalAssets - snapA.totalAssets)}</td>
                      </tr>
                      <tr>
                        <td>Total liabilities</td>
                        <td>{formatCurrency(snapA.totalLiabilities)}</td>
                        <td>{formatCurrency(snapB.totalLiabilities)}</td>
                        <td>{formatCurrency(snapB.totalLiabilities - snapA.totalLiabilities)}</td>
                      </tr>
                      <tr>
                        <td>Net position</td>
                        <td>{formatCurrency(snapA.netPosition)}</td>
                        <td>{formatCurrency(snapB.netPosition)}</td>
                        <td>{formatCurrency(snapB.netPosition - snapA.netPosition)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
