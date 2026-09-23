import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { TfnField } from "../components/TfnField.js";
import { entityTypeLabel, formatCurrency, formatDate, humanize } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { SmsfPanel } from "../components/SmsfPanel.js";
import { UnitholdersPanel } from "../components/UnitholdersPanel.js";

const ASSET_TYPE_ICONS: Record<string, string> = {
  PROPERTY: "🏠",
  COMMERCIAL_PROPERTY: "🏭",
  SHARES: "📈",
  MANAGED_FUND: "📈",
  VEHICLE: "🚗",
  EQUIPMENT: "🛠️",
  SUPERANNUATION: "💰",
  CASH: "💵",
  OTHER: "📦",
  INVESTMENT_HOLDINGS: "📈",
  UNIT_TRUST_UNITS: "🧩",
};

const POSITION_LABELS: Record<string, string> = {
  INVESTMENT_HOLDINGS: "Shares, ETFs & crypto (tracked)",
  UNIT_TRUST_UNITS: "Units in unit trusts",
  SUPERANNUATION: "Super",
};

/** This entity's share (0–1) of one of its own records that may be split with others. */
function ownShare(
  record: { entityId: string; ownerships?: Array<{ ownerEntityId: string; ownershipPercent: number; endDate?: string | null }> },
  entityId: string
): number {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (record.ownerships ?? []).filter((o) => !o.endDate || o.endDate.slice(0, 10) >= today);
  if (rows.length === 0) return 1;
  const listed = rows.filter((o) => o.ownerEntityId === entityId).reduce((s, o) => s + o.ownershipPercent, 0);
  const total = rows.reduce((s, o) => s + o.ownershipPercent, 0);
  return (listed > 0 ? listed : Math.max(0, 100 - total)) / 100;
}

