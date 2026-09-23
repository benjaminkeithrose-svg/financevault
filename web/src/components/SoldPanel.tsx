import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, AssetSale } from "../api/client.js";
import { formatCurrency, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * Selling something keeps it on record — in the tree under Sold, with its
 * documents and history — instead of deleting it. It drops out of every
 * total from the sale date, and the capital gain is worked out for each
 * owner and shown in Reports → Capital gains for that year.
 */
const toIso = (d: string) => (d ? new Date(d).toISOString() : null);
const num = (v: string) => (v === "" ? null : Number(v));
const str = (v?: number | null) => (v === null || v === undefined ? "" : String(v));

export function SoldPanel({ asset, onChange }: { asset: Asset; onChange: () => void }) {
  const sold = !!asset.disposalDate;
  const isProperty = asset.assetType === "PROPERTY";
  const [editing, setEditing] = useState(false);
  const [sale, setSale] = useState<AssetSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => initial(asset));

  useEffect(() => {
    setForm(initial(asset));
    if (asset.disposalDate) api.assets.sale(asset.id).then(setSale).catch(() => setSale(null));
    else setSale(null);
  }, [asset]);

  async function save() {
    setError(null);
    if (!form.disposalDate || form.disposalValue === "") {
      setError("Enter the sale date and the sale price.");
      return;
    }
    try {
      await api.assets.update(asset.id, {
        disposalDate: toIso(form.disposalDate),
        disposalValue: num(form.disposalValue),
        sellingCosts: num(form.sellingCosts),
        buyingCosts: num(form.buyingCosts),
        improvementsCost: num(form.improvementsCost),
        mainResidence: isProperty ? form.mainResidence : null,
        mainResidencePercent: isProperty && form.mainResidence === "PARTIAL" ? num(form.mainResidencePercent) : null,
      });
      setEditing(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function undo() {
    if (!window.confirm(`Mark ${asset.name} as not sold? It goes back into your totals.`)) return;
    await api.assets.update(asset.id, { disposalDate: null, disposalValue: null, sellingCosts: null });
    onChange();
  }

  const totalGain = sale?.rows.reduce((s, r) => s + r.grossGain, 0) ?? 0;

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          {sold ? `Sold ${formatDate(asset.disposalDate)} for ${formatCurrency(asset.disposalValue)}` : "Sold it?"} <HelpLink topic="selling" />
        </h3>
        {!editing && (
          <button className="btn secondary" onClick={() => setEditing(true)}>
            {sold ? "Change sale details" : "Mark as sold"}
          </button>
        )}
      </div>

      {!sold && !editing && (
        <p className="cap-explain">
          Marking it as sold keeps it on record with its documents and history, and takes it out of your totals. Deleting is only
          for things entered by mistake.
        </p>
      )}

      {editing && (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Sale date (settlement)</label>
              <input type="date" value={form.disposalDate} onChange={(e) => setForm({ ...form, disposalDate: e.target.value })} />
            </div>
            <div>
              <label>Sale price</label>
              <input type="number" value={form.disposalValue} onChange={(e) => setForm({ ...form, disposalValue: e.target.value })} />
            </div>
            <div>
              <label>Selling costs (agent, advertising, legal)</label>
              <input type="number" value={form.sellingCosts} onChange={(e) => setForm({ ...form, sellingCosts: e.target.value })} />
            </div>
            <div>
              <label>Buying costs (stamp duty, legal)</label>
              <input type="number" value={form.buyingCosts} onChange={(e) => setForm({ ...form, buyingCosts: e.target.value })} />
            </div>
            <div>
              <label>Capital improvements over the years</label>
              <input type="number" value={form.improvementsCost} onChange={(e) => setForm({ ...form, improvementsCost: e.target.value })} />
            </div>
            {isProperty && (
              <div>
                <label>Was it your home?</label>
                <select value={form.mainResidence} onChange={(e) => setForm({ ...form, mainResidence: e.target.value })}>
                  <option value="NONE">No</option>
                  <option value="FULL">Yes — the whole time we owned it</option>
                  <option value="PARTIAL">For part of the time</option>
                </select>
              </div>
            )}
            {isProperty && form.mainResidence === "PARTIAL" && (
              <div>
                <label>Share of the time it was your home (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.mainResidencePercent}
                  onChange={(e) => setForm({ ...form, mainResidencePercent: e.target.value })}
                />
              </div>
            )}
          </div>
          <p className="cap-explain">
            Cost base = purchase price {formatCurrency(asset.acquisitionCost)} + buying costs + improvements + selling costs.
          </p>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={save}>
              Save sale
            </button>
            <button className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sold && sale && (
        <>
          {sale.openLoans.length > 0 && (
            <div className="message-box warning" style={{ marginTop: 12 }}>
              Still recorded against it:{" "}
              {sale.openLoans.map((l, i) => (
                <span key={l.id}>
                  {i > 0 ? ", " : ""}
                  <Link to={`/liabilities/${l.id}`}>{l.name}</Link> ({formatCurrency(l.currentBalance)})
                </span>
              ))}
              . If the sale paid it out, set its balance to $0 or delete it.
            </div>
          )}
          {sale.cgtApplies ? (
            <>
              <h3>Capital gain</h3>
              <table className="kv-table">
                <tbody>
                  {sale.rows.map((r) => (
                    <tr key={r.entityId}>
                      <td>
                        {r.entityName}
                        {sale.rows.length > 1 ? ` (${Math.round(r.share * 1000) / 10}%)` : ""}
                        {r.notes.map((n) => (
                          <div key={n} className="cap-explain">
                            {n}
                          </div>
                        ))}
                      </td>
                      <td>
                        {formatCurrency(r.grossGain)}
                        <div className="cap-explain">
                          {r.exemptPortion === 1
                            ? "Main residence — exempt"
                            : [
                                r.exemptPortion > 0 ? `${Math.round(r.exemptPortion * 100)}% main residence exemption` : null,
                                r.grossGain > 0 ? (r.discountEligible ? "12-month discount applies" : "Held under 12 months — no discount") : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="cap-explain">
                {totalGain >= 0 ? "Gain" : "Loss"} before any discount: {formatCurrency(totalGain)}. The discount and any losses are
                worked out in Reports → Capital gains for the year of the sale. Confirm with your accountant.
              </p>
            </>
          ) : (
            <p className="cap-explain">No capital gains tax is worked out for this kind of asset (cars, for example, are exempt).</p>
          )}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="link-button" onClick={undo}>
              It wasn't sold — undo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function initial(a: Asset) {
  return {
    disposalDate: a.disposalDate ? a.disposalDate.slice(0, 10) : "",
    disposalValue: str(a.disposalValue),
    sellingCosts: str(a.sellingCosts),
    buyingCosts: str(a.buyingCosts),
    improvementsCost: str(a.improvementsCost),
    mainResidence: (a.mainResidence ?? "NONE") as string,
    mainResidencePercent: str(a.mainResidencePercent),
  };
}
