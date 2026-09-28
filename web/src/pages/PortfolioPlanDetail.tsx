import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, CommercialProperty, PlanProperty, PlanPropertyProjection, PortfolioPlan, PortfolioPlanProjection, Property } from "../api/client.js";
import { DrawEquityForm } from "../components/DrawEquityForm.js";
import { EquitySourceCheck } from "../components/EquitySourceCheck.js";
import { CashChart, GrowthChart, PlanTimeline } from "../components/PlanCharts.js";
import { formatCurrency, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { IconBin } from "../components/icons.js";
import { useTrailTitle } from "../trail.js";

function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// Round away floating-point noise (e.g. 0.028*100 -> 2.800000000000003)
// when turning a stored fraction back into a percentage form input.
function toPercentInput(v: number): string {
  return (Math.round(v * 100 * 10000) / 10000).toString();
}

const emptyPropertyForm = {
  name: "",
  acquisitionYearNumber: "1",
  purchasePrice: "",
  initialLvr: "70",
  initialRent: "",
  transferDuty: "",
  otherBuyingCosts: "",
  gstPayable: false,
};
const emptyRefinanceForm = { yearNumber: "", targetLvr: "" };
const emptyDrawForm = { yearNumber: "", amount: "", interestRate: "", sourceAssetId: "" };

export function PortfolioPlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PortfolioPlan | null>(null);
  useTrailTitle(plan?.name);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projection, setProjection] = useState<PortfolioPlanProjection | null>(null);
  const [commercialProperties, setCommercialProperties] = useState<CommercialProperty[]>([]);
  const [residential, setResidential] = useState<Property[]>([]);
  const [recordingDraw, setRecordingDraw] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [propertyForm, setPropertyForm] = useState(emptyPropertyForm);
  const [refinanceFormFor, setRefinanceFormFor] = useState<string | null>(null);
  const [refinanceForm, setRefinanceForm] = useState(emptyRefinanceForm);
  const [drawFormFor, setDrawFormFor] = useState<string | null>(null);
  const [drawForm, setDrawForm] = useState(emptyDrawForm);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ name: string; projection: PortfolioPlanProjection } | null>(null);
  const [holdingPick, setHoldingPick] = useState("");
  const [holdingError, setHoldingError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

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
        startingCash: (p.startingCash ?? 0).toString(),
      });
      // A what-if version: its base plan, to compare against.
      if (p.basePlan) {
        const base = p.basePlan;
        api.portfolioPlans
          .projection(base.id)
          .then((bp) => setCompare({ name: base.name, projection: bp }))
          .catch(() => setCompare(null));
      } else setCompare(null);
    }).catch((e: Error) => setLoadError(e.message));
    api.portfolioPlans.projection(id).then(setProjection);
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.commercialProperties.list().then(setCommercialProperties);
    api.properties.list().then(setResidential).catch(() => setResidential([]));
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
        startingCash: form.startingCash === "" ? 0 : Number(form.startingCash),
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
      transferDuty: propertyForm.transferDuty === "" ? null : Number(propertyForm.transferDuty),
      otherBuyingCosts: propertyForm.otherBuyingCosts === "" ? null : Number(propertyForm.otherBuyingCosts),
      gstPayable: propertyForm.gstPayable,
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

  async function linkProperty(propertyId: string, assetId: string) {
    await api.portfolioPlans.updateProperty(propertyId, { assetId: assetId || null });
    load();
  }

  async function addHolding() {
    if (!id || !holdingPick) return;
    try {
      await api.portfolioPlans.addHolding(id, holdingPick);
      setHoldingPick("");
      setHoldingError(null);
      load();
    } catch (e) {
      setHoldingError((e as Error).message);
    }
  }

  async function removeHolding(holdingId: string, name: string) {
    const deleted = await confirmThenDelete(
      `Take ${name} out of this plan? It stays in your records.`,
      () => api.portfolioPlans.removeHolding(holdingId)
    );
    if (!deleted) return;
    load();
  }

  async function makeWhatIf() {
    if (!id) return;
    setCopying(true);
    try {
      const copy = await api.portfolioPlans.copy(id);
      navigate(`/portfolio-plans/${copy.id}`);
    } finally {
      setCopying(false);
    }
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
    if (!drawForm.yearNumber || !drawForm.amount) {
      setDrawError("Enter the year of the plan it's drawn in, and the amount.");
      return;
    }
    try {
      await api.portfolioPlans.addEquityDraw(propertyId, {
        yearNumber: Number(drawForm.yearNumber),
        amount: Number(drawForm.amount),
        interestRate: drawForm.interestRate ? Number(drawForm.interestRate) / 100 : null,
        sourceAssetId: drawForm.sourceAssetId || null,
      });
    } catch (e) {
      setDrawError((e as Error).message);
      return;
    }
    setDrawError(null);
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

  const linkedAssetIds = new Set((plan.properties || []).map((p) => p.assetId).filter(Boolean));
  const heldAssetIds = new Set((plan.holdings || []).map((h) => h.assetId));
  // Every property owned and not sold — home, rentals and commercial — as a
  // place equity could come from.
  const owned = [
    ...residential
      .filter((r) => !r.asset?.disposalDate)
      .map((r) => ({ assetId: r.assetId, id: r.id, name: r.asset?.name || r.address, page: `/properties/${r.id}`, group: "Homes and rentals" })),
    ...commercialProperties
      .filter((cp) => !cp.asset?.disposalDate)
      .map((cp) => ({ assetId: cp.assetId, id: cp.id, name: cp.name, page: `/commercial-properties/${cp.id}`, group: "Commercial" })),
  ];
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
        <button className="btn secondary" onClick={makeWhatIf} disabled={copying}>
          {copying ? "Copying…" : "Make a what-if copy"}
        </button>
      </div>

      {plan.basePlan && (
        <div className="message-box info">
          A what-if version of <Link to={`/portfolio-plans/${plan.basePlan.id}`}>{plan.basePlan.name}</Link>. Change anything here — the
          original stays as it is — and the graphs compare the two.
        </div>
      )}
      {(plan.whatIfs || []).length > 0 && (
        <p className="cap-explain">
          What-if versions of this plan:{" "}
          {(plan.whatIfs || []).map((w, i) => (
            <span key={w.id}>
              {i > 0 && ", "}
              <Link to={`/portfolio-plans/${w.id}`}>{w.name}</Link>
            </span>
          ))}
        </p>
      )}

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
            <div className="label">Cash in hand (Year {finalYear.yearNumber})</div>
            <div className="value">{formatCurrency(finalYear.cashPool)}</div>
          </div>
        </div>
      )}

      {projection && projection.shortYears.length > 0 && (
        <div className="message-box warning">
          <strong>Not enough cash in {projection.shortYears.length === 1 ? "one year" : `${projection.shortYears.length} years`}.</strong>{" "}
          {projection.shortYears
            .slice(0, 5)
            .map((y) => `Year ${y.yearNumber}: short by ${formatCurrency(y.shortBy)}`)
            .join(" · ")}
          {projection.shortYears.length > 5 ? " …" : ""}. More starting cash, a bigger yearly contribution, an equity draw or a later purchase
          would cover it.
        </div>
      )}

      {projection && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>The plan at a glance</h3>
          <GrowthChart projection={projection} compare={compare} />
          <CashChart projection={projection} compare={compare} />
          <PlanTimeline projection={projection} />
          <p className="cap-explain">Point at a bar, dot or marker to see its figures. The tables further down have them all.</p>
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
        <div className="grid grid-3">
          <div>
            <label>Projection years</label>
            <input type="number" value={form.projectionYears || ""} onChange={(e) => setForm({ ...form, projectionYears: e.target.value })} />
          </div>
          <div>
            <label>Cash on hand at the start ($)</label>
            <input type="number" value={form.startingCash || ""} onChange={(e) => setForm({ ...form, startingCash: e.target.value })} />
          </div>
        </div>
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
        <h3>Properties you already own</h3>
        <p className="cap-explain">
          Add them and the plan starts from what you have: their value, loans and rent come from your records each time, and grow at
          the plan's rate. Equity drawn from one adds to its loan. Your home's loan is left out of the plan's cash, like your other living
          costs.
        </p>
        {(projection?.holdings || []).length > 0 && (
          <ul className="item-card-list">
            {projection!.holdings.map((h) => (
              <li key={h.holdingId} className="item-card" style={{ cursor: "default" }}>
                <div className="item-card-body">
                  <div className="item-card-title">
                    <Link to={h.page}>{h.name}</Link>
                    {h.sold && " (sold)"}
                  </div>
                  <div className="item-card-subtitle">
                    Worth {formatCurrency(h.start.value)} · owing {formatCurrency(h.start.loan)}
                    {h.start.rent ? ` · rent ${formatCurrency(h.start.rent)} a year` : ""}
                    {h.loanInCash ? "" : " · its loan isn't counted in the plan's cash"}
                  </div>
                  {h.missing.length > 0 && (
                    <div className="cap-explain" style={{ margin: "4px 0 0" }}>
                      Not in your records yet: {h.missing.join("; ")}. <Link to={h.page}>Add it on its page</Link>.
                    </div>
                  )}
                </div>
                <button className="btn secondary" onClick={() => removeHolding(h.holdingId, h.name)} aria-label={`Take ${h.name} out of the plan`}>
                  <IconBin /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {owned.filter((o) => !heldAssetIds.has(o.assetId)).length > 0 ? (
          <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <select value={holdingPick} onChange={(e) => setHoldingPick(e.target.value)} style={{ maxWidth: 320 }} aria-label="Property to add">
              <option value="">— Pick a property —</option>
              {["Homes and rentals", "Commercial"].map((g) =>
                owned.some((o) => o.group === g && !heldAssetIds.has(o.assetId)) ? (
                  <optgroup key={g} label={g}>
                    {owned
                      .filter((o) => o.group === g && !heldAssetIds.has(o.assetId))
                      .map((o) => (
                        <option key={o.assetId} value={o.assetId}>
                          {o.name}
                        </option>
                      ))}
                  </optgroup>
                ) : null
              )}
            </select>
            <button className="btn secondary" onClick={addHolding} disabled={!holdingPick}>
              Add to the plan
            </button>
          </div>
        ) : owned.length === 0 ? (
          <p className="cap-explain">No properties are recorded yet. Add them under Properties to bring them in here.</p>
        ) : null}
        {holdingError && <div className="message-box error">{holdingError}</div>}
      </div>

      <div className="card">
        <h3>Planned purchases</h3>
        {(plan.properties || []).length === 0 ? (
          <p className="empty-state">No purchases planned yet.</p>
        ) : (
          <ul className="item-card-list">
            {(plan.properties || []).map((pp) => (
              <li key={pp.id} className="item-card plan-property">
                <div className="plan-property-body">
                  <div className="plan-property-title">
                    {pp.name} — Year {pp.acquisitionYearNumber}
                  </div>
                  <div className="item-card-subtitle">
                    {formatCurrency(pp.purchasePrice)} at {pct(pp.initialLvr)} LVR
                    {pp.initialRent ? ` · ${formatCurrency(pp.initialRent)} rent` : " · rent from cap rate"}
                  </div>
                  <BuyingCosts
                    property={pp}
                    purchase={projection?.properties.find((p) => p.planPropertyId === pp.id)?.purchase ?? null}
                    onChange={load}
                  />
                  <div style={{ marginTop: 8 }}>
                    <label style={{ marginTop: 0 }}>Once it's bought, the property in your records it became</label>
                    <select value={pp.assetId || ""} onChange={(e) => linkProperty(pp.id, e.target.value)} style={{ maxWidth: 320 }}>
                      <option value="">— Not bought yet —</option>
                      {owned
                        .filter((o) => o.assetId === pp.assetId || !linkedAssetIds.has(o.assetId))
                        .map((o) => (
                          <option key={o.assetId} value={o.assetId}>
                            {o.name}
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
                      Equity drawn from a property you own now. Its interest is charged to this purchase; if that property is
                      in the plan (above), its loan grows by the amount too. Refinancing a planned purchase is costed by its
                      own "Add refinance" instead.
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
                                {d.sourceAsset?.name || d.sourceCommercialProperty?.name || "an unspecified source"} at{" "}
                                {d.interestRate ? pct(d.interestRate) : "the plan's default rate"} ·{" "}
                                {formatCurrency(d.amount * (d.interestRate ?? plan.interestRate))}/yr cost
                              </div>
                            </div>
                            {d.liability ? (
                              <span className="cap-explain" style={{ margin: 0 }}>
                                Drawn — <Link to={`/liabilities/${d.liability.id}`}>{d.liability.name}</Link>
                              </span>
                            ) : (
                              <button className="btn secondary" onClick={() => setRecordingDraw(recordingDraw === d.id ? null : d.id)}>
                                Record it as drawn
                              </button>
                            )}
                            <button className="btn secondary" onClick={() => removeEquityDraw(d.id)}>
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(pp.equityDraws || [])
                      .filter((d) => d.id === recordingDraw)
                      .map((d) => {
                        // The property it's drawn from: the plan's source first, then every property owned.
                        const all = owned.map(({ assetId, name, id }) => ({ assetId, name, id }));
                        const ordered = [...all.filter((x) => x.assetId === d.sourceAssetId), ...all.filter((x) => x.assetId !== d.sourceAssetId)];
                        return (
                          <DrawEquityForm
                            key={d.id}
                            properties={ordered}
                            planEquityDrawId={d.id}
                            defaults={{ amount: d.amount, description: `Equity for ${pp.name}`, use: "PROPERTY" }}
                            onDone={(loanId) => navigate(`/liabilities/${loanId}`)}
                            onCancel={() => setRecordingDraw(null)}
                          />
                        );
                      })}
                    {drawFormFor === pp.id ? (
                      <div style={{ marginTop: 8 }}>
                        <label>Property the equity comes from (optional)</label>
                        <select
                          value={drawForm.sourceAssetId}
                          onChange={(e) => setDrawForm({ ...drawForm, sourceAssetId: e.target.value })}
                          style={{ maxWidth: 320 }}
                        >
                          <option value="">— Not decided yet —</option>
                          {["Homes and rentals", "Commercial"].map((g) =>
                            owned.some((o) => o.group === g) ? (
                              <optgroup key={g} label={g}>
                                {owned
                                  .filter((o) => o.group === g)
                                  .map((o) => (
                                    <option key={o.assetId} value={o.assetId}>
                                      {o.name}
                                    </option>
                                  ))}
                              </optgroup>
                            ) : null
                          )}
                        </select>
                        {owned.length === 0 && (
                          <p className="cap-explain">No properties are recorded yet. Add one under Properties to pick it here.</p>
                        )}
                        {drawForm.sourceAssetId && (
                          <EquitySourceCheck
                            assetId={drawForm.sourceAssetId}
                            page={owned.find((o) => o.assetId === drawForm.sourceAssetId)?.page ?? "/properties"}
                          />
                        )}
                        {drawError && <div className="message-box error">{drawError}</div>}
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
                              setDrawError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="toolbar" style={{ marginTop: 8 }}>
                        <button
                          className="btn secondary"
                          onClick={() => {
                            setDrawFormFor(pp.id);
                            setDrawForm(emptyDrawForm);
                            setDrawError(null);
                          }}
                        >
                          Add funding source
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="toolbar plan-property-remove">
                  <button className="btn danger secondary" onClick={() => removeProperty(pp.id)}>
                    <IconBin /> Remove property
                  </button>
                </div>
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
            <div className="grid grid-2">
              <div>
                <label>Stamp duty (blank = estimate at NSW rates)</label>
                <input
                  type="number"
                  value={propertyForm.transferDuty}
                  onChange={(e) => setPropertyForm({ ...propertyForm, transferDuty: e.target.value })}
                />
              </div>
              <div>
                <label>Other buying costs (legal, inspections, lender fees)</label>
                <input
                  type="number"
                  value={propertyForm.otherBuyingCosts}
                  onChange={(e) => setPropertyForm({ ...propertyForm, otherBuyingCosts: e.target.value })}
                />
              </div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={propertyForm.gstPayable}
                onChange={(e) => setPropertyForm({ ...propertyForm, gstPayable: e.target.checked })}
              />
              GST payable (not sold as a going concern)
            </label>
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
                  const ownedThisYear = projection.holdings.map((h) => ({ h, row: h.rows[yearNumber - 1] })).filter((x) => x.row);
                  const ownedRows = ownedThisYear.map(({ h, row }, i) => (
                    <tr key={`${h.holdingId}-${yearNumber}`}>
                      <td>{i === 0 ? `Year ${yearNumber}` : ""}</td>
                      <td>
                        {h.name} (owned){row.drawn ? ` · ${formatCurrency(row.drawn)} drawn` : ""}
                      </td>
                      <td>{formatCurrency(row.propertyValue)}</td>
                      <td>{pct(row.lvr, 0)}</td>
                      <td>{formatCurrency(row.loan)}</td>
                      <td>{formatCurrency(row.rent)}</td>
                      <td>{formatCurrency(row.cashflow)}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{formatCurrency(row.releasableEquity)}</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ));
                  return [...ownedRows, ...rowsThisYear.map(({ p, row }, i) => (
                    <tr key={`${p.planPropertyId}-${yearNumber}`}>
                      <td>{i === 0 && ownedRows.length === 0 ? `Year ${yearNumber}` : ""}</td>
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
                  ))];
                })}
              </tbody>
            </table>
          </div>

          <h3>Portfolio totals by year</h3>
          <p className="cap-explain">
            Cash in hand: {formatCurrency(plan.startingCash ?? 0)} at the start, plus the yearly contribution, rent less interest and
            funding costs, equity drawn and cash released by refinancing, less the cash each purchase needs.
          </p>
          <div className="table-scroll">
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
                <th>Cash to buy</th>
                <th>Equity drawn</th>
                <th>Released by refinancing</th>
                <th>Cash in hand (end of year)</th>
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
                  <td>{y.cashToBuy ? formatCurrency(y.cashToBuy) : "—"}</td>
                  <td>{y.equityDrawn ? formatCurrency(y.equityDrawn) : "—"}</td>
                  <td>{y.refinanceCash ? formatCurrency(y.refinanceCash) : "—"}</td>
                  <td>
                    {formatCurrency(y.cashPool)}
                    {y.short ? " (short)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {(plan.properties || []).some((pp) => pp.asset) && (
        <div className="card">
          <h3>Bought</h3>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            {(plan.properties || [])
              .filter((pp) => pp.asset)
              .map((pp) => (
                <Link
                  key={pp.id}
                  to={
                    pp.asset?.property
                      ? `/properties/${pp.asset.property.id}`
                      : pp.asset?.commercialProperty
                        ? `/commercial-properties/${pp.asset.commercialProperty.id}`
                        : `/assets/${pp.assetId}`
                  }
                  className="tag"
                >
                  {pp.name} → {pp.asset?.name}
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The cash a planned purchase needs beyond the loan: deposit, stamp duty
 * (estimated at NSW rates unless entered), GST if it isn't a going concern,
 * and other buying costs. Editable in place for properties already added.
 */
function BuyingCosts({
  property,
  purchase,
  onChange,
}: {
  property: PlanProperty;
  purchase: PlanPropertyProjection["purchase"] | null;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ transferDuty: "", otherBuyingCosts: "", gstPayable: false });

  function start() {
    setForm({
      transferDuty: property.transferDuty === null || property.transferDuty === undefined ? "" : String(property.transferDuty),
      otherBuyingCosts: property.otherBuyingCosts ? String(property.otherBuyingCosts) : "",
      gstPayable: !!property.gstPayable,
    });
    setEditing(true);
  }

  async function save() {
    await api.portfolioPlans.updateProperty(property.id, {
      transferDuty: form.transferDuty === "" ? null : Number(form.transferDuty),
      otherBuyingCosts: form.otherBuyingCosts === "" ? null : Number(form.otherBuyingCosts),
      gstPayable: form.gstPayable,
    });
    setEditing(false);
    onChange();
  }

  if (!purchase) return null;
  const parts = [
    `deposit ${formatCurrency(purchase.deposit)}`,
    `stamp duty ${formatCurrency(purchase.transferDuty)}${purchase.dutyEstimated ? ` (estimated, NSW ${purchase.dutyRatesYear} rates)` : ""}`,
    purchase.gst ? `GST ${formatCurrency(purchase.gst)}` : null,
    purchase.otherCosts ? `other costs ${formatCurrency(purchase.otherCosts)}` : null,
  ].filter(Boolean);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13 }}>
        <strong>Cash needed to buy: {formatCurrency(purchase.cashNeeded)}</strong>
        <div style={{ color: "var(--text-muted)" }}>{parts.join(" + ")}</div>
      </div>
      {!editing && (
        <button className="link-button" onClick={start}>
          Change buying costs
        </button>
      )}
      {editing && (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Stamp duty (blank = estimate at NSW rates)</label>
              <input type="number" value={form.transferDuty} onChange={(e) => setForm({ ...form, transferDuty: e.target.value })} />
            </div>
            <div>
              <label>Other buying costs (legal, inspections, lender fees)</label>
              <input type="number" value={form.otherBuyingCosts} onChange={(e) => setForm({ ...form, otherBuyingCosts: e.target.value })} />
            </div>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.gstPayable} onChange={(e) => setForm({ ...form, gstPayable: e.target.checked })} />
            GST payable (not sold as a going concern)
          </label>
          <p className="cap-explain">
            A tenanted commercial property sold as a going concern is usually GST-free. If GST is charged, it's paid at
            settlement even if you claim it back later.
          </p>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
