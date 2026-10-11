import { useEffect, useState } from "react";
import { api, Asset, Property } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * The figures behind a property's after-tax profit: running costs a year
 * (homes and residential rentals — a commercial property's come from its
 * outgoings), the land value for land tax, and the yearly amounts from the
 * depreciation schedule. Shown on Reports → Property Profit.
 */

// Which figures apply: management and the depreciation schedule only when
// it's rented; land value and land tax not for a home (exempt from land tax).
type Applies = "rented" | "landTax";

const COSTS: Array<{ key: keyof Property; label: string; only?: Applies }> = [
  { key: "councilRates", label: "Council rates a year" },
  { key: "waterRates", label: "Water rates a year" },
  { key: "strataFees", label: "Strata a year" },
  { key: "managementPercent", label: "Property management (% of rent)", only: "rented" },
  { key: "repairsPerYear", label: "Repairs and maintenance a year" },
  { key: "otherCostsPerYear", label: "Other costs a year" },
];
const ASSET_FIELDS: Array<{ key: keyof Asset; label: string; only?: Applies }> = [
  { key: "landValue", label: "Land value (Valuer General)", only: "landTax" },
  { key: "landTaxPerYear", label: "Land tax as assessed a year (if known)", only: "landTax" },
  { key: "depreciationPerYear", label: "Depreciation of fittings a year", only: "rented" },
  { key: "capitalWorksPerYear", label: "Building write-off a year", only: "rented" },
];

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: string) => (v === "" ? null : Number(v));

export function PropertyCostsCard({ property, asset, onChange }: { property: Property | null; asset: Asset; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const residential = property !== null;
  // Set with "How it's used" at the top of the property's page.
  const isHome = property?.use ? property.use === "HOME" : asset.mainResidence === "FULL";
  const partRented = property?.use === "HOME_PART_RENTED" || property?.use === "HOLIDAY_RENTED";
  // A commercial property is always rented and pays land tax.
  const use = property ? (property.use ?? (isHome ? "HOME" : "INVESTMENT")) : "INVESTMENT";
  const rented = !["HOME", "HOLIDAY"].includes(use);
  const landTax = !["HOME", "HOME_PART_RENTED"].includes(use);
  const applies = (only?: Applies) => (only === "rented" ? rented : only === "landTax" ? landTax : true);
  // Hidden figures are kept, just not shown or saved over.
  const costs = COSTS.filter((c) => applies(c.only));
  const assetFields = ASSET_FIELDS.filter((a) => applies(a.only));

  useEffect(() => {
    const f: Record<string, string> = {};
    for (const c of COSTS) f[c.key] = str(property?.[c.key]);
    for (const a of ASSET_FIELDS) f[a.key] = str(asset[a.key]);
    f.ownershipReason = asset.ownershipReason ?? "";
    setForm(f);
  }, [property, asset, isHome]);

  async function save() {
    if (property) {
      const data: Record<string, unknown> = {};
      for (const c of costs) data[c.key] = num(form[c.key]);
      await api.properties.update(property.id, data);
    }
    const assetData: Record<string, unknown> = {};
    for (const a of assetFields) assetData[a.key] = num(form[a.key]);
    assetData.ownershipReason = form.ownershipReason?.trim() || null;
    await api.assets.update(asset.id, assetData);
    setEditing(false);
    onChange();
  }

  const shown = [
    ...(residential ? costs.map((c) => ({ label: c.label, value: property?.[c.key] as number | null | undefined, pct: c.key === "managementPercent" })) : []),
    ...assetFields.map((a) => ({ label: a.label, value: asset[a.key] as number | null | undefined, pct: false })),
  ].filter((x) => x.value !== null && x.value !== undefined);

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Running costs and tax figures <HelpLink topic="property-profit" />
        </h3>
        {!editing && (
          <button className="btn secondary" onClick={() => setEditing(true)}>
            Change
          </button>
        )}
      </div>
      {!editing && (
        <>
          {residential && isHome && <p className="cap-explain">Your home — left out of the profit report and exempt from land tax.</p>}
          {residential && use === "HOLIDAY" && <p className="cap-explain">Not rented — left out of the profit report, so there's nothing to claim.</p>}
          {residential && partRented && (
            <p className="cap-explain">Part rented — the profit report claims the rented share of these costs (set under How it's used).</p>
          )}
          {asset.ownershipReason && (
            <p style={{ margin: "8px 0" }}>
              <strong>Why it's owned this way:</strong> {asset.ownershipReason}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="cap-explain">
              Nothing recorded yet. These feed Reports → Property Profit.{" "}
              {residential ? "Insurance comes from the policies recorded against the property." : "Running costs come from the outgoings below."}
            </p>
          ) : (
            <table className="kv-table">
              <tbody>
                {shown.map((x) => (
                  <tr key={x.label}>
                    <td>{x.label}</td>
                    <td>{x.pct ? `${x.value}%` : formatCurrency(x.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {editing && (
        <div className="sub-form">
          {residential && (
            <>
              <div className="grid grid-2">
                {costs.map((c) => (
                  <div key={c.key}>
                    <label>{c.label}</label>
                    <input type="number" value={form[c.key] ?? ""} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="grid grid-2">
            {assetFields.map((a) => (
              <div key={a.key}>
                <label>{a.label}</label>
                <input type="number" value={form[a.key] ?? ""} onChange={(e) => setForm({ ...form, [a.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <label>Why it's owned this way (who owns it, and why)</label>
          <textarea
            rows={2}
            placeholder="e.g. In Alex's name for negative gearing against the higher salary"
            value={form.ownershipReason ?? ""}
            onChange={(e) => setForm({ ...form, ownershipReason: e.target.value })}
          />
          {(landTax || rented) && (
            <p className="cap-explain">
              {landTax && "Land value is on the Valuer General's notice or your land tax assessment — land only, not the building. "}
              {rented && "Depreciation and the building write-off are on the quantity surveyor's depreciation schedule."}
            </p>
          )}
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
