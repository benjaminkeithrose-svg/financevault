import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Entity } from "../api/client.js";
import { TfnField } from "../components/TfnField.js";
import { entityTypeLabel, formatCurrency, formatDate, humanize } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { SmsfPanel } from "../components/SmsfPanel.js";

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
};

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
            This is {entity.name}'s own balance sheet — calculated only from assets, accounts and liabilities owned
            directly by this entity. It is not the personal net worth of any related person.
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
                      {ASSET_TYPE_ICONS[type] || "📦"} {humanize(type)}
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
            0 ? (
            <p className="empty-state">No assets recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(entity.properties || []).map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  🏠 <Link to={`/properties/${p.id}`}>{p.asset?.name}</Link> — {formatCurrency(p.asset?.currentValue)}
                </li>
              ))}
              {(entity.commercialProperties || []).map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  🏭 <Link to={`/commercial-properties/${p.id}`}>{p.name}</Link> — {formatCurrency(p.asset?.currentValue)}
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
                    {ASSET_TYPE_ICONS[a.assetType] || "📦"} {a.name} — {formatCurrency(a.currentValue)}
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
          {(entity.liabilities || []).length === 0 ? (
            <p className="empty-state">No liabilities recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(entity.liabilities || []).map((l) => (
                <li key={l.id} style={{ marginBottom: 6 }}>
                  🏦 <Link to={`/liabilities/${l.id}`}>{l.name}</Link> — {formatCurrency(l.currentBalance)}
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
        {(entity.relationshipsTo || []).map((r) => (
          <div className="entity-graph-item" key={r.id}>
            <Link to={`/entities/${r.fromEntityId}`}>{r.fromEntity?.name}</Link>{" "}
            {humanize(r.relationshipType).toLowerCase()} <strong>{entity.name}</strong>
          </div>
        ))}
        {(entity.relationshipsFrom || []).length === 0 && (entity.relationshipsTo || []).length === 0 && (
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