export function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [relType, setRelType] = useState("OWNS");
  const [relTarget, setRelTarget] = useState("");

  function load() {
    if (!id) return;
    api.entities.get(id).then(setEntity).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setAllEntities);
  }, []);

  if (!entity) {
    if (loadError) return <LoadFailed message={loadError} backTo="/entities" backLabel="Back to entities" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function addRelationship() {
    if (!id || !relTarget) return;
    await api.entities.addRelationship({ fromEntityId: id, toEntityId: relTarget, relationshipType: relType });
    load();
  }

  const fp = entity.financialPosition;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{entity.name}</h2>
          <p>{entityTypeLabel(entity.entityType)}</p>
        </div>
      </div>

      {entity.personalFor && (
        <div className="message-box info">
          This is <Link to={`/people/${entity.personalFor.id}`}>{entity.personalFor.name}</Link>'s personal entity —
          everything they hold in their own name. Their tax file number, family and ID are on their page.
        </div>
      )}

      {entity.entityType === "SMSF" && <SmsfPanel fundId={entity.id} />}
      {entity.entityType === "UNIT_TRUST" && (
        <UnitholdersPanel trust={entity} netAssets={entity.financialPosition?.netAssets ?? 0} entities={allEntities} onChange={load} />
      )}

      {(entity.heldForLoans ?? []).length > 0 && (
        <div className="message-box info">
          Holds the title to the property for{" "}
          {entity.heldForLoans!.map((l, i) => (
            <span key={l.id}>
              {i > 0 ? ", " : ""}
              <Link to={`/liabilities/${l.id}`}>{l.name}</Link> (owed by <Link to={`/entities/${l.entity.id}`}>{l.entity.name}</Link>)
            </span>
          ))}
          . The property belongs to the fund; this trust only holds it until the loan is repaid.
        </div>
      )}

      {fp && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Financial position</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {entity.name}'s own balance sheet: what it owns and owes, at its share of anything shared, plus its share
            of any unit trust it holds units in. The whole family's figures are on the Dashboard and Net Worth.
          </p>
          <div className="grid grid-3">
            <div className="stat-tile">
              <div className="label">Total assets</div>
              <div className="value">{formatCurrency(fp.totalAssets)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Total liabilities</div>
              <div className="value">{formatCurrency(fp.totalLiabilities)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Net assets</div>
              <div className="value">{formatCurrency(fp.netAssets)}</div>
            </div>
          </div>
          {Object.keys(fp.byAssetType).length > 0 && (
            <table style={{ marginTop: 16 }}>
              <tbody>
                {Object.entries(fp.byAssetType).map(([type, value]) => (
                  <tr key={type}>
                    <td>
                      {ASSET_TYPE_ICONS[type] || "📦"} {POSITION_LABELS[type] ?? humanize(type)}
                    </td>
                    <td>{formatCurrency(value)}</td>
                  </tr>
                ))}
                {fp.cash > 0 && (
                  <tr>
                    <td>💵 Cash (bank accounts)</td>
                    <td>{formatCurrency(fp.cash)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {(fp.unitHoldings ?? []).length > 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Units:{" "}
              {fp.unitHoldings!.map((u, i) => (
                <span key={u.trustId}>
                  {i > 0 ? ", " : ""}
                  {u.percent}% of <Link to={`/entities/${u.trustId}`}>{u.trustName}</Link> ({formatCurrency(u.value)})
                </span>
              ))}
              . Worth their share of the trust's net assets.
            </p>
          )}
          {(fp.sharedItems ?? 0) > 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {fp.sharedItems} shared {fp.sharedItems === 1 ? "item counts" : "items count"} at {entity.name}'s share, not the full value.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Details</h3>
          <table>
            <tbody>
              <tr>
                <td>ABN</td>
                <td>{entity.abn || "—"}</td>
              </tr>
              <tr>
                <td>ACN</td>
                <td>{entity.acn || "—"}</td>
              </tr>
              {!entity.personalFor && (
                <tr>
                  <td>TFN</td>
                  <td>
                    <TfnField owner="entity" id={entity.id} hasTfn={entity.hasTfn} tfnMasked={entity.tfnMasked} onSaved={load} />
                  </td>
                </tr>
              )}
              <tr>
                <td>Established</td>
                <td>{formatDate(entity.establishmentDate)}</td>
              </tr>
              <tr>
                <td>Notes</td>
                <td>{entity.notes || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>People</h3>
          {(entity.personRelationships || []).length === 0 ? (
            <p className="empty-state">No people linked yet. Add a relationship from a person's page.</p>
          ) : (
            (entity.personRelationships || []).map((r) => (
              <div className="entity-graph-item" key={r.id}>
                <Link to={`/people/${r.personId}`}>{r.person?.name}</Link> — {humanize(r.relationshipType).toLowerCase()}
                {r.ownershipPercent !== null && r.ownershipPercent !== undefined ? ` (${r.ownershipPercent}%)` : ""}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Assets</h3>
          {(entity.properties || []).length === 0 &&
          (entity.commercialProperties || []).length === 0 &&
          (entity.investmentAccounts || []).length === 0 &&
          (entity.assets || []).filter((a) => a.assetType !== "PROPERTY" && a.assetType !== "COMMERCIAL_PROPERTY").length ===
            0 &&
          (entity.sharedAssets || []).length === 0 &&
          (entity.accounts || []).length === 0 ? (
            <p className="empty-state">No assets recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(entity.properties || []).map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  🏠 <Link to={`/properties/${p.id}`}>{p.asset?.name}</Link> — {formatCurrency(p.asset?.currentValue)}
                  <ShareNote record={(entity.assets || []).find((a) => a.id === p.assetId)} entityId={entity.id} />
                </li>
              ))}
              {(entity.commercialProperties || []).map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  🏭 <Link to={`/commercial-properties/${p.id}`}>{p.name}</Link> — {formatCurrency(p.asset?.currentValue)}
                  <ShareNote record={(entity.assets || []).find((a) => a.id === p.assetId)} entityId={entity.id} />
                </li>
              ))}
              {(entity.investmentAccounts || []).map((a) => (
                <li key={a.id} style={{ marginBottom: 6 }}>
                  📈 <Link to={`/investments/${a.id}`}>{a.institution}</Link> ({a._count?.parcels ?? 0} holdings)
                </li>
              ))}
              {(entity.assets || [])
                .filter((a) => a.assetType !== "PROPERTY" && a.assetType !== "COMMERCIAL_PROPERTY")
                .map((a) => (
                  <li key={a.id} style={{ marginBottom: 6 }}>
                    {ASSET_TYPE_ICONS[a.assetType] || "📦"} <Link to={`/assets/${a.id}`}>{a.name}</Link> — {formatCurrency(a.currentValue)}
                    <ShareNote record={a} entityId={entity.id} />
                  </li>
                ))}
              {(entity.sharedAssets || []).map((a) => (
                <li key={a.id} style={{ marginBottom: 6 }}>
                  {ASSET_TYPE_ICONS[a.assetType] || "📦"}{" "}
                  <Link to={a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : `/assets/${a.id}`}>
                    {a.name}
                  </Link>{" "}
                  — {Math.round(a.sharePercent * 100) / 100}% share of {formatCurrency(a.currentValue)}
                </li>
              ))}
              {(entity.accounts || []).map((a) => (
                <li key={a.id} style={{ marginBottom: 6 }}>
                  💵 <Link to={`/banking/${a.id}`}>
                    {a.institution} — {a.accountName}
                  </Link>{" "}
                  — {formatCurrency(a.currentBalance)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Liabilities</h3>
          {(entity.liabilities || []).length === 0 && (entity.sharedLiabilities || []).length === 0 ? (
            <p className="empty-state">No liabilities recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(entity.liabilities || []).map((l) => (
                <li key={l.id} style={{ marginBottom: 6 }}>
                  🏦 <Link to={`/liabilities/${l.id}`}>{l.name}</Link> — {formatCurrency(l.currentBalance)}
                  <ShareNote record={l} entityId={entity.id} />
                </li>
              ))}
              {(entity.sharedLiabilities || []).map((l) => (
                <li key={l.id} style={{ marginBottom: 6 }}>
                  🏦 <Link to={`/liabilities/${l.id}`}>{l.name}</Link> — {Math.round(l.sharePercent * 100) / 100}% share of{" "}
                  {formatCurrency(l.currentBalance)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Relationships to other entities</h3>
        {(entity.relationshipsFrom || []).map((r) => (
          <div className="entity-graph-item" key={r.id}>
            <strong>{entity.name}</strong> {humanize(r.relationshipType).toLowerCase()}{" "}
            <Link to={`/entities/${r.toEntityId}`}>{r.toEntity?.name}</Link>
          </div>
        ))}
        {(entity.relationshipsTo || [])
          // A unit trust's holders are listed in Unitholders above.
          .filter((r) => !(entity.entityType === "UNIT_TRUST" && r.relationshipType === "UNITHOLDER"))
          .map((r) => (
          <div className="entity-graph-item" key={r.id}>
            <Link to={`/entities/${r.fromEntityId}`}>{r.fromEntity?.name}</Link>{" "}
            {humanize(r.relationshipType).toLowerCase()} <strong>{entity.name}</strong>
          </div>
        ))}
        {(entity.relationshipsFrom || []).length === 0 &&
          (entity.relationshipsTo || []).filter((r) => !(entity.entityType === "UNIT_TRUST" && r.relationshipType === "UNITHOLDER"))
            .length === 0 && (
          <p className="empty-state">No entity-to-entity relationships yet.</p>
        )}

        <label>Relationship type</label>
        <input value={relType} onChange={(e) => setRelType(e.target.value)} placeholder="OWNS, TRUSTEE_OF, SUBSIDIARY_OF…" />
        <label>Target entity</label>
        <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
          <option value="">— Select —</option>
          {allEntities
            .filter((e) => e.id !== id)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={addRelationship}>
            Add relationship
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        {(entity.documents || []).length === 0 ? (
          <p className="empty-state">No documents linked yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(entity.documents || []).map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                  </td>
                  <td>{d.documentType || "—"}</td>
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
      {!entity.personalFor && (
        <DeleteSection
          title="Delete this entity"
          note="Only possible once nothing is recorded against it — assets, accounts, loans, documents and so on. If anything is, you'll be told what to remove or move first."
          question={`Delete ${entity.name}? This can't be undone.`}
          action={() => api.entities.remove(entity.id)}
          redirectTo="/entities"
        />
      )}
    </div>
  );
}

function ShareNote({ record, entityId }: { record?: Parameters<typeof ownShare>[0]; entityId: string }) {
  if (!record) return null;
  const share = ownShare(record, entityId);
  if (share >= 1) return null;
  return <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {Math.round(share * 10000) / 100}% share</span>;
}
