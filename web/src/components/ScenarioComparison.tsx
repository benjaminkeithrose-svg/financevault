import { useState } from "react";
import { CommercialPropertyMetrics } from "../api/client.js";
import { formatCurrency } from "../utils.js";

interface Scenario {
  id: string;
  name: string;
  rentGrowthPercent: string;
  vacancyPercent: string;
  interestRatePercent: string;
}

function computeScenario(
  scenario: Scenario,
  base: { grossRent: number; recoveries: number; grossOperatingExpenses: number; totalDebt: number; propertyValue: number | null }
) {
  const rentGrowth = Number(scenario.rentGrowthPercent) || 0;
  const vacancy = Number(scenario.vacancyPercent) || 0;
  const interestRate = Number(scenario.interestRatePercent) || 0;

  const grossRent = base.grossRent * (1 + rentGrowth / 100) * (1 - vacancy / 100);
  const noi = grossRent + base.recoveries - base.grossOperatingExpenses;
  const interestExpense = base.totalDebt * (interestRate / 100);
  const cashFlow = noi - interestExpense;
  const netYield = base.propertyValue ? noi / base.propertyValue : null;

  return { grossRent, noi, interestExpense, cashFlow, netYield };
}

let idCounter = 0;

export function ScenarioComparison({ metrics }: { metrics: CommercialPropertyMetrics }) {
  const baseWeightedRate = metrics.debt.totalDebt
    ? (metrics.debt.estimatedAnnualInterest / metrics.debt.totalDebt) * 100
    : 0;

  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  function addScenario() {
    idCounter += 1;
    setScenarios((prev) => [
      ...prev,
      {
        id: `scenario-${idCounter}`,
        name: `Scenario ${prev.length + 1}`,
        rentGrowthPercent: "0",
        vacancyPercent: "0",
        interestRatePercent: baseWeightedRate.toFixed(2),
      },
    ]);
  }

  function updateScenario(id: string, field: keyof Scenario, value: string) {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function removeScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  const base = {
    grossRent: metrics.income.grossRent,
    recoveries: metrics.income.recoveries,
    grossOperatingExpenses: metrics.income.grossOperatingExpenses,
    totalDebt: metrics.debt.totalDebt,
    propertyValue: metrics.yields.propertyValue,
  };

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Scenario analysis</h3>
        <button className="btn secondary" onClick={addScenario}>
          Add scenario
        </button>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Compares your own assumptions against the current base case. Not a prediction of what's likely — figures are
        shown exactly as calculated from what you enter.
      </p>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Base case (current)</th>
            {scenarios.map((s) => (
              <th key={s.id}>
                <input
                  value={s.name}
                  onChange={(e) => updateScenario(s.id, "name", e.target.value)}
                  style={{ fontWeight: 600, marginBottom: 4 }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Rent growth %</td>
            <td>—</td>
            {scenarios.map((s) => (
              <td key={s.id}>
                <input
                  type="number"
                  value={s.rentGrowthPercent}
                  onChange={(e) => updateScenario(s.id, "rentGrowthPercent", e.target.value)}
                />
              </td>
            ))}
          </tr>
          <tr>
            <td>Vacancy %</td>
            <td>{((1 - (metrics.occupancy.occupancyPercent ?? 1)) * 100).toFixed(1)}%</td>
            {scenarios.map((s) => (
              <td key={s.id}>
                <input
                  type="number"
                  value={s.vacancyPercent}
                  onChange={(e) => updateScenario(s.id, "vacancyPercent", e.target.value)}
                />
              </td>
            ))}
          </tr>
          <tr>
            <td>Interest rate %</td>
            <td>{baseWeightedRate.toFixed(2)}%</td>
            {scenarios.map((s) => (
              <td key={s.id}>
                <input
                  type="number"
                  step="0.01"
                  value={s.interestRatePercent}
                  onChange={(e) => updateScenario(s.id, "interestRatePercent", e.target.value)}
                />
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ borderTop: "2px solid var(--border)" }}>Gross rent</td>
            <td style={{ borderTop: "2px solid var(--border)" }}>{formatCurrency(base.grossRent)}</td>
            {scenarios.map((s) => (
              <td key={s.id} style={{ borderTop: "2px solid var(--border)" }}>
                {formatCurrency(computeScenario(s, base).grossRent)}
              </td>
            ))}
          </tr>
          <tr>
            <td>NOI</td>
            <td>{formatCurrency(metrics.income.noi)}</td>
            {scenarios.map((s) => (
              <td key={s.id}>{formatCurrency(computeScenario(s, base).noi)}</td>
            ))}
          </tr>
          <tr>
            <td>Interest expense</td>
            <td>{formatCurrency(metrics.debt.estimatedAnnualInterest)}</td>
            {scenarios.map((s) => (
              <td key={s.id}>{formatCurrency(computeScenario(s, base).interestExpense)}</td>
            ))}
          </tr>
          <tr>
            <td>Cash flow (NOI − interest)</td>
            <td>{formatCurrency(metrics.income.noi - metrics.debt.estimatedAnnualInterest)}</td>
            {scenarios.map((s) => (
              <td key={s.id}>{formatCurrency(computeScenario(s, base).cashFlow)}</td>
            ))}
          </tr>
          <tr>
            <td>Net yield</td>
            <td>{metrics.yields.netYield !== null ? `${(metrics.yields.netYield * 100).toFixed(2)}%` : "—"}</td>
            {scenarios.map((s) => {
              const y = computeScenario(s, base).netYield;
              return <td key={s.id}>{y !== null ? `${(y * 100).toFixed(2)}%` : "—"}</td>;
            })}
          </tr>
          <tr>
            <td></td>
            <td></td>
            {scenarios.map((s) => (
              <td key={s.id}>
                <button className="btn secondary" onClick={() => removeScenario(s.id)}>
                  Remove
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
