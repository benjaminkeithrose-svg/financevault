import { useEffect, useState } from "react";
import { api, UsableEquity } from "../api/client.js";
import { formatCurrency } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * Usable equity: what a lender might let you borrow against the property
 * (its value × the lender's maximum loan-to-value ratio), less what's already
 * owed on loans secured by it. An estimate from the value recorded here; the
 * lender's valuation decides.
 */
export function UsableEquityCard({ assetId }: { assetId: string }) {
  const [data, setData] = useState<UsableEquity | null>(null);
  const [editing, setEditing] = useState(false);
  const [maxLvr, setMaxLvr] = useState("");

  const load = () => api.debtAllocation.usableEquity(assetId).then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  async function save() {
    await api.assets.update(assetId, { lenderMaxLvr: maxLvr === "" ? null : Number(maxLvr) / 100 });
    setEditing(false);
    load();
  }

  if (!data?.equity) return null;
  const e = data.equity;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Usable equity <HelpLink topic="loan-purposes" />
      </h3>
      <p style={{ fontSize: 22, margin: "4px 0" }}>
        <strong>{formatCurrency(e.usable)}</strong>
      </p>
      <p className="cap-explain">
        {formatCurrency(e.value)} × {Math.round(e.maxLvr * 100)}%{e.maxLvrAssumed ? " (usual maximum — change it if your lender differs)" : " lender maximum"} ={" "}
        {formatCurrency(e.limit)}, less {formatCurrency(e.owing)} owed on loans secured by it. An estimate from the value recorded here —
        the lender's valuation decides. Drawing it is new borrowing: interest is deductible only if the money is used to produce income.
      </p>
      {editing ? (
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <input
            type="number"
            style={{ maxWidth: 120 }}
            placeholder="80"
            value={maxLvr}
            onChange={(ev) => setMaxLvr(ev.target.value)}
            aria-label="Lender's maximum loan-to-value ratio, percent"
          />
          <button className="btn" onClick={save}>
            Save
          </button>
          <button className="btn secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="link-button"
          onClick={() => {
            setMaxLvr(e.maxLvrAssumed ? "" : String(Math.round(e.maxLvr * 100)));
            setEditing(true);
          }}
        >
          Change the lender's maximum
        </button>
      )}
    </div>
  );
}
