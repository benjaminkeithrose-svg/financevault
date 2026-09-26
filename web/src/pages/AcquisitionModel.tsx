import { useEffect, useState } from "react";
import { api, CommercialProperty } from "../api/client.js";
import { formatCurrency } from "../utils.js";

const emptyForm = {
  purchasePrice: "",
  lvr: "70",
  stampDuty: "",
  legalFees: "",
  dueDiligence: "",
  valuationFee: "",
  otherAcquisitionCosts: "",

  currentRent: "",
  otherIncome: "",
  outgoingsRecovery: "",
  occupancyPercent: "100",

  rates: "",
  insurance: "",
  repairs: "",
  management: "",
  maintenance: "",
  otherExpenses: "",

  interestRate: "6.5",
  loanTermYears: "25",
  repaymentType: "IO" as "IO" | "PI",
  loanFees: "",
};

type Form = typeof emptyForm;

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeOutputs(f: Form) {
  const purchasePrice = num(f.purchasePrice);
  const acquisitionCosts = num(f.stampDuty) + num(f.legalFees) + num(f.dueDiligence) + num(f.valuationFee) + num(f.otherAcquisitionCosts) + num(f.loanFees);
  const totalAcquisitionCost = purchasePrice + acquisitionCosts;

  const lvr = num(f.lvr);
  const loan = purchasePrice * (lvr / 100);
  const requiredEquity = totalAcquisitionCost - loan;

  const occupancy = num(f.occupancyPercent) / 100;
  const effectiveRent = num(f.currentRent) * occupancy;
  const grossIncome = effectiveRent + num(f.otherIncome) + num(f.outgoingsRecovery);

  const totalExpenses = num(f.rates) + num(f.insurance) + num(f.repairs) + num(f.management) + num(f.maintenance) + num(f.otherExpenses);
  const noi = grossIncome - totalExpenses;

  const grossYield = purchasePrice ? grossIncome / purchasePrice : null;
  const netYield = purchasePrice ? noi / purchasePrice : null;
  const capRate = netYield;

  const interestRate = num(f.interestRate);
  const interestExpense = loan * (interestRate / 100);

  let annualDebtService = interestExpense;
  if (f.repaymentType === "PI") {
    const n = num(f.loanTermYears) * 12;
    const r = interestRate / 100 / 12;
    const monthlyPayment = n > 0 && r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / (n || 1);
    annualDebtService = monthlyPayment * 12;
  }

  const cashFlowAfterFinancing = noi - annualDebtService;
  const dscr = annualDebtService ? noi / annualDebtService : null;
  const interestCoverage = interestExpense ? noi / interestExpense : null;

  const fixedIncome = num(f.otherIncome) + num(f.outgoingsRecovery);
  const breakEvenOccupancy =
    num(f.currentRent) > 0 ? (totalExpenses + annualDebtService - fixedIncome) / num(f.currentRent) : null;

  return {
    totalAcquisitionCost,
    requiredEquity,
    loan,
    lvr,
    grossIncome,
    noi,
    grossYield,
    netYield,
    capRate,
    interestExpense,
    annualDebtService,
    cashFlowAfterFinancing,
    equity: requiredEquity,
    dscr,
    interestCoverage,
    breakEvenOccupancy,
  };
}

