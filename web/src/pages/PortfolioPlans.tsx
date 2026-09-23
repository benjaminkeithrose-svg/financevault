import { useEffect, useState } from "react";
import { api, Entity, FinancialYear, PortfolioPlan } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { financialYearLabelForToday, formatCurrency } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";

const emptyForm = {
  name: "",
  entityId: "",
  startFinancialYearId: "",
  projectionYears: "10",
  interestRate: "3",
  rentalGrowthRate: "3",
  capRate: "6",
  annualContribution: "10000",
  refinanceLvrTarget: "70",
  depositPercent: "30",
};

export function PortfolioPlans() {
  const [plans, setPlans] = useState<PortfolioPlan[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [form, setForm, draft] = useDraft("portfolio-plans:new", emptyForm);
  const [showForm, setShowForm] = useState(draft.restored);
  // The current financial year is the default start, applied without
  // touching the form — otherwise an untouched form would count as a draft.
  const [defaultFyId, setDefaultFyId] = useState("");
  const startFinancialYearId = form.startFinancialYearId || defaultFyId;

  function load() {
    api.portfolioPlans.list().then(setPlans);
  }

  useEffect(load, []);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.financialYears.list().then((years) => {
      setFinancialYears(years);
      const current = years.find((y) => y.label === financialYearLabelForToday());
      if (current) setDefaultFyId(current.id);
    });
  }, []);

  async function create() {
    if (!form.name.trim() || !startFinancialYearId) return;
    await api.portfolioPlans.create({
      name: form.name,
      entityId: form.entityId || null,
      startFinancialYearId,
      projectionYears: Number(form.projectionYears),
      interestRate: Number(form.interestRate) / 100,
      rentalGrowthRate: Number(form.rentalGrowthRate) / 100,
      capRate: Number(form.capRate) / 100,
      annualContribution: Number(form.annualContribution),
      refinanceLvrTarget: Number(form.refinanceLvrTarget) / 100,
      depositPercent: Number(form.depositPercent) / 100,
    });
    draft.clear();
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Portfolio Plan <HelpLink topic="portfolio-plan" /></h2>
          <p>A multi-property purchase plan you save at inception, then trend against real outcomes over time.</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New plan"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <DraftNotice draft={draft} />
          <label>Plan name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Commercial portfolio plan" />
          <div className="grid grid-2">
            <div>
              <label>Entity (optional)</label>
              <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
                <option value="">— Not tied to one entity —</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Starting financial year</label>
              <select value={startFinancialYearId} onChange={(e) => setForm({ ...form, startFinancialYearId: e.target.value })}>
                <option value="">— Select —</option>
                {financialYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
            Starting assumptions — every one of these can be tuned on the plan's own page afterwards.
          </p>
          <div className="grid grid-3">
            <div>
              <label>Interest rate %</label>
              <input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
            </div>
            <div>
              <label>Rental/capital growth %</label>
              <input type="number" step="0.01" value={form.rentalGrowthRate} onChange={(e) => setForm({ ...form, rentalGrowthRate: e.target.value })} />
            </div>
            <div>
              <label>Cap rate %</label>
              <input type="number" step="0.01" value={form.capRate} onChange={(e) => setForm({ ...form, capRate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-3">
            <div>
              <label>Refinance target LVR %</label>
              <input
                type="number"
                step="0.01"
                value={form.refinanceLvrTarget}
                onChange={(e) => setForm({ ...form, refinanceLvrTarget: e.target.value })}
              />
            </div>
            <div>
              <label>Default deposit %</label>
              <input type="number" step="0.01" value={form.depositPercent} onChange={(e) => setForm({ ...form, depositPercent: e.target.value })} />
            </div>
            <div>
              <label>Annual contribution ($)</label>
              <input
                type="number"
                value={form.annualContribution}
                onChange={(e) => setForm({ ...form, annualContribution: e.target.value })}
              />
            </div>
          </div>
          <label>Projection years</label>
          <input
            type="number"
            value={form.projectionYears}
            onChange={(e) => setForm({ ...form, projectionYears: e.target.value })}
            style={{ maxWidth: 160 }}
          />
          <FormActions onSubmit={create} draft={draft} label="Create plan" />
        </div>
      )}

      {plans.length === 0 ? (
        <p className="empty-state">No plans yet.</p>
      ) : (
        <ul className="item-card-list">
          {plans.map((p) => (
            <ItemCard
              key={p.id}
              to={`/portfolio-plans/${p.id}`}
              title={p.name}
              subtitle={`${p.entity?.name || "No entity"} · From ${p.startFinancialYear?.label} · ${p.properties?.length ?? 0} properties`}
              right={<span className="tag">{formatCurrency((p.properties || []).reduce((s, pp) => s + pp.purchasePrice, 0))}</span>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
