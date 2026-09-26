import { useEffect, useState } from "react";
import { MissingFlags } from "../components/MissingFlags.js";
import { useParams } from "react-router-dom";
import { api, Entity, Liability, Property } from "../api/client.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";
import { SoldPanel } from "../components/SoldPanel.js";
import { InsurancePanel } from "../components/InsurancePanel.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { ItemsPanel } from "../components/ItemsPanel.js";
import { UsableEquityCard } from "../components/UsableEquityCard.js";
import { PropertyCostsCard } from "../components/PropertyCostsCard.js";
import { formatCurrency, formatDate, humanize } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.entities.list().then(setEntities);
  }, []);

  function load() {
    if (!id) return;
    api.properties.get(id).then((p) => {
      setProperty(p);
      setForm({
        name: p.asset?.name || "",
        address: p.address,
        state: p.state || "",
        purchaseDate: toDateInput(p.purchaseDate),
        settlementDate: toDateInput(p.settlementDate),
        purchasePrice: p.purchasePrice?.toString() || "",
        currentValue: p.asset?.currentValue?.toString() || "",
        tenantInfo: p.tenantInfo || "",
        propertyManager: p.propertyManager || "",
        weeklyRent: p.weeklyRent?.toString() || "",
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);

  if (!property) {
    if (loadError) return <LoadFailed message={loadError} backTo="/properties" backLabel="Back to properties" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.properties.update(id, {
        name: form.name,
        address: form.address,
        state: form.state || null,
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
        settlementDate: form.settlementDate ? new Date(form.settlementDate).toISOString() : null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
        currentValue: form.currentValue ? Number(form.currentValue) : null,
        tenantInfo: form.tenantInfo || null,
        propertyManager: form.propertyManager || null,
        weeklyRent: form.weeklyRent ? Number(form.weeklyRent) : null,
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  const summary = property.summary || {};
  const liabilities: Liability[] = property.liabilities || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{property.asset?.name}</h2>
          <p>{property.address}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <label>Display name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <label>State</label>
          <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>Purchase date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <label>Settlement date</label>
              <input
                type="date"
                value={form.settlementDate}
                onChange={(e) => setForm({ ...form, settlementDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Purchase price</label>
              <input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              />
            </div>
            <div>
              <label>Current estimated value</label>
              <input
                type="number"
                value={form.currentValue}
                onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
              />
            </div>
          </div>
          <label>Tenant / rental information</label>
          <input value={form.tenantInfo} onChange={(e) => setForm({ ...form, tenantInfo: e.target.value })} />
          <label>Property manager</label>
          <input value={form.propertyManager} onChange={(e) => setForm({ ...form, propertyManager: e.target.value })} />
          <label>Rent per week</label>
          <input type="number" value={form.weeklyRent} onChange={(e) => setForm({ ...form, weeklyRent: e.target.value })} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Financing</h3>
          {liabilities.length === 0 ? (
            <p className="empty-state">No loan linked. Add one from the Loans page and set this property as security.</p>
          ) : (
            liabilities.map((l) => (
              <table key={l.id}>
                <tbody>
                  <tr>
                    <td>Lender</td>
                    <td>{l.lender || "—"}</td>
                  </tr>
                  <tr>
                    <td>Balance</td>
                    <td>{formatCurrency(l.currentBalance)}</td>
                  </tr>
                  <tr>
                    <td>Interest rate</td>
                    <td>{l.interestRate ? `${l.interestRate}%` : "—"}</td>
                  </tr>
                  <tr>
                    <td>Type</td>
                    <td>{l.loanType ? humanize(l.loanType) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Repayment</td>
                    <td>{formatCurrency(l.repaymentAmount)}</td>
                  </tr>
                  <tr>
                    <td>Fixed period ends</td>
                    <td>{formatDate(l.fixedPeriodEnds)}</td>
                  </tr>
                </tbody>
              </table>
            ))
          )}

          <h3>Income, expenses & capital</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Derived from documents linked below, grouped by tax category. Tag a linked document with a tax category to
            have it counted here.
          </p>
          <table>
            <tbody>
              <tr>
                <td>Income</td>
                <td>{formatCurrency(summary.INCOME?.total || 0)}</td>
              </tr>
              <tr>
                <td>Expenses</td>
                <td>{formatCurrency(summary.EXPENSE?.total || 0)}</td>
              </tr>
              <tr>
                <td>Capital</td>
                <td>{formatCurrency(summary.CAPITAL?.total || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {property.asset && <AssetOwnershipPanel asset={property.asset} entities={entities} onChange={load} />}

      {property.asset && <PropertyCostsCard property={property} asset={property.asset} onChange={load} />}

      {!property.asset?.disposalDate && <UsableEquityCard assetId={property.assetId} />}

      <ItemsPanel parentAssetId={property.assetId} title="Items in this property" />

      <MissingFlags target={`asset:${property.assetId}`} />
      <InsurancePanel assetId={property.assetId} defaultKind="BUILDING_AND_CONTENTS" defaultHolderId={property.asset?.entityId} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="PROPERTY" targetId={property.id} />
      </div>
      {property.asset && <SoldPanel asset={property.asset} onChange={load} />}

      <DeleteSection
        title="Delete this property"
        note="Not possible while a loan is secured against it — change or remove the loan first. Linked documents are kept."
        question={`Delete ${property.asset?.name ?? "this property"}? This can't be undone.`}
        action={() => api.properties.remove(property.id)}
        redirectTo="/properties"
      />
    </div>
  );
}
