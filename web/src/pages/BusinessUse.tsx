import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, BusinessUseSchedule } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { recordsChanged } from "../features.js";
import { useTrailTitle } from "../trail.js";
import { financialYearLabelForToday, formatCurrency, formatDate } from "../utils.js";

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "fuel", label: "Fuel and oil (or charging)" },
  { key: "registration", label: "Registration and CTP" },
  { key: "insurance", label: "Insurance" },
  { key: "repairs", label: "Servicing, repairs and tyres" },
  { key: "interest", label: "Interest on the car loan" },
  { key: "leasePayments", label: "Lease payments" },
  { key: "other", label: "Other car costs" },
];

type Form = Record<string, string>;

function toForm(s: BusinessUseSchedule): Form {
  const y = (s.year ?? {}) as unknown as Record<string, number | string | null>;
  const out: Form = {};
  for (const k of ["openingOdometer", "closingOdometer", ...FIELDS.map((f) => f.key), "declineInValue", "businessPercent", "notes"]) {
    out[k] = y[k] == null ? "" : String(y[k]);
  }
  return out;
}

function fyOptions(): string[] {
  const now = Number(financialYearLabelForToday().slice(0, 4));
  return Array.from({ length: 6 }, (_, i) => now - i).map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
}

const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

/**
 * A vehicle's business use schedule for one financial year: the logbook
 * relied on, the year's kilometres and costs, and what can be claimed —
 * worked out the way the owner (a person, company or trust) claims it.
 * Printable for the accountant.
 */