export function AcquisitionModel() {
  const [form, setForm] = useState<Form>(emptyForm);
  const [properties, setProperties] = useState<CommercialProperty[]>([]);
  const [prefillId, setPrefillId] = useState("");

  useEffect(() => {
    api.commercialProperties.list().then(setProperties);
  }, []);

  async function prefillFrom(id: string) {
    setPrefillId(id);
    if (!id) return;
    const p = await api.commercialProperties.get(id);
    const m = p.metrics;
    setForm((f) => ({
      ...f,
      purchasePrice: p.asset?.currentValue?.toString() || "",
      currentRent: m?.income.grossRent.toString() || "",
      outgoingsRecovery: m?.income.recoveries.toString() || "",
      occupancyPercent: m?.occupancy.occupancyPercent ? (m.occupancy.occupancyPercent * 100).toFixed(0) : "100",
    }));
  }

  function set(field: keyof Form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const out = computeOutputs(form);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Acquisition Model</h2>
          <p>A calculator for a potential purchase — projected figures based on what you enter, not a recommendation.</p>
        </div>
      </div>

      <div className="card">
        <label>Pre-fill from an existing commercial property (optional)</label>
        <select value={prefillId} onChange={(e) => prefillFrom(e.target.value)}>
          <option value="">— Start blank —</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Purchase</h3>
          <label>Purchase price</label>
          <input type="number" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />
          <label>LVR %</label>
          <input type="number" value={form.lvr} onChange={(e) => set("lvr", e.target.value)} />
          <div className="grid grid-2">
            <div>
              <label>Stamp duty</label>
              <input type="number" value={form.stampDuty} onChange={(e) => set("stampDuty", e.target.value)} />
            </div>
            <div>
              <label>Legal fees</label>
              <input type="number" value={form.legalFees} onChange={(e) => set("legalFees", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Due diligence</label>
              <input type="number" value={form.dueDiligence} onChange={(e) => set("dueDiligence", e.target.value)} />
            </div>
            <div>
              <label>Valuation fee</label>
              <input type="number" value={form.valuationFee} onChange={(e) => set("valuationFee", e.target.value)} />
            </div>
          </div>
          <label>Other acquisition costs</label>
          <input type="number" value={form.otherAcquisitionCosts} onChange={(e) => set("otherAcquisitionCosts", e.target.value)} />

          <h3>Financing</h3>
          <div className="grid grid-2">
            <div>
              <label>Interest rate %</label>
              <input type="number" step="0.01" value={form.interestRate} onChange={(e) => set("interestRate", e.target.value)} />
            </div>
            <div>
              <label>Loan term (years)</label>
              <input type="number" value={form.loanTermYears} onChange={(e) => set("loanTermYears", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Repayment type</label>
              <select value={form.repaymentType} onChange={(e) => set("repaymentType", e.target.value)}>
                <option value="IO">Interest-only</option>
                <option value="PI">Principal & interest</option>
              </select>
            </div>
            <div>
              <label>Loan fees</label>
              <input type="number" value={form.loanFees} onChange={(e) => set("loanFees", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Income</h3>
          <label>Current rent (annual)</label>
          <input type="number" value={form.currentRent} onChange={(e) => set("currentRent", e.target.value)} />
          <div className="grid grid-2">
            <div>
              <label>Other income</label>
              <input type="number" value={form.otherIncome} onChange={(e) => set("otherIncome", e.target.value)} />
            </div>
            <div>
              <label>Outgoings recovery</label>
              <input type="number" value={form.outgoingsRecovery} onChange={(e) => set("outgoingsRecovery", e.target.value)} />
            </div>
          </div>
          <label>Occupancy %</label>
          <input type="number" value={form.occupancyPercent} onChange={(e) => set("occupancyPercent", e.target.value)} />

          <h3>Expenses</h3>
          <div className="grid grid-2">
            <div>
              <label>Rates</label>
              <input type="number" value={form.rates} onChange={(e) => set("rates", e.target.value)} />
            </div>
            <div>
              <label>Insurance</label>
              <input type="number" value={form.insurance} onChange={(e) => set("insurance", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Repairs</label>
              <input type="number" value={form.repairs} onChange={(e) => set("repairs", e.target.value)} />
            </div>
            <div>
              <label>Management</label>
              <input type="number" value={form.management} onChange={(e) => set("management", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-2">
            <div>
              <label>Maintenance</label>
              <input type="number" value={form.maintenance} onChange={(e) => set("maintenance", e.target.value)} />
            </div>
            <div>
              <label>Other</label>
              <input type="number" value={form.otherExpenses} onChange={(e) => set("otherExpenses", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Outputs</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Projected from what you entered above — not a recommendation to buy or not to buy.
        </p>
        <div className="grid grid-4">
          <div className="stat-tile">
            <div className="label">Total acquisition cost</div>
            <div className="value">{formatCurrency(out.totalAcquisitionCost)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Loan</div>
            <div className="value">{formatCurrency(out.loan)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">LVR</div>
            <div className="value">{out.lvr.toFixed(1)}%</div>
          </div>
          <div className="stat-tile">
            <div className="label">Required equity</div>
            <div className="value">{formatCurrency(out.requiredEquity)}</div>
          </div>
        </div>
        <div className="grid grid-4" style={{ marginTop: 16 }}>
          <div className="stat-tile">
            <div className="label">Gross income</div>
            <div className="value">{formatCurrency(out.grossIncome)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">NOI</div>
            <div className="value">{formatCurrency(out.noi)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Gross / Net yield</div>
            <div className="value">
              {out.grossYield !== null ? `${(out.grossYield * 100).toFixed(2)}%` : "—"} /{" "}
              {out.netYield !== null ? `${(out.netYield * 100).toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="stat-tile">
            <div className="label">Interest expense</div>
            <div className="value">{formatCurrency(out.interestExpense)}</div>
          </div>
        </div>
        <div className="grid grid-4" style={{ marginTop: 16 }}>
          <div className="stat-tile">
            <div className="label">Cash flow after financing</div>
            <div className="value">{formatCurrency(out.cashFlowAfterFinancing)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">DSCR</div>
            <div className="value">{out.dscr !== null ? `${out.dscr.toFixed(2)}x` : "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Interest coverage</div>
            <div className="value">{out.interestCoverage !== null ? `${out.interestCoverage.toFixed(2)}x` : "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Break-even occupancy</div>
            <div className="value">
              {out.breakEvenOccupancy !== null ? `${(out.breakEvenOccupancy * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
