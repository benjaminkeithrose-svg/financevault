import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Asset, CommercialProperty, Entity, Liability, Property } from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { HelpLink } from "../components/HelpLink.js";
import { describeVehicle, formatCurrency, liabilityTypeLabel, REPAYMENT_FREQUENCIES } from "../utils.js";

const ALL_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN", "VEHICLE_LOAN", "CREDIT_CARD", "PERSONAL_LOAN", "OTHER"];
const LOAN_TYPES = ["HOME_LOAN", "INVESTMENT_LOAN", "COMMERCIAL_LOAN"];
// Loans that can be tied to the vehicle or boat they paid for.
const VEHICLE_LINKABLE = ["VEHICLE_LOAN", "PERSONAL_LOAN"];

const emptyForm = (liabilityType: string) => ({
  name: "",
  liabilityType,
  entityId: "",
  lender: "",
  currentBalance: "",
  creditLimit: "",
  interestRate: "",
  loanType: "variable",
  repaymentAmount: "",
  repaymentFrequency: "MONTHLY",
  securityPropertyId: "",
  securityCommercialPropertyId: "",
  securityAssetId: "",
  interestOnly: false,
});

export function Liabilities({ scope }: { scope: "loans" | "all" }) {
  const [params, setParams] = useSearchParams();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [commercialProperties, setCommercialProperties] = useState<CommercialProperty[]>([]);
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [securityKind, setSecurityKind] = useState<"none" | "residential" | "commercial">("none");
  const [form, setForm] = useState(emptyForm(scope === "loans" ? "HOME_LOAN" : "CREDIT_CARD"));

  const allowedTypes = scope === "loans" ? LOAN_TYPES : ALL_TYPES;
  const isCard = form.liabilityType === "CREDIT_CARD";

  function load() {
    api.liabilities.list().then((all) => setLiabilities(all.filter((l) => allowedTypes.includes(l.liabilityType))));
  }

  useEffect(load, [scope]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    api.properties.list().then(setProperties);
    api.commercialProperties.list().then(setCommercialProperties);
    api.assets.list().then((all) => setVehicles(all.filter((a) => a.assetType === "VEHICLE")));
  }, []);

  // Arriving from a vehicle's "Add a loan" button: open the form ready to
  // record a loan for that vehicle, owned by the same entity.
  useEffect(() => {
    const vehicleId = params.get("newLoanFor");
    if (!vehicleId || vehicles.length === 0) return;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    setForm({
      ...emptyForm("VEHICLE_LOAN"),
      name: `${describeVehicle({ ...vehicle, registration: null })} loan`,
      entityId: vehicle.entityId,
      securityAssetId: vehicle.id,
    });
    setShowForm(true);
    setParams({}, { replace: true });
  }, [params, vehicles, setParams]);

  async function create() {
    if (!form.name.trim() || !form.entityId) return;
    const isCommercial = form.liabilityType === "COMMERCIAL_LOAN";
    await api.liabilities.create({
      name: form.name,
      liabilityType: form.liabilityType,
      entityId: form.entityId,
      lender: form.lender || null,
      currentBalance: form.currentBalance ? Number(form.currentBalance) : null,
      interestRate: form.interestRate ? Number(form.interestRate) : null,
      creditLimit: isCard && form.creditLimit ? Number(form.creditLimit) : null,
      loanType: isCard ? null : form.loanType || null,
      repaymentAmount: !isCard && form.repaymentAmount ? Number(form.repaymentAmount) : null,
      repaymentFrequency: !isCard ? form.repaymentFrequency : null,
      securityPropertyId: securityKind === "residential" ? form.securityPropertyId || null : null,
      securityCommercialPropertyId: securityKind === "commercial" ? form.securityCommercialPropertyId || null : null,
      securityAssetId: VEHICLE_LINKABLE.includes(form.liabilityType) ? form.securityAssetId || null : null,
      interestOnly: isCommercial ? form.interestOnly : null,
    });
    setForm(emptyForm(form.liabilityType));
    setSecurityKind("none");
    setShowForm(false);
    load();
  }

  function subtitle(l: Liability): string {
    const parts = [liabilityTypeLabel(l.liabilityType), l.entity?.name || "No entity"];
    if (l.lender) parts.push(l.lender);
    if (l.liabilityType === "CREDIT_CARD") {
      parts.push(l.creditLimit ? `limit ${formatCurrency(l.creditLimit)}` : "no limit recorded");
    } else if (l.securityAsset) {
      parts.push(`for ${describeVehicle({ ...l.securityAsset, registration: null })}`);
    }
    if (l.interestRate) parts.push(`${l.interestRate}%`);
    return parts.join(" · ");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {scope === "loans" ? "Loans" : "Liabilities"} <HelpLink topic="loans-assets" />
          </h2>
          <p>
            {scope === "loans"
              ? "Home and investment property loans."
              : "Every debt — property loans, vehicle and boat loans, credit cards, personal loans."}
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={isCard ? "Amex Platinum" : "CBA Home Loan"}
          />
          <label>Type</label>
          <select value={form.liabilityType} onChange={(e) => setForm({ ...form, liabilityType: e.target.value })}>
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {liabilityTypeLabel(t)}
              </option>
            ))}
          </select>
          <label>Owed by</label>
          <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">— Select —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label>{isCard ? "Card provider" : "Lender"}</label>
          <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
          <div className={isCard ? "grid grid-3" : "grid grid-2"}>
            <div>
              <label>{isCard ? "Balance owing" : "Current balance"}</label>
              <input
                type="number"
                value={form.currentBalance}
                onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
              />
            </div>
            {isCard && (
              <div>
                <label>Credit limit</label>
                <input
                  type="number"
                  value={form.creditLimit}
                  onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                />
              </div>
            )}
            <div>
              <label>Interest rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              />
            </div>
          </div>
          {isCard && (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Lenders assess a credit card on its <strong>limit</strong>, not what's owing — so the limit matters when you
              apply for a loan.
            </p>
          )}
          {!isCard && (
            <div className="grid grid-3">
              <div>
                <label>Repayment amount</label>
                <input
                  type="number"
                  value={form.repaymentAmount}
                  onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })}
                />
              </div>
              <div>
                <label>Paid</label>
                <select
                  value={form.repaymentFrequency}
                  onChange={(e) => setForm({ ...form, repaymentFrequency: e.target.value })}
                >
                  {REPAYMENT_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Fixed / variable</label>
                <select value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value })}>
                  <option value="variable">Variable</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
            </div>
          )}
          {VEHICLE_LINKABLE.includes(form.liabilityType) && (
            <>
              <label>What it paid for</label>
              <select value={form.securityAssetId} onChange={(e) => setForm({ ...form, securityAssetId: e.target.value })}>
                <option value="">— Not linked to a vehicle —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({describeVehicle(v)})
                  </option>
                ))}
              </select>
              {vehicles.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Add the vehicle or boat under Vehicles & boats first to link it here.
                </p>
              )}
            </>
          )}
          {LOAN_TYPES.includes(form.liabilityType) && (
            <>
              <label>Security</label>
              <select value={securityKind} onChange={(e) => setSecurityKind(e.target.value as typeof securityKind)}>
                <option value="none">— None —</option>
                <option value="residential">Residential property</option>
                <option value="commercial">Commercial property</option>
              </select>
              {securityKind === "residential" && (
                <select
                  value={form.securityPropertyId}
                  onChange={(e) => setForm({ ...form, securityPropertyId: e.target.value })}
                  style={{ marginTop: 8 }}
                >
                  <option value="">— Select property —</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.asset?.name}
                    </option>
                  ))}
                </select>
              )}
              {securityKind === "commercial" && (
                <select
                  value={form.securityCommercialPropertyId}
                  onChange={(e) => setForm({ ...form, securityCommercialPropertyId: e.target.value })}
                  style={{ marginTop: 8 }}
                >
                  <option value="">— Select property —</option>
                  {commercialProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {form.liabilityType === "COMMERCIAL_LOAN" && (
            <>
              <label>Repayment type</label>
              <select
                value={form.interestOnly ? "io" : "pi"}
                onChange={(e) => setForm({ ...form, interestOnly: e.target.value === "io" })}
              >
                <option value="pi">Principal & interest</option>
                <option value="io">Interest-only</option>
              </select>
            </>
          )}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      )}

      {liabilities.length === 0 ? (
        <p className="empty-state">Nothing here yet.</p>
      ) : (
        <ul className="item-card-list">
          {liabilities.map((l) => (
            <ItemCard
              key={l.id}
              to={`/liabilities/${l.id}`}
              title={l.name}
              subtitle={subtitle(l)}
              right={<strong>{formatCurrency(l.currentBalance)}</strong>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