export function BusinessUse() {
  const { id, fy } = useParams<{ id: string; fy: string }>();
  const navigate = useNavigate();
  const [s, setS] = useState<BusinessUseSchedule | null>(null);
  const [form, setForm] = useState<Form>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useTrailTitle(s ? `${fy} business use` : undefined);

  useEffect(() => {
    setS(null);
    api.vehicleBusiness
      .schedule(id!, fy!)
      .then((r) => {
        setS(r);
        setForm(toForm(r));
      })
      .catch((e: Error) => setError(e.message));
  }, [id, fy]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) data[k] = k === "notes" ? v.trim() || null : v.trim() === "" ? null : Number(v);
      const r = await api.vehicleBusiness.saveYear(id!, fy!, data);
      setS(r);
      setForm(toForm(r));
      setSaved("Saved.");
      recordsChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toDeductions() {
    try {
      await api.vehicleBusiness.toWorkDeductions(id!, fy!);
      setSaved(`Put in ${s!.owner.personName}'s work deductions for ${fy}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!s) return <div className="empty-state">{error ?? "Loading…"}</div>;
  const field = (k: string, label: string, hint?: string) => (
    <div key={k}>
      <label>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={form[k] ?? ""}
        placeholder={hint}
        onChange={(e) => {
          setForm({ ...form, [k]: e.target.value });
          setSaved(null);
        }}
      />
    </div>
  );
  const vehicle = [s.asset.year, s.asset.make, s.asset.model].filter(Boolean).join(" ");

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Business use of {s.asset.name} <HelpLink topic="vehicle-business" />
          </h2>
          <p>
            {fy} financial year ({formatDate(s.period.start)} – {formatDate(s.period.end)})
            {vehicle ? ` · ${vehicle}` : ""}
            {s.asset.registration ? ` · rego ${s.asset.registration}` : ""}
          </p>
        </div>
        <div className="toolbar no-print">
          <select aria-label="Financial year" value={fy} onChange={(e) => navigate(`/assets/${id}/business-use/${e.target.value}`, { replace: true })} style={{ width: "auto" }}>
            {fyOptions().map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{s.treatmentTitle}</h3>
        <p className="cap-explain">
          Owned by <strong>{s.owner.name}</strong>. {s.treatmentExplain}
        </p>
        {s.warnings.map((w) => (
          <div key={w} className="message-box warning">
            {w}
          </div>
        ))}
        {s.notes.map((n) => (
          <div key={n} className="message-box info">
            {n}
          </div>
        ))}
      </div>

      {s.treatment !== "SUPER_FUND" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>The schedule</h3>
            <table>
              <tbody>
                <tr>
                  <td>Logbook relied on</td>
                  <td>
                    {s.logbook ? (
                      <>
                        {formatDate(s.logbook.startDate)} – {formatDate(s.logbook.endDate)}: {s.logbook.businessKm.toLocaleString("en-AU")} of{" "}
                        {s.logbook.totalKm.toLocaleString("en-AU")} km for business ({pct(s.logbook.percent)}). Good until {s.logbook.validUntilFy}.
                        {s.logbook.document && (
                          <>
                            {" "}
                            <Link to={`/documents/${s.logbook.document.id}`}>{s.logbook.document.originalFilename}</Link>
                          </>
                        )}
                      </>
                    ) : (
                      "None"
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Odometer</td>
                  <td>
                    {s.year?.openingOdometer != null ? s.year.openingOdometer.toLocaleString("en-AU") : "—"} at 1 July →{" "}
                    {s.year?.closingOdometer != null ? s.year.closingOdometer.toLocaleString("en-AU") : "—"} at 30 June
                    {s.km !== null ? ` · ${s.km.toLocaleString("en-AU")} km this year` : ""}
                    {s.businessKm !== null ? `, about ${s.businessKm.toLocaleString("en-AU")} km for business` : ""}
                  </td>
                </tr>
                <tr>
                  <td>Business use</td>
                  <td>
                    <strong>{pct(s.businessPercent)}</strong>
                    {s.year?.businessPercent != null ? " (entered for this year)" : s.logbook ? " (from the logbook)" : ""}
                  </td>
                </tr>
              </tbody>
            </table>

            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Car costs for the year</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {s.costs
                  .filter((c) => c.amount > 0)
                  .map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(c.amount)}</td>
                    </tr>
                  ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{formatCurrency(s.totalCosts)}</strong>
                  </td>
                </tr>
                {s.treatment === "LOGBOOK" ? (
                  <tr>
                    <td>
                      <strong>Claim: {pct(s.businessPercent)} of the total</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{formatCurrency(s.claim)}</strong>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>
                      <strong>Claimed by {s.owner.name} (actual costs)</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{formatCurrency(s.claim)}</strong>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {s.fbt && (
              <>
                <h4>Fringe benefits tax on private use</h4>
                <p className="cap-explain">
                  Private use: <strong>{pct(s.fbt.privatePercent)}</strong>. A rough guide to compare the two ways of working it out — the
                  FBT year runs 1 April to 31 March, so your accountant works it out for that year:
                </p>
                <ul>
                  <li>
                    Operating cost method (needs the logbook and odometer readings): about {formatCurrency(s.fbt.operatingCostTaxable)} taxable
                    (the private share of this year's costs).
                  </li>
                  <li>
                    Statutory formula (no logbook needed): about {formatCurrency(s.fbt.statutoryTaxable)} taxable — 20% of the car's cost,{" "}
                    {formatCurrency(s.fbt.statutoryBase)}, if it was available for private use all year.
                  </li>
                </ul>
                <p className="cap-explain">Contributions the person makes towards the car's costs reduce either figure.</p>
              </>
            )}

            {s.treatment === "LOGBOOK" && s.owner.personId && s.claim > 0 && (
              <div className="toolbar no-print" style={{ marginTop: 12 }}>
                <button className="btn" onClick={toDeductions}>
                  Put {formatCurrency(s.claim)} in {s.owner.personName}'s work deductions for {fy}
                </button>
                <Link to={`/people/${s.owner.personId}`}>Open {s.owner.personName}</Link>
              </div>
            )}
            {saved && <div className="message-box info no-print">{saved}</div>}
          </div>

          <div className="card no-print">
            <h3 style={{ marginTop: 0 }}>This year's figures</h3>
            <p className="cap-explain">From the receipts, statements and the loan's interest statement. Add those under Documents on the vehicle's page.</p>
            <div className="grid grid-2">
              {field("openingOdometer", "Odometer at 1 July (or when bought)")}
              {field("closingOdometer", "Odometer at 30 June (or when sold)")}
              {FIELDS.map((f) => field(f.key, f.label))}
              {field("declineInValue", "Decline in value — your accountant's figure", s.workedDecline ? `Worked out: ${s.workedDecline.amount}` : "Enter the purchase price and date on the vehicle")}
              {field("businessPercent", "Business use this year, if not the logbook's (%)", s.logbook?.percent != null ? s.logbook.percent.toFixed(1) : "")}
            </div>
            <label>Notes</label>
            <input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {error && <div className="message-box warning">{error}</div>}
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}

      <p className="cap-explain">
        General guidance from the ATO's rules, not tax advice — your accountant makes the final call. Logbook and running-cost records
        are kept for five years after the return is lodged.
      </p>
    </div>
  );
}
