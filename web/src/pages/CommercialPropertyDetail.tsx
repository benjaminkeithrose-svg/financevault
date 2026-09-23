import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, CommercialProperty, Entity, FinancialYear, LeaseExtractionResponse } from "../api/client.js";
import { AssetOwnershipPanel } from "../components/AssetOwnershipPanel.js";
import { SoldPanel } from "../components/SoldPanel.js";
import { InsurancePanel } from "../components/InsurancePanel.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { ItemsPanel } from "../components/ItemsPanel.js";
import { ScenarioComparison } from "../components/ScenarioComparison.js";
import { formatCurrency, formatDate, humanize, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { HelpLink } from "../components/HelpLink.js";

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

const OUTGOING_CATEGORIES = [
  "COUNCIL_RATES", "WATER", "LAND_TAX", "INSURANCE", "STRATA", "REPAIRS", "MAINTENANCE",
  "CLEANING", "SECURITY", "FIRE_SERVICES", "LIFT", "AIRCON", "ELECTRICAL",
  "BUILDING_MANAGEMENT", "PROPERTY_MANAGEMENT", "WASTE", "GARDENING", "PEST_CONTROL", "COMPLIANCE", "OTHER",
];
const LEASE_STATUSES = ["PROPOSED", "NEGOTIATING", "ACTIVE", "EXPIRED", "TERMINATED", "VACANT"];
const REVIEW_MECHANISMS = ["FIXED_PERCENT", "CPI", "MARKET", "HYBRID", "FIXED"];

const emptyTenancy = {
  tenantName: "",
  leaseCommencement: "",
  leaseExpiry: "",
  rentPerAnnum: "",
  nlaOccupied: "",
  reviewMechanism: "CPI",
  nextRentReview: "",
  outgoingsArrangement: "NET_NET_NET",
  leaseStatus: "ACTIVE",
};

const emptyOutgoing = { date: "", category: "COUNCIL_RATES", supplier: "", amount: "", recoverable: true, recoveredAmount: "" };
const emptyCapex = { date: "", description: "", amount: "", usefulLifeYears: "" };
const emptyOccupancy = { asAtDate: "", totalNla: "", occupiedNla: "" };
const emptyRentReview = { reviewDate: "", reviewMechanism: "CPI", previousRent: "", newRent: "" };

export function CommercialPropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<CommercialProperty | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [valuationBasis, setValuationBasis] = useState<"current" | "purchase">("current");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showTenancyForm, setShowTenancyForm] = useState(false);
  const [tenancyForm, setTenancyForm] = useState(emptyTenancy);
  const [rentReviewFormFor, setRentReviewFormFor] = useState<string | null>(null);
  const [rentReviewForm, setRentReviewForm] = useState(emptyRentReview);
  const [extractionFor, setExtractionFor] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<LeaseExtractionResponse | null>(null);
  const [extracting, setExtracting] = useState(false);

  const [showOutgoingForm, setShowOutgoingForm] = useState(false);
  const [outgoingForm, setOutgoingForm] = useState(emptyOutgoing);

  const [showCapexForm, setShowCapexForm] = useState(false);
  const [capexForm, setCapexForm] = useState(emptyCapex);

  const [showOccupancyForm, setShowOccupancyForm] = useState(false);
  const [occupancyForm, setOccupancyForm] = useState(emptyOccupancy);

  function load() {
    if (!id) return;
    api.commercialProperties.get(id, valuationBasis).then((p) => {
      setProperty(p);
      setForm({
        name: p.name,
        address: p.address,
        state: p.state || "",
        postcode: p.postcode || "",
        purchaseDate: toDateInput(p.purchaseDate),
        purchasePrice: p.purchasePrice?.toString() || "",
        currentValue: p.asset?.currentValue?.toString() || "",
        valuationDate: toDateInput(p.valuationDate),
        valuer: p.valuer || "",
        buildingArea: p.buildingArea?.toString() || "",
        landArea: p.landArea?.toString() || "",
        nla: p.nla?.toString() || "",
        gla: p.gla?.toString() || "",
        carSpaces: p.carSpaces?.toString() || "",
        zoning: p.zoning || "",
        constructionType: p.constructionType || "",
        yearBuilt: p.yearBuilt?.toString() || "",
      });
    }).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id, valuationBasis]);
  useEffect(() => {
    api.financialYears.list().then(setFinancialYears);
    api.entities.list().then(setEntities);
  }, []);

  if (!property) {
    if (loadError) return <LoadFailed message={loadError} backTo="/properties" backLabel="Back to properties" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      await api.commercialProperties.update(id, {
        name: form.name,
        address: form.address,
        state: form.state || null,
        postcode: form.postcode || null,
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
        currentValue: form.currentValue ? Number(form.currentValue) : null,
        valuationDate: form.valuationDate ? new Date(form.valuationDate).toISOString() : null,
        valuer: form.valuer || null,
        buildingArea: form.buildingArea ? Number(form.buildingArea) : null,
        landArea: form.landArea ? Number(form.landArea) : null,
        nla: form.nla ? Number(form.nla) : null,
        gla: form.gla ? Number(form.gla) : null,
        carSpaces: form.carSpaces ? Number(form.carSpaces) : null,
        zoning: form.zoning || null,
        constructionType: form.constructionType || null,
        yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : null,
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function addTenancy() {
    if (!id || !tenancyForm.tenantName.trim()) return;
    await api.commercialProperties.addTenancy(id, {
      tenantName: tenancyForm.tenantName,
      leaseCommencement: tenancyForm.leaseCommencement ? new Date(tenancyForm.leaseCommencement).toISOString() : null,
      leaseExpiry: tenancyForm.leaseExpiry ? new Date(tenancyForm.leaseExpiry).toISOString() : null,
      rentPerAnnum: tenancyForm.rentPerAnnum ? Number(tenancyForm.rentPerAnnum) : null,
      nlaOccupied: tenancyForm.nlaOccupied ? Number(tenancyForm.nlaOccupied) : null,
      reviewMechanism: tenancyForm.reviewMechanism,
      nextRentReview: tenancyForm.nextRentReview ? new Date(tenancyForm.nextRentReview).toISOString() : null,
      outgoingsArrangement: tenancyForm.outgoingsArrangement,
      leaseStatus: tenancyForm.leaseStatus,
    });
    setTenancyForm(emptyTenancy);
    setShowTenancyForm(false);
    load();
  }

  async function removeTenancy(tenancyId: string) {
    const deleted = await confirmThenDelete(
      "Delete this tenancy? Its rent review history is deleted with it.",
      () => api.commercialProperties.removeTenancy(tenancyId)
    );
    if (!deleted) return;
    load();
  }

  async function runExtraction(tenancyId: string) {
    setExtracting(true);
    setExtractionFor(tenancyId);
    try {
      const result = await api.commercialProperties.extractLeaseTerms(tenancyId);
      setExtractionResult(result);
    } finally {
      setExtracting(false);
    }
  }

  async function applySuggestedField(tenancyId: string, data: Record<string, unknown>) {
    await api.commercialProperties.updateTenancy(tenancyId, data);
    load();
  }

  async function addRentReview(tenancyId: string) {
    if (!rentReviewForm.reviewDate) return;
    await api.commercialProperties.addRentReview(tenancyId, {
      reviewDate: new Date(rentReviewForm.reviewDate).toISOString(),
      reviewMechanism: rentReviewForm.reviewMechanism,
      previousRent: rentReviewForm.previousRent ? Number(rentReviewForm.previousRent) : null,
      newRent: rentReviewForm.newRent ? Number(rentReviewForm.newRent) : null,
    });
    setRentReviewForm(emptyRentReview);
    setRentReviewFormFor(null);
    load();
  }

  async function addOutgoing() {
    if (!id || !outgoingForm.date || !outgoingForm.amount) return;
    await api.commercialProperties.addOutgoing(id, {
      date: new Date(outgoingForm.date).toISOString(),
      category: outgoingForm.category,
      supplier: outgoingForm.supplier || null,
      amount: Number(outgoingForm.amount),
      recoverable: outgoingForm.recoverable,
      recoveredAmount: outgoingForm.recoveredAmount ? Number(outgoingForm.recoveredAmount) : null,
    });
    setOutgoingForm(emptyOutgoing);
    setShowOutgoingForm(false);
    load();
  }

  async function removeOutgoing(outgoingId: string) {
    const deleted = await confirmThenDelete(
      "Delete this outgoing?",
      () => api.commercialProperties.removeOutgoing(outgoingId)
    );
    if (!deleted) return;
    load();
  }

  async function addCapex() {
    if (!id || !capexForm.date || !capexForm.description.trim() || !capexForm.amount) return;
    await api.commercialProperties.addCapex(id, {
      date: new Date(capexForm.date).toISOString(),
      description: capexForm.description,
      amount: Number(capexForm.amount),
      usefulLifeYears: capexForm.usefulLifeYears ? Number(capexForm.usefulLifeYears) : null,
    });
    setCapexForm(emptyCapex);
    setShowCapexForm(false);
    load();
  }

  async function removeCapex(capexId: string) {
    const deleted = await confirmThenDelete(
      "Delete this capital expenditure item?",
      () => api.commercialProperties.removeCapex(capexId)
    );
    if (!deleted) return;
    load();
  }

  async function addOccupancySnapshot() {
    if (!id || !occupancyForm.asAtDate || !occupancyForm.totalNla || !occupancyForm.occupiedNla) return;
    await api.commercialProperties.addOccupancySnapshot(id, {
      asAtDate: new Date(occupancyForm.asAtDate).toISOString(),
      totalNla: Number(occupancyForm.totalNla),
      occupiedNla: Number(occupancyForm.occupiedNla),
    });
    setOccupancyForm(emptyOccupancy);
    setShowOccupancyForm(false);
    load();
  }

  async function generateAnnualSnapshot(financialYearId: string) {
    if (!id || !financialYearId) return;
    const preview = await api.commercialProperties.previewAnnualSnapshot(id, valuationBasis);
    await api.commercialProperties.saveAnnualSnapshot(id, { ...preview, financialYearId });
    load();
  }

  const m = property.metrics;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{property.name} <HelpLink topic="properties" /></h2>
          <p>
            {property.propertyTypes.split(",").map(humanize).join(" / ")} · {property.address} · {property.entity?.name}
          </p>
        </div>
        <select value={valuationBasis} onChange={(e) => setValuationBasis(e.target.value as "current" | "purchase")} style={{ width: 220 }}>
          <option value="current">Value basis: Current valuation</option>
          <option value="purchase">Value basis: Purchase price</option>
        </select>
      </div>

      {m && (
        <>
          <div className="grid grid-4">
            <div className="stat-tile">
              <div className="label">NOI (trailing 12mo, est.)</div>
              <div className="value">{formatCurrency(m.income.noi)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Cap rate ({valuationBasis})</div>
              <div className="value">{pct(m.yields.capRate)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Gross / Net yield</div>
              <div className="value">
                {pct(m.yields.grossYield)} / {pct(m.yields.netYield)}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">LVR</div>
              <div className="value">{pct(m.debt.lvr)}</div>
            </div>
          </div>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <div className="label">Equity</div>
              <div className="value">{formatCurrency(m.debt.equity)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Occupancy</div>
              <div className="value">{pct(m.occupancy.occupancyPercent)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">WALE by rent / by lease</div>
              <div className="value">
                {m.wale.waleByRentYears?.toFixed(1) ?? "—"}y / {m.wale.waleByLeaseYears?.toFixed(1) ?? "—"}y
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">Cash flow after financing (est.)</div>
              <div className="value">{formatCurrency(m.cashFlowAfterFinancing.value)}</div>
            </div>
          </div>
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <div className="label">DSCR</div>
              <div className="value">{m.coverage.dscr !== null ? `${m.coverage.dscr.toFixed(2)}x` : "—"}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Interest coverage ratio</div>
              <div className="value">
                {m.coverage.interestCoverageRatio !== null ? `${m.coverage.interestCoverageRatio.toFixed(2)}x` : "—"}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>How these are calculated</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              These are analytical calculations from your own records — not investment advice or a recommendation.
            </p>
            <table>
              <tbody>
                <tr>
                  <td>Gross rent (active leases)</td>
                  <td>{formatCurrency(m.income.grossRent)}</td>
                </tr>
                <tr>
                  <td>Outgoings recoveries (trailing 12mo)</td>
                  <td>{formatCurrency(m.income.recoveries)}</td>
                </tr>
                <tr>
                  <td>Gross operating expenses (trailing 12mo)</td>
                  <td>{formatCurrency(m.income.grossOperatingExpenses)}</td>
                </tr>
                <tr>
                  <td>Unrecovered expenses (net landlord cost)</td>
                  <td>{formatCurrency(m.income.unrecoveredExpenses)}</td>
                </tr>
                <tr>
                  <td>NOI = grossRent + recoveries − gross operating expenses</td>
                  <td>{formatCurrency(m.income.noi)}</td>
                </tr>
                <tr>
                  <td>Property value used ({valuationBasis})</td>
                  <td>{formatCurrency(m.yields.propertyValue)}</td>
                </tr>
                <tr>
                  <td>Total debt secured against this property</td>
                  <td>{formatCurrency(m.debt.totalDebt)}</td>
                </tr>
                <tr>
                  <td>Estimated annual interest (balance × rate, not amortised)</td>
                  <td>{formatCurrency(m.debt.estimatedAnnualInterest)}</td>
                </tr>
                <tr>
                  <td>
                    Annual debt service (repayments × frequency)
                    {m.debt.loansAssumedInterestOnly > 0 && (
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {m.debt.loansAssumedInterestOnly === 1 ? "1 loan has" : `${m.debt.loansAssumedInterestOnly} loans have`} no
                        repayment amount recorded, so its interest is used (treated as interest-only).
                      </div>
                    )}
                  </td>
                  <td>{formatCurrency(m.debt.annualDebtService)}</td>
                </tr>
                <tr>
                  <td>DSCR = NOI / annual debt service</td>
                  <td>{m.coverage.dscr !== null ? `${m.coverage.dscr.toFixed(2)}x` : "—"}</td>
                </tr>
                <tr>
                  <td>Interest coverage = NOI / estimated annual interest</td>
                  <td>{m.coverage.interestCoverageRatio !== null ? `${m.coverage.interestCoverageRatio.toFixed(2)}x` : "—"}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
              DSCR and interest coverage are analytical ratios, not a lending approval prediction.
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Tenant concentration</h3>
            {m.tenantConcentration.tenants.length === 0 ? (
              <p className="empty-state">No active tenancies.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Annual rent</th>
                    <th>% of rent</th>
                    <th>% of NLA</th>
                  </tr>
                </thead>
                <tbody>
                  {m.tenantConcentration.tenants.map((t) => (
                    <tr key={t.tenancyId}>
                      <td>{t.tenantName}</td>
                      <td>{formatCurrency(t.annualRent)}</td>
                      <td>{pct(t.percentOfRent)}</td>
                      <td>{pct(t.percentOfNla)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ScenarioComparison metrics={m} />
        </>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <label>Name</label>
          <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Address</label>
          <input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-2">
            <div>
              <label>State</label>
              <input value={form.state || ""} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label>Postcode</label>
              <input value={form.postcode || ""} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Purchase date</label>
              <input type="date" value={form.purchaseDate || ""} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <label>Purchase price</label>
              <input type="number" value={form.purchasePrice || ""} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Current estimated value</label>
              <input type="number" value={form.currentValue || ""} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
            </div>
            <div>
              <label>Valuation date</label>
              <input type="date" value={form.valuationDate || ""} onChange={(e) => setForm({ ...form, valuationDate: e.target.value })} />
            </div>
          </div>
          <label>Valuer</label>
          <input value={form.valuer || ""} onChange={(e) => setForm({ ...form, valuer: e.target.value })} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Characteristics</h3>
          <div className="grid grid-2">
            <div>
              <label>NLA (m²)</label>
              <input type="number" value={form.nla || ""} onChange={(e) => setForm({ ...form, nla: e.target.value })} />
            </div>
            <div>
              <label>GLA (m²)</label>
              <input type="number" value={form.gla || ""} onChange={(e) => setForm({ ...form, gla: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Building area (m²)</label>
              <input type="number" value={form.buildingArea || ""} onChange={(e) => setForm({ ...form, buildingArea: e.target.value })} />
            </div>
            <div>
              <label>Land area (m²)</label>
              <input type="number" value={form.landArea || ""} onChange={(e) => setForm({ ...form, landArea: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Car spaces</label>
              <input type="number" value={form.carSpaces || ""} onChange={(e) => setForm({ ...form, carSpaces: e.target.value })} />
            </div>
            <div>
              <label>Year built</label>
              <input type="number" value={form.yearBuilt || ""} onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })} />
            </div>
          </div>
          <label>Zoning</label>
          <input value={form.zoning || ""} onChange={(e) => setForm({ ...form, zoning: e.target.value })} />
          <label>Construction type</label>
          <input value={form.constructionType || ""} onChange={(e) => setForm({ ...form, constructionType: e.target.value })} />
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Tenancies & leases</h3>
          <button className="btn" onClick={() => setShowTenancyForm((v) => !v)}>
            {showTenancyForm ? "Cancel" : "Add tenancy"}
          </button>
        </div>

        {showTenancyForm && (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Tenant name</label>
                <input value={tenancyForm.tenantName} onChange={(e) => setTenancyForm({ ...tenancyForm, tenantName: e.target.value })} />
              </div>
              <div>
                <label>Lease status</label>
                <select value={tenancyForm.leaseStatus} onChange={(e) => setTenancyForm({ ...tenancyForm, leaseStatus: e.target.value })}>
                  {LEASE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Lease commencement</label>
                <input
                  type="date"
                  value={tenancyForm.leaseCommencement}
                  onChange={(e) => setTenancyForm({ ...tenancyForm, leaseCommencement: e.target.value })}
                />
              </div>
              <div>
                <label>Lease expiry</label>
                <input type="date" value={tenancyForm.leaseExpiry} onChange={(e) => setTenancyForm({ ...tenancyForm, leaseExpiry: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Rent per annum</label>
                <input
                  type="number"
                  value={tenancyForm.rentPerAnnum}
                  onChange={(e) => setTenancyForm({ ...tenancyForm, rentPerAnnum: e.target.value })}
                />
              </div>
              <div>
                <label>NLA occupied (m²)</label>
                <input
                  type="number"
                  value={tenancyForm.nlaOccupied}
                  onChange={(e) => setTenancyForm({ ...tenancyForm, nlaOccupied: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Review mechanism</label>
                <select
                  value={tenancyForm.reviewMechanism}
                  onChange={(e) => setTenancyForm({ ...tenancyForm, reviewMechanism: e.target.value })}
                >
                  {REVIEW_MECHANISMS.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Next rent review</label>
                <input
                  type="date"
                  value={tenancyForm.nextRentReview}
                  onChange={(e) => setTenancyForm({ ...tenancyForm, nextRentReview: e.target.value })}
                />
              </div>
            </div>
            <label>Outgoings arrangement</label>
            <select
              value={tenancyForm.outgoingsArrangement}
              onChange={(e) => setTenancyForm({ ...tenancyForm, outgoingsArrangement: e.target.value })}
            >
              <option value="GROSS">Gross</option>
              <option value="NET">Net</option>
              <option value="NET_NET">Net net</option>
              <option value="NET_NET_NET">Triple net (NNN)</option>
              <option value="GROSS_PLUS_RECOVERIES">Gross plus recoveries</option>
            </select>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addTenancy}>
                Add
              </button>
            </div>
          </div>
        )}

        {(property.tenancies || []).length === 0 ? (
          <p className="empty-state">No tenancies recorded yet.</p>
        ) : (
          (property.tenancies || []).map((t) => (
            <div key={t.id} className="entity-graph-item" style={{ marginTop: 12 }}>
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <strong>{t.tenantName}</strong>
                <span className={`badge status-${t.leaseStatus === "ACTIVE" ? "CONFIRMED" : "NEEDS_CONFIRMATION"}`}>
                  {humanize(t.leaseStatus)}
                </span>
              </div>
              <table>
                <tbody>
                  <tr>
                    <td>Lease term</td>
                    <td>
                      {formatDate(t.leaseCommencement)} → {formatDate(t.leaseExpiry)}
                    </td>
                  </tr>
                  <tr>
                    <td>Rent per annum</td>
                    <td>{formatCurrency(t.rentPerAnnum)}</td>
                  </tr>
                  <tr>
                    <td>NLA occupied</td>
                    <td>{t.nlaOccupied ?? "—"} m²</td>
                  </tr>
                  <tr>
                    <td>Outgoings arrangement</td>
                    <td>{t.outgoingsArrangement ? humanize(t.outgoingsArrangement) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Next rent review</td>
                    <td>
                      {formatDate(t.nextRentReview)} ({t.reviewMechanism ? humanize(t.reviewMechanism) : "—"})
                    </td>
                  </tr>
                </tbody>
              </table>

              <h4 style={{ marginBottom: 4 }}>Rent reviews</h4>
              {(t.rentReviews || []).length === 0 ? (
                <p className="empty-state" style={{ padding: "4px 0" }}>
                  None recorded.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Mechanism</th>
                      <th>Previous</th>
                      <th>New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(t.rentReviews || []).map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.reviewDate)}</td>
                        <td>{r.reviewMechanism ? humanize(r.reviewMechanism) : "—"}</td>
                        <td>{formatCurrency(r.previousRent)}</td>
                        <td>{formatCurrency(r.newRent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {rentReviewFormFor === t.id ? (
                <div style={{ marginTop: 8 }}>
                  <div className="grid grid-2">
                    <div>
                      <label>Review date</label>
                      <input
                        type="date"
                        value={rentReviewForm.reviewDate}
                        onChange={(e) => setRentReviewForm({ ...rentReviewForm, reviewDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Mechanism</label>
                      <select
                        value={rentReviewForm.reviewMechanism}
                        onChange={(e) => setRentReviewForm({ ...rentReviewForm, reviewMechanism: e.target.value })}
                      >
                        {REVIEW_MECHANISMS.map((r) => (
                          <option key={r} value={r}>
                            {humanize(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-2">
                    <div>
                      <label>Previous rent</label>
                      <input
                        type="number"
                        value={rentReviewForm.previousRent}
                        onChange={(e) => setRentReviewForm({ ...rentReviewForm, previousRent: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>New rent</label>
                      <input
                        type="number"
                        value={rentReviewForm.newRent}
                        onChange={(e) => setRentReviewForm({ ...rentReviewForm, newRent: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn secondary" onClick={() => addRentReview(t.id)}>
                      Save review
                    </button>
                  </div>
                </div>
              ) : (
                <div className="toolbar" style={{ marginTop: 8 }}>
                  <button className="btn secondary" onClick={() => setRentReviewFormFor(t.id)}>
                    Record rent review
                  </button>
                  <button className="btn secondary" onClick={() => runExtraction(t.id)} disabled={extracting && extractionFor === t.id}>
                    {extracting && extractionFor === t.id ? "Extracting…" : "Extract from lease document"}
                  </button>
                  <button className="btn secondary" onClick={() => removeTenancy(t.id)}>
                    Remove tenancy
                  </button>
                </div>
              )}

              {extractionFor === t.id && extractionResult && (
                <div className="message-box info" style={{ marginTop: 8 }}>
                  {!extractionResult.found ? (
                    <p style={{ margin: 0 }}>
                      No lease document linked to this tenancy yet — link one below (documentType "Lease"), then try
                      again.
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 8px" }}>
                        Suggested from <strong>{extractionResult.sourceDocument?.originalFilename}</strong> — a
                        heuristic guess, always check before applying.
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {extractionResult.suggestion?.rentPerAnnum !== null && extractionResult.suggestion?.rentPerAnnum !== undefined && (
                          <li>
                            Rent per annum: {formatCurrency(extractionResult.suggestion.rentPerAnnum)}{" "}
                            <button
                              className="btn secondary"
                              style={{ padding: "2px 8px", fontSize: 12 }}
                              onClick={() => applySuggestedField(t.id, { rentPerAnnum: extractionResult.suggestion!.rentPerAnnum })}
                            >
                              Apply
                            </button>
                          </li>
                        )}
                        {extractionResult.suggestion?.leaseCommencement && (
                          <li>
                            Lease commencement: {formatDate(extractionResult.suggestion.leaseCommencement)}{" "}
                            <button
                              className="btn secondary"
                              style={{ padding: "2px 8px", fontSize: 12 }}
                              onClick={() => applySuggestedField(t.id, { leaseCommencement: extractionResult.suggestion!.leaseCommencement })}
                            >
                              Apply
                            </button>
                          </li>
                        )}
                        {extractionResult.suggestion?.leaseExpiry && (
                          <li>
                            Lease expiry: {formatDate(extractionResult.suggestion.leaseExpiry)}{" "}
                            <button
                              className="btn secondary"
                              style={{ padding: "2px 8px", fontSize: 12 }}
                              onClick={() => applySuggestedField(t.id, { leaseExpiry: extractionResult.suggestion!.leaseExpiry })}
                            >
                              Apply
                            </button>
                          </li>
                        )}
                        {extractionResult.suggestion?.reviewMechanism && (
                          <li>
                            Review mechanism: {humanize(extractionResult.suggestion.reviewMechanism)}{" "}
                            <button
                              className="btn secondary"
                              style={{ padding: "2px 8px", fontSize: 12 }}
                              onClick={() => applySuggestedField(t.id, { reviewMechanism: extractionResult.suggestion!.reviewMechanism })}
                            >
                              Apply
                            </button>
                          </li>
                        )}
                        {!extractionResult.suggestion?.rentPerAnnum &&
                          !extractionResult.suggestion?.leaseCommencement &&
                          !extractionResult.suggestion?.leaseExpiry &&
                          !extractionResult.suggestion?.reviewMechanism && <li>Nothing recognisable in that document's text.</li>}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Outgoings</h3>
          <button className="btn" onClick={() => setShowOutgoingForm((v) => !v)}>
            {showOutgoingForm ? "Cancel" : "Add outgoing"}
          </button>
        </div>

        {showOutgoingForm && (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Date</label>
                <input type="date" value={outgoingForm.date} onChange={(e) => setOutgoingForm({ ...outgoingForm, date: e.target.value })} />
              </div>
              <div>
                <label>Category</label>
                <select value={outgoingForm.category} onChange={(e) => setOutgoingForm({ ...outgoingForm, category: e.target.value })}>
                  {OUTGOING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {humanize(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Supplier</label>
                <input value={outgoingForm.supplier} onChange={(e) => setOutgoingForm({ ...outgoingForm, supplier: e.target.value })} />
              </div>
              <div>
                <label>Gross amount</label>
                <input type="number" value={outgoingForm.amount} onChange={(e) => setOutgoingForm({ ...outgoingForm, amount: e.target.value })} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={outgoingForm.recoverable}
                onChange={(e) => setOutgoingForm({ ...outgoingForm, recoverable: e.target.checked })}
              />
              Recoverable from tenant
            </label>
            {outgoingForm.recoverable && (
              <>
                <label>Amount actually recovered</label>
                <input
                  type="number"
                  value={outgoingForm.recoveredAmount}
                  onChange={(e) => setOutgoingForm({ ...outgoingForm, recoveredAmount: e.target.value })}
                />
              </>
            )}
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addOutgoing}>
                Add
              </button>
            </div>
          </div>
        )}

        {(property.outgoings || []).length === 0 ? (
          <p className="empty-state">No outgoings recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Gross</th>
                <th>Recovered</th>
                <th>Net cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(property.outgoings || []).map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.date)}</td>
                  <td>{humanize(o.category)}</td>
                  <td>{o.supplier || "—"}</td>
                  <td>{formatCurrency(o.amount)}</td>
                  <td>{formatCurrency(o.recoveredAmount)}</td>
                  <td>{formatCurrency(o.amount - (o.recoveredAmount || 0))}</td>
                  <td>
                    <button className="btn secondary" onClick={() => removeOutgoing(o.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Capital expenditure</h3>
          <button className="btn" onClick={() => setShowCapexForm((v) => !v)}>
            {showCapexForm ? "Cancel" : "Add item"}
          </button>
        </div>

        {showCapexForm && (
          <div style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div>
                <label>Date</label>
                <input type="date" value={capexForm.date} onChange={(e) => setCapexForm({ ...capexForm, date: e.target.value })} />
              </div>
              <div>
                <label>Amount</label>
                <input type="number" value={capexForm.amount} onChange={(e) => setCapexForm({ ...capexForm, amount: e.target.value })} />
              </div>
            </div>
            <label>Description</label>
            <input value={capexForm.description} onChange={(e) => setCapexForm({ ...capexForm, description: e.target.value })} />
            <label>Useful life (years, if known)</label>
            <input
              type="number"
              value={capexForm.usefulLifeYears}
              onChange={(e) => setCapexForm({ ...capexForm, usefulLifeYears: e.target.value })}
            />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addCapex}>
                Add
              </button>
            </div>
          </div>
        )}

        {(property.capitalExpenditure || []).length === 0 ? (
          <p className="empty-state">No capital expenditure recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Tax treatment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(property.capitalExpenditure || []).map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td>{c.description}</td>
                  <td>{formatCurrency(c.amount)}</td>
                  <td>{humanize(c.taxTreatmentStatus)}</td>
                  <td>
                    <button className="btn secondary" onClick={() => removeCapex(c.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Occupancy history</h3>
          <button className="btn" onClick={() => setShowOccupancyForm((v) => !v)}>
            {showOccupancyForm ? "Cancel" : "Add snapshot"}
          </button>
        </div>

        {showOccupancyForm && (
          <div style={{ marginTop: 12 }}>
            <label>As at date</label>
            <input type="date" value={occupancyForm.asAtDate} onChange={(e) => setOccupancyForm({ ...occupancyForm, asAtDate: e.target.value })} />
            <div className="grid grid-2">
              <div>
                <label>Total NLA (m²)</label>
                <input type="number" value={occupancyForm.totalNla} onChange={(e) => setOccupancyForm({ ...occupancyForm, totalNla: e.target.value })} />
              </div>
              <div>
                <label>Occupied NLA (m²)</label>
                <input
                  type="number"
                  value={occupancyForm.occupiedNla}
                  onChange={(e) => setOccupancyForm({ ...occupancyForm, occupiedNla: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addOccupancySnapshot}>
                Add
              </button>
            </div>
          </div>
        )}

        {(property.occupancySnapshots || []).length === 0 ? (
          <p className="empty-state">No historical snapshots recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Occupied / Total NLA</th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {(property.occupancySnapshots || []).map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.asAtDate)}</td>
                  <td>
                    {s.occupiedNla} / {s.totalNla} m²
                  </td>
                  <td>{pct(s.totalNla ? s.occupiedNla / s.totalNla : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Annual snapshots</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          A saved, historical record for a financial year — generated from the live calculation above but never
          silently recalculated once saved.
        </p>
        <div className="toolbar">
          <select id="fy-select" defaultValue="">
            <option value="" disabled>
              Choose a financial year…
            </option>
            {financialYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.label}
              </option>
            ))}
          </select>
          <button
            className="btn secondary"
            onClick={() => {
              const select = document.getElementById("fy-select") as HTMLSelectElement;
              if (select.value) generateAnnualSnapshot(select.value);
            }}
          >
            Generate & save from current figures
          </button>
        </div>
        {(property.annualSnapshots || []).length === 0 ? (
          <p className="empty-state">No annual snapshots saved yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>NOI</th>
                <th>Cap rate</th>
                <th>LVR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(property.annualSnapshots || []).map((s) => (
                <tr key={s.id}>
                  <td>{s.financialYear?.label}</td>
                  <td>{formatCurrency(s.noi)}</td>
                  <td>{pct(s.capRate)}</td>
                  <td>{pct(s.lvr)}</td>
                  <td>{humanize(s.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Loans</h3>
        {(property.loans || []).length === 0 ? (
          <p className="empty-state">No loan secured against this property. Add one from the Loans page.</p>
        ) : (
          <table>
            <tbody>
              {(property.loans || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>{l.lender || "—"}</td>
                  <td>{formatCurrency(l.currentBalance)}</td>
                  <td>{l.interestRate ? `${l.interestRate}%` : "—"}</td>
                  <td>{l.interestOnly ? "Interest-only" : "P&I"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {property.asset && <AssetOwnershipPanel asset={property.asset} entities={entities} onChange={load} />}

      <ItemsPanel parentAssetId={property.assetId} title="Plant & equipment" />

      <InsurancePanel assetId={property.assetId} defaultKind="BUILDING" defaultHolderId={property.asset?.entityId} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="COMMERCIAL_PROPERTY" targetId={property.id} />
      </div>
      {property.asset && <SoldPanel asset={property.asset} onChange={load} />}

      <DeleteSection
        title="Delete this property"
        note="Only possible once it has no tenancies, outgoings, capital works, snapshots or secured loans — that history is kept on purpose. Linked documents are kept."
        question={`Delete ${property.name}? This can't be undone.`}
        action={() => api.commercialProperties.remove(property.id)}
        redirectTo="/properties"
      />
    </div>
  );
}
