import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, CommercialProperty, PortfolioPlan, PortfolioPlanProjection } from "../api/client.js";
import { formatCurrency, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";

function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// Round away floating-point noise (e.g. 0.028*100 -> 2.800000000000003)
// when turning a stored fraction back into a percentage form input.
function toPercentInput(v: number): string {
  return (Math.round(v * 100 * 10000) / 10000).toString();
}

const emptyPropertyForm = { name: "", acquisitionYearNumber: "1", purchasePrice: "", initialLvr: "70", initialRent: "" };
const emptyRefinanceForm = { yearNumber: "", targetLvr: "" };
const emptyDrawForm = { yearNumber: "", amount: "", interestRate: "", sourceCommercialPropertyId: "" };

// Live headroom check for a real property being considered as an equity
// source — informational only, never blocks the draw.
function headroom(cp: CommercialProperty, targetLvr: number): { value: number; debt: number; lvr: number | null; headroomToTarget: number } | null {
  const value = cp.asset?.currentValue;
  if (value === null || value === undefined) return null;
  const debt = (cp.loans || []).reduce((s, l) => s + (l.currentBalance ?? 0), 0);
  return { value, debt, lvr: value ? debt / value : null, headroomToTarget: targetLvr * value - debt };
}

export function PortfolioPlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PortfolioPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projection, setProjection] = useState<PortfolioPlanProjection | null>(null);
  const [commercialProperties, setCommercialProperties] = useState<CommercialProperty[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [propertyForm, setPropertyForm] = useState(emptyPropertyForm);
  const [refinanceFormFor, setRefinanceFormFor] = useState<string | null>(null);
  const [refinanceForm, setRefinanceForm] = useState(emptyRefinanceForm);
  const [drawFormFor, setDrawFormFor] = useState<string | null>(null);
  const [drawForm, setDrawForm] = useState(emptyDrawForm);

  function load() {
    if (!id) return;
    api.portfolioPlans.get(id).then((p) => {
      setPlan(p);
      setForm({
        name: p.name,
        interestRate: toPercentInput(p.interestRate),
        rentalGrowthRate: toPercentInput(p.rentalGrowthRate),
        capRate: toPercentInput(p.capRate),
        annualContribution: p.annualContribution.toString(),
        refinanceLvrTarget: toPercentInput(p.refinanceLvrTarget),
        depositPercent: toPercentInput(p.depositPercent),
        projectionYears: p.projectionYears.toString(),
      });
    }).catch((e: Error) => setLoadError(e.message));
    api.portfolioPlans.projection(id).then(setProjection);
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.commercialProperties.list().then(setCommercialProperties);
  }, []);

  if (!plan) {
    if (loadError) return <LoadFailed message={loadError} backTo="/portfolio-plans" backLabel="Back to portfolio plans" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function saveAssumptions() {
    if (!id) return;
    setSaving(true);
    try {
      await api.portfolioPlans.update(id, {
        name: form.name,
        interestRate: Number(form.interestRate) / 100,
        rentalGrowthRate: Number(form.rentalGrowthRate) / 100,
        capRate: Number(form.capRate) / 100,
        annualContribution: Number(form.annualContribution),
        refinanceLvrTarget: Number(form.refinanceLvrTarget) / 100,
        depositPercent: Number(form.depositPercent) / 100,
        projectionYears: Number(form.projectionYears),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!id) return;
    const deleted = await confirmThenDelete(
      "Delete this whole plan, including its properties, refinances and equity draws?",
      () => api.portfolioPlans.remove(id)
    );
    if (!deleted) return;
    navigate("/portfolio-plans");
  }

  async function addProperty() {
    if (!id || !propertyForm.name.trim() || !propertyForm.purchasePrice) return;
    await api.portfolioPlans.addProperty(id, {
      name: propertyForm.name,
      acquisitionYearNumber: Number(propertyForm.acquisitionYearNumber),
      purchasePrice: Number(propertyForm.purchasePrice),
      initialLvr: Number(propertyForm.initialLvr) / 100,
      initialRent: propertyForm.initialRent ? Number(propertyForm.initialRent) : null,
    });
    setPropertyForm(emptyPropertyForm);
    setShowPropertyForm(false);
    load();
  }

  async function removeProperty(propertyId: string) {
    const deleted = await confirmThenDelete(
      "Remove this property from the plan?",
      () => api.portfolioPlans.removeProperty(propertyId)
    );
    if (!deleted) return;
    load();
  }

  async function linkProperty(propertyId: string, commercialPropertyId: string) {
    await api.portfolioPlans.updateProperty(propertyId, { commercialPropertyId: commercialPropertyId || null });
    load();
  }

  async function addRefinance(propertyId: string) {
    if (!refinanceForm.yearNumber) return;
    await api.portfolioPlans.addRefinance(propertyId, {
      yearNumber: Number(refinanceForm.yearNumber),
      targetLvr: refinanceForm.targetLvr ? Number(refinanceForm.targetLvr) / 100 : null,
    });
    setRefinanceForm(emptyRefinanceForm);
    setRefinanceFormFor(null);
    load();
  }

  async function removeRefinance(refinanceId: string) {
    const deleted = await confirmThenDelete(
      "Remove this refinance from the plan?",
      () => api.portfolioPlans.removeRefinance(refinanceId)
    );
    if (!deleted) return;
    load();
  }

  async function addEquityDraw(propertyId: string) {
    if (!drawForm.yearNumber || !drawForm.amount) return;
    await api.portfolioPlans.addEquityDraw(propertyId, {
      yearNumber: Number(drawForm.yearNumber),
      amount: Number(drawForm.amount),
      interestRate: drawForm.interestRate ? Number(drawForm.interestRate) / 100 : null,
      sourceCommercialPropertyId: drawForm.sourceCommercialPropertyId || null,
    });
    setDrawForm(emptyDrawForm);
    setDrawFormFor(null);
    load();
  }

  async function removeEquityDraw(drawId: string) {
    const deleted = await confirmThenDelete(
      "Remove this equity draw from the plan?",
      () => api.portfolioPlans.removeEquityDraw(drawId)
    );
    if (!deleted) return;
    load();
  }

  const linkedIds = new Set((plan.properties || []).map((p) => p.commercialPropertyId).filter(Boolean));
  const finalYear = projection?.portfolioByYear[projection.portfolioByYear.length - 1];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{plan.name}</h2>
          <p>
            {plan.entity?.name || "No entity"} · From {plan.startFinancialYear?.label}
          </p>
        </div>
      </div>

      {finalYear && (
        <div className="grid grid-4">
          <div className="stat-tile">
            <div className="label">Portfolio size (Year {finalYear.yearNumber})</div>
            <div className="value">{formatCurrency(finalYear.totalValue)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Yearly cashflow (Year {finalYear.yearNumber})</div>
            <div className="value">{formatCurrency(finalYear.totalCashflow)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Equity (Year {finalYear.yearNumber})</div>
            <div className="value">{formatCurrency(finalYear.totalEquity)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Properties</div>
            <div className="value">{finalYear.numberOfProperties}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Assumptions</h3>
        <label>Plan name</label>
        <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-3">
          <div>
            <label>Interest rate %</label>
            <input type="number" step="0.01" value={form.interestRate || ""} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
          </div>
          <div>
            <label>Rental/capital growth %</label>
            <input
              type="number"
              step="0.01"
              value={form.rentalGrowthRate || ""}
              onChange={(e) => setForm({ ...form, rentalGrowthRate: e.target.value })}
            />
          </div>
          <div>
            <label>Cap rate %</label>
            <input type="number" step="0.01" value={form.capRate || ""} onChange={(e) => setForm({ ...form, capRate: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-3">
          <div>
            <label>Refinance target LVR %</label>
            <input
              type="number"
              step="0.01"
              value={form.refinanceLvrTarget || ""}
              onChange={(e) => setForm({ ...form, refinanceLvrTarget: e.target.value })}
            />
          </div>
          <div>
            <label>Default deposit %</label>
            <input type="number" step="0.01" value={form.depositPercent || ""} onChange={(e) => setForm({ ...form, depositPercent: e.target.value })} />
          </div>
          <div>
            <label>Annual contribution ($)</label>
            <input
              type="number"
              value={form.annualContribution || ""}
              onChange={(e) => setForm({ ...form, annualContribution: e.target.value })}
            />
          </div>
        </div>
        <label>Projection years</label>
        <input
          type="number"
          value={form.projectionYears || ""}
          onChange={(e) => setForm({ ...form, projectionYears: e.target.value })}
          style={{ maxWidth: 160 }}
        />
        <div className="toolbar" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="btn" onClick={saveAssumptions} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn danger secondary" onClick={removePlan}>
            Delete plan
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Properties</h3>
        {(plan.properties || []).length === 0 ? (
          <p className="empty-state">No properties in this plan yet.</p>
        ) : (
          <ul className="item-card-list">
            {(plan.properties || []).map((pp) => (
              <li key={pp.id} className="item-card" style={{ cursor: "default", flexWrap: "wrap" }}>
                <div className="item-card-body">
                  <div className="item-card-title">
                    {pp.name} — Year {pp.acquisitionYearNumber}
                  </div>
                  <div className="item-card-subtitle">
                    {formatCurrency(pp.purchasePrice)} at {pct(pp.initialLvr)} LVR
                    {pp.initialRent ? ` · ${formatCurrency(pp.initialRent)} rent` : " · rent from cap rate"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ marginTop: 0 }}>Link to a real Commercial Property (once purchased)</label>
                    <select
                      value={pp.commercialPropertyId || ""}
                      onChange={(e) => linkProperty(pp.id, e.target.value)}
                      style={{ maxWidth: 320 }}
                    >
                      <option value="">— Not yet purchased —</option>
                      {commercialProperties
                        .filter((cp) => cp.id === pp.commercialPropertyId || !linkedIds.has(cp.id))
                        .map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cp.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ fontSize: 13 }}>Refinances</strong>
                    {(pp.refinances || []).length === 0 ? (
                      <p className="empty-state" style={{ padding: "8px 0" }}>
                        None planned.
                      </p>
                    ) : (
                      <ul className="item-card-list">
                        {(pp.refinances || []).map((r) => (
                          <li key={r.id} className="item-card" style={{ cursor: "default", padding: "8px 12px" }}>
                            <div className="item-card-body">
                              <div className="item-card-subtitle">
                                Year {r.yearNumber}{r.targetLvr ? ` · to ${pct(r.targetLvr)} LVR` : " · to plan's default target LVR"}
                              </div>
                            </div>
                            <button className="btn secondary" onClick={() => removeRefinance(r.id)}>
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {refinanceFormFor === pp.id ? (
                      <div className="toolbar" style={{ marginTop: 8 }}>
                        <input
                          type="number"
                          placeholder="Year"
                          value={refinanceForm.yearNumber}
                          onChange={(e) => setRefinanceForm({ ...refinanceForm, yearNumber: e.target.value })}
                          style={{ width: 100 }}
                        />
                        <input
                          type="number"
                          placeholder="Target LVR % (optional)"
                          value={refinanceForm.targetLvr}
                          onChange={(e) => setRefinanceForm({ ...refinanceForm, targetLvr: e.target.value })}
                          style={{ width: 180 }}
                        />
                        <button className="btn secondary" onClick={() => addRefinance(pp.id)}>
                          Add
                        </button>
                        <button className="btn secondary" onClick={() => setRefinanceFormFor(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="toolbar" style={{ marginTop: 8 }}>
                        <button className="btn secondary" onClick={() => setRefinanceFormFor(pp.id)}>
                          Add refinance
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <strong style={{ fontSize: 13 }}>Funding (equity pulled from a property you already own)</strong>
                    <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0" }}>
                      Only for equity pulled from a REAL property outside this plan — refinancing a property that's
                      already IN this plan is costed automatically via its own "Add refinance" above.
                    </p>
                    {(pp.equityDraws || []).length === 0 ? (
                      <p className="empty-state" style={{ padding: "8px 0" }}>
                        No external funding recorded — this purchase is assumed self-funded.
                      </p>
                    ) : (
                      <ul className="item-card-list">
                        {(pp.equityDraws || []).map((d) => (
                          <li key={d.id} className="item-card" style={{ cursor: "default", padding: "8px 12px" }}>
                            <div className="item-card-body">
                              <div className="item-card-subtitle">
                                Year {d.yearNumber} · {formatCurrency(d.amount)} from{" "}
                                {d.sourceCommercialProperty?.name || "an unspecified source"} at{" "}
                                {d.interestRate ? pct(d.interestRate) : "the plan's default rate"} ·{" "}
                                {formatCurrency(d.amount * (d.interestRate ?? plan.interestRate))}/yr cost
                              </div>
                            </div>
                            <button className="btn secondary" onClick={() => removeEquityDraw(d.id)}>
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {drawFormFor === pp.id ? (
                      <div style={{ marginTop: 8 }}>
                        <label>Source property (optional — leave blank for an unspecified source)</label>
                        <select
                          value={drawForm.sourceCommercialPropertyId}
                          onChange={(e) => setDrawForm({ ...drawForm, sourceCommercialPropertyId: e.target.value })}
                          style={{ maxWidth: 320 }}
                        >
                          <option value="">— Unspecified source —</option>
                          {commercialProperties.map((cp) => (
                            <option key={cp.id} value={cp.id}>
                              {cp.name}
                            </option>
                          ))}
                        </select>
                        {drawForm.sourceCommercialPropertyId &&
                          (() => {
                            const source = commercialProperties.find((cp) => cp.id === drawForm.sourceCommercialPropertyId);
                            const h = source ? headroom(source, plan.refinanceLvrTarget) : null;
                            return h ? (
                              <div className="message-box info">
                                Currently {formatCurrency(h.value)} value, {formatCurrency(h.debt)} debt (
                                {pct(h.lvr)} LVR) — about {formatCurrency(h.headroomToTarget)} of headroom to the
                                plan's {pct(plan.refinanceLvrTarget)} target LVR.
                              </div>
                            ) : (
                              <div className="message-box warning">No current value recorded for this property yet.</div>
                            );
                          })()}
                        <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
                          <input
                            type="number"
                            placeholder="Year"
                            value={drawForm.yearNumber}
                            onChange={(e) => setDrawForm({ ...drawForm, yearNumber: e.target.value })}
                            style={{ width: 100 }}
                          />
                          <input
                            type="number"
                            placeholder="Amount drawn"
                            value={drawForm.amount}
                            onChange={(e) => setDrawForm({ ...drawForm, amount: e.target.value })}
                            style={{ width: 160 }}
                          />
                          <input
                            type="number"
                            placeholder="Rate % (optional)"
                            value={drawForm.interestRate}
                            onChange={(e) => setDrawForm({ ...drawForm, interestRate: e.target.value })}
                            style={{ width: 160 }}
                          />
                          <button className="btn secondary" onClick={() => addEquityDraw(pp.id)}>
                            Add
                          </button>
                          <button
                            className="btn secondary"
                            onClick={() => {
                              setDrawFormFor(null);
                              setDrawForm(emptyDrawForm);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="toolbar" style={{ marginTop: 8 }}>
                        <button className="btn secondary" onClick={() => setDrawFormFor(pp.id)}>
                          Add funding source
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button className="btn danger secondary" onClick={() => removeProperty(pp.id)}>
                  Remove property
                </button>
              </li>
            ))}
          </ul>
        )}

        {showPropertyForm ? (
          <div style={{ marginTop: 16 }}>
            <label>Property name</label>
            <input value={propertyForm.name} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} placeholder="Property 2" />
            <div className="grid grid-2">
              <div>
                <label>Acquisition year (plan year number)</label>
                <input
                  type="number"
                  value={propertyForm.acquisitionYearNumber}
                  onChange={(e) => setPropertyForm({ ...propertyForm, acquisitionYearNumber: e.target.value })}
                />
              </div>
              <div>
                <label>Purchase price</label>
                <input
                  type="number"
                  value={propertyForm.purchasePrice}
                  onChange={(e) => setPropertyForm({ ...propertyForm, purchasePrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-2">
              <div>
                <label>Initial LVR %</label>
                <input type="number" value={propertyForm.initialLvr} onChange={(e) => setPropertyForm({ ...propertyForm, initialLvr: e.target.value })} />
              </div>
              <div>
                <label>Starting rent (optional — else derived from cap rate)</label>
                <input
                  type="number"
                  value={propertyForm.initialRent}
                  onChange={(e) => setPropertyForm({ ...propertyForm, initialRent: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addProperty}>
                Add property
              </button>
              <button className="btn secondary" onClick={() => setShowPropertyForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn secondary" onClick={() => setShowPropertyForm(true)}>
              Add property
            </button>
          </div>
        )}
      </div>

      {projection && (
        <div className="card">
          <h3>Projection</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{projection.note}</p>

          {projection.properties.some((p) => p.hasFunding) && (
            <ul className="item-card-list" style={{ marginBottom: 12 }}>
              {projection.properties
                .filter((p) => p.hasFunding)
                .map((p) => (
                  <li key={p.planPropertyId} className="message-box info" style={{ listStyle: "none" }}>
                    {p.name}:{" "}
                    {p.positivelyGearedFromYear
                      ? `positively geared (after the cost of its funding) from Year ${p.positivelyGearedFromYear}`
                      : `not yet positively geared after funding cost within the ${plan.projectionYears}-year projection`}
                  </li>
                ))}
            </ul>
          )}

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Property</th>
                  <th>Value</th>
                  <th>LVR</th>
                  <th>Loan</th>
                  <th>Rent</th>
                  <th>Cashflow</th>
                  <th>Funding cost</th>
                  <th>Net after funding</th>
                  <th>Accumulated</th>
                  <th>Redeployment capacity</th>
                  <th>Actual value</th>
                  <th>Actual cashflow</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: plan.projectionYears }, (_, i) => i + 1).flatMap((yearNumber) => {
                  const rowsThisYear = projection.properties
                    .map((p) => ({ p, row: p.rows.find((r) => r.yearNumber === yearNumber) }))
                    .filter((x): x is { p: (typeof projection.properties)[number]; row: NonNullable<typeof x.row> } => Boolean(x.row));
                  return rowsThisYear.map(({ p, row }, i) => (
                    <tr key={`${p.planPropertyId}-${yearNumber}`}>
                      <td>{i === 0 ? `Year ${yearNumber}` : ""}</td>
                      <td>
                        {p.name}
                        {row.trancheStartYear === yearNumber && yearNumber !== p.acquisitionYearNumber ? " (refinanced)" : ""}
                      </td>
                      <td>{formatCurrency(row.propertyValue)}</td>
                      <td>{pct(row.lvr, 0)}</td>
                      <td>{formatCurrency(row.loan)}</td>
                      <td>{formatCurrency(row.rent)}</td>
                      <td>{formatCurrency(row.cashflow)}</td>
                      <td>{row.fundingCost ? formatCurrency(row.fundingCost) : "—"}</td>
                      <td>{row.fundingCost ? formatCurrency(row.netCashflowAfterFunding) : "—"}</td>
                      <td>{formatCurrency(row.accumulatedCashflowSinceTranche)}</td>
                      <td>{formatCurrency(row.redeploymentCapacity)}</td>
                      <td>{row.actual?.propertyValue !== null && row.actual?.propertyValue !== undefined ? formatCurrency(row.actual.propertyValue) : "—"}</td>
                      <td>{row.actual?.cashFlow !== null && row.actual?.cashFlow !== undefined ? formatCurrency(row.actual.cashFlow) : "—"}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>

          <h3>Portfolio totals by year</h3>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Properties</th>
                <th>Total value</th>
                <th>Total loan</th>
                <th>Total equity</th>
                <th>Yearly cashflow</th>
                <th>Funding cost</th>
                <th>Net after funding</th>
                <th>Contributions to date</th>
                <th>Available for redeployment</th>
              </tr>
            </thead>
            <tbody>
              {projection.portfolioByYear.map((y) => (
                <tr key={y.yearNumber}>
                  <td>Year {y.yearNumber}</td>
                  <td>{y.numberOfProperties}</td>
                  <td>{formatCurrency(y.totalValue)}</td>
                  <td>{formatCurrency(y.totalLoan)}</td>
                  <td>{formatCurrency(y.totalEquity)}</td>
                  <td>{formatCurrency(y.totalCashflow)}</td>
                  <td>{y.totalFundingCost ? formatCurrency(y.totalFundingCost) : "—"}</td>
                  <td>{y.totalFundingCost ? formatCurrency(y.totalCashflowAfterFunding) : "—"}</td>
                  <td>{formatCurrency(y.cumulativeContributions)}</td>
                  <td>{formatCurrency(y.totalAvailableForRedeployment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(plan.properties || []).some((pp) => pp.commercialPropertyId) && (
        <div className="card">
          <h3>Linked properties</h3>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            {(plan.properties || [])
              .filter((pp) => pp.commercialPropertyId)
              .map((pp) => (
                <Link key={pp.id} to={`/commercial-properties/${pp.commercialPropertyId}`} className="tag">
                  {pp.name} → {pp.commercialProperty?.name}
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
