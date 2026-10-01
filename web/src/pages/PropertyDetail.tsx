import { useEffect, useState } from "react";
import { ProfitHistoryCard } from "../components/ProfitHistoryCard.js";
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
import { recordsChanged } from "../features.js";
import { formatCurrency, PROPERTY_USES, propertyUse } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { useTrailTitle } from "../trail.js";
import { RemindersCard } from "../components/RemindersCard.js";
import { SecuredLoansCard } from "../components/SecuredLoansCard.js";
import { ConsideringBar } from "../components/ConsideringBar.js";
import { EstimateVsActualCard } from "../components/EstimateVsActualCard.js";
import { AssessmentCard } from "../components/AssessmentCard.js";
import { DueDiligenceCards } from "../components/DueDiligenceCards.js";

const KINDS = [
  ["HOUSE", "House"],
  ["UNIT", "Unit or apartment"],
  ["TOWNHOUSE", "Townhouse or villa"],
  ["LAND", "Vacant land"],
  ["OTHER", "Other"],
];
const TITLES = [
  ["TORRENS", "Torrens (freehold)"],
  ["STRATA", "Strata"],
  ["COMMUNITY", "Community title"],
];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  useTrailTitle(property?.asset?.name ?? property?.address);
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
        suburb: p.suburb || "",
        kind: p.kind || "",
        titleType: p.titleType || "",
        askingPrice: p.asset?.askingPrice?.toString() || "",
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
        suburb: form.suburb || null,
        kind: form.kind || null,
        titleType: form.titleType || null,
        ...(considering ? { askingPrice: form.askingPrice ? Number(form.askingPrice) : null } : {}),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function setUse(use: string) {
    if (!id) return;
    await api.properties.update(id, { use });
    load();
    // What's expected (landlord insurance, rental paperwork) depends on the use.
    recordsChanged();
  }

  const summary = property.summary || {};
  // Being considered (or passed on): not yours yet, so only what applies before buying.
  const considering = !!property.asset?.status && property.asset.status !== "OWNED";
  const use = propertyUse(property);
  // A home or a holiday home that isn't rented has no tenant, manager or rent.
  const rented = !["HOME", "HOLIDAY"].includes(use.value);
  const liabilities: Liability[] = property.liabilities || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{property.asset?.name}</h2>
          <p>{property.address}</p>
        </div>
      </div>

      {considering && property.asset && <ConsideringBar asset={property.asset} onChange={load} />}
      {considering && <AssessmentCard assetId={property.assetId} reloadKey={property} />}
      {/* Problems found change the cash needed, so the page (and the assessment) reload. */}
      {considering && <DueDiligenceCards assetId={property.assetId} onChange={load} />}
      {/* Finance approved: the loan is recorded here, and counted once it settles. */}
      {considering && ["CONTRACT", "SETTLEMENT"].includes(property.asset?.pipelineStage ?? "") && (
        <div className="card">
          <SecuredLoansCard
            bare
            title="Financing"
            kind="residential"
            securityId={property.id}
            ownerEntityId={property.asset?.entityId ?? property.entityId}
            name={property.asset?.name ?? property.address}
            defaultType={["HOME", "HOME_PART_RENTED"].includes(use.value) ? "HOME_LOAN" : "INVESTMENT_LOAN"}
            loans={liabilities}
            onChange={load}
          />
          <p className="cap-explain">Recorded now, counted in your totals from settlement.</p>
        </div>
      )}

      {!property.asset?.disposalDate && (
        <div className="card property-use">
          <h3 style={{ marginTop: 0 }}>How it's used</h3>
          <div className="segmented" role="group" aria-label="How it's used">
            {PROPERTY_USES.map((u) => (
              <button key={u.value} type="button" className={use.value === u.value ? "selected" : ""} aria-pressed={use.value === u.value} onClick={() => setUse(u.value)}>
                {u.label}
              </button>
            ))}
          </div>
          <p className="cap-explain">{use.explain}</p>
          {(use.value === "HOLIDAY_RENTED" || use.value === "HOME_PART_RENTED") && id && (
            <PartPrivateSettings propertyId={id} property={property} holiday={use.value === "HOLIDAY_RENTED"} onChange={load} />
          )}
        </div>
      )}

      <div className={considering ? "" : "grid grid-2"}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <label>Display name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>Suburb</label>
              <input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} />
            </div>
            <div>
              <label>State</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Kind of property</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="">— Not recorded —</option>
                {KINDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Title</label>
              <select value={form.titleType} onChange={(e) => setForm({ ...form, titleType: e.target.value })}>
                <option value="">— Not recorded —</option>
                {TITLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {considering ? (
            <>
              <label>Asking price</label>
              <input type="number" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
              {rented && (
                <>
                  <label>Expected rent per week</label>
                  <input type="number" value={form.weeklyRent} onChange={(e) => setForm({ ...form, weeklyRent: e.target.value })} />
                </>
              )}
            </>
          ) : (
            <>
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
              {rented && (
                <>
                  <label>Tenant / rental information</label>
                  <input value={form.tenantInfo} onChange={(e) => setForm({ ...form, tenantInfo: e.target.value })} />
                  <label>Property manager</label>
                  <input value={form.propertyManager} onChange={(e) => setForm({ ...form, propertyManager: e.target.value })} />
                  <label>Rent per week</label>
                  <input type="number" value={form.weeklyRent} onChange={(e) => setForm({ ...form, weeklyRent: e.target.value })} />
                </>
              )}
            </>
          )}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {!considering && (
          <div className="card">
            <SecuredLoansCard
              bare
              title="Financing"
              kind="residential"
              securityId={property.id}
              ownerEntityId={property.asset?.entityId ?? property.entityId}
              name={property.asset?.name ?? property.address}
              defaultType={["HOME", "HOME_PART_RENTED"].includes(use.value) ? "HOME_LOAN" : "INVESTMENT_LOAN"}
              loans={liabilities}
              onChange={load}
            />

            <h3>Income, expenses & capital</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Derived from documents linked below, grouped by tax category. Tag a linked document with a tax category to
              have it counted here.
            </p>
            <table>
              <tbody>
                {(rented || !!summary.INCOME?.total) && (
                  <tr>
                    <td>Income</td>
                    <td>{formatCurrency(summary.INCOME?.total || 0)}</td>
                  </tr>
                )}
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
        )}
      </div>

      {property.asset && <AssetOwnershipPanel asset={property.asset} entities={entities} onChange={load} />}

      {property.asset && <PropertyCostsCard property={property} asset={property.asset} onChange={load} />}

      {/* Owned only: equity, its profit years, what's in it, what's expected and its cover. */}
      {!considering && (
        <>
          {!property.asset?.disposalDate && <UsableEquityCard assetId={property.assetId} />}

          {/* Not rented: only if it has years from when it was. */}
          <ProfitHistoryCard assetId={property.assetId} onlyIfSaved={!rented} />

          {/* Bought through Properties I'm considering: what was expected against what happened. */}
          <EstimateVsActualCard assetId={property.assetId} />

          <ItemsPanel parentAssetId={property.assetId} title="Items in this property" />

          <MissingFlags target={`asset:${property.assetId}`} />
          <InsurancePanel assetId={property.assetId} defaultKind="BUILDING_AND_CONTENTS" defaultHolderId={property.asset?.entityId} />
        </>
      )}

      <RemindersCard targetType="PROPERTY" targetId={property.id} name={property.asset?.name ?? property.address} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="PROPERTY" targetId={property.id} />
      </div>
      {property.asset && !considering && <SoldPanel asset={property.asset} onChange={load} />}

      <DeleteSection
        title="Delete this property"
        note={
          considering
            ? "Decided against it? Use Pass on this one at the top instead — that keeps it, with what you found out, for reference. Deleting removes it completely; its documents stay in Documents."
            : "Sold it? Use Sold above instead — that keeps its history and capital gains record. Deleting isn't possible while a loan is secured against it or items (appliances, solar…) are recorded under it. Its documents stay in Documents, just no longer linked to it; its insurance policies stay in the insurance register; its servicing records are removed."
        }
        question={`Delete ${property.asset?.name ?? "this property"}? This can't be undone.`}
        action={() => api.properties.remove(property.id)}
        redirectTo={considering ? "/considering" : "/properties"}
      />
    </div>
  );
}

/**
 * A property that's part rented, part private: the share of its costs that
 * relates to renting (PCG 2026/2), and for a holiday home whether it's
 * mainly used to earn rent (TR 2026/1) — which decides if its ownership
 * costs can be claimed at all.
 */
function PartPrivateSettings({
  propertyId,
  property,
  holiday,
  onChange,
}: {
  propertyId: string;
  property: Property;
  holiday: boolean;
  onChange: () => void;
}) {
  const [share, setShare] = useState(property.rentedShare != null ? String(property.rentedShare) : "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setShare(property.rentedShare != null ? String(property.rentedShare) : ""), [property.rentedShare]);

  async function saveShare() {
    const value = share === "" ? null : Math.min(100, Math.max(0, Number(share)));
    if (value === (property.rentedShare ?? null)) return;
    await api.properties.update(propertyId, { rentedShare: value });
    setSaved(true);
    onChange();
  }
  async function setMainly(value: boolean | null) {
    await api.properties.update(propertyId, { mainlyRented: value });
    onChange();
  }
  const mainly = property.mainlyRented ?? null;

  return (
    <div className="sub-form" style={{ marginTop: 12 }}>
      <label htmlFor="rented-share">Rented share of its costs (%)</label>
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input
          id="rented-share"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          value={share}
          onChange={(e) => {
            setShare(e.target.value);
            setSaved(false);
          }}
          onBlur={saveShare}
          style={{ maxWidth: 120 }}
        />
        <button className="btn secondary" onClick={saveShare}>
          Save
        </button>
        {saved && <span className="cap-explain">Saved.</span>}
      </div>
      <p className="cap-explain">
        {holiday
          ? "Usually the days it was rented or genuinely available to rent, out of the year, less the days you, family or friends stayed."
          : "Usually the floor area rented (with a share of shared areas), and for part of the year if it wasn't rented all year."}{" "}
        The ATO's accepted methods are in PCG 2026/2 — your accountant can confirm the figure.
      </p>

      {holiday && (
        <>
          <label>Is it mainly used to earn rent?</label>
          <div className="segmented" role="group" aria-label="Is it mainly used to earn rent?">
            {(
              [
                [true, "Yes"],
                [false, "No"],
                [null, "Not sure"],
              ] as const
            ).map(([value, label]) => (
              <button key={label} type="button" className={mainly === value ? "selected" : ""} aria-pressed={mainly === value} onClick={() => setMainly(value)}>
                {label}
              </button>
            ))}
          </div>
          <p className="cap-explain">
            The ATO looks at how it's really used, especially at peak times — school holidays, Christmas and Easter. Keeping those for
            yourselves usually means it isn't mainly rented, and then its interest, rates, land tax, insurance and repairs can't be claimed
            (only the costs of renting it, like booking and cleaning fees). Days alone don't decide it.
          </p>
        </>
      )}
    </div>
  );
}
