import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, UsableEquity } from "../api/client.js";
import { formatCurrency } from "../utils.js";

/**
 * What's recorded for a property picked as the source of an equity draw in a
 * plan: its value, the loans secured on it, and roughly how much a lender
 * might let you draw. Says plainly what's missing — never blocks the draw.
 */
export function EquitySourceCheck({ assetId, page }: { assetId: string; page: string }) {
  const [data, setData] = useState<UsableEquity | null | undefined>(undefined);
  useEffect(() => {
    setData(undefined);
    api.debtAllocation.usableEquity(assetId).then(setData).catch(() => setData(null));
  }, [assetId]);

  if (data === undefined) return null;
  const e = data?.equity;
  if (!e) {
    return (
      <div className="message-box warning">
        This property has no current value recorded yet, so the app can't estimate how much equity it has. You can still add
        the draw. To see the estimate, <Link to={page}>open the property</Link> and enter what it's worth now.
      </div>
    );
  }
  return (
    <div className="message-box info">
      Worth {formatCurrency(e.value)}, with {formatCurrency(e.owing)} owed on loans secured by it. At a lender's{" "}
      {Math.round(e.maxLvr * 100)}% maximum, about <strong>{formatCurrency(e.usable)}</strong> could be drawn.
      {data.loans.length === 0 && (
        <>
          {" "}
          No loans are recorded against it. If it has one, add the loan and pick this property under "Security", or the
          estimate will be too high.
        </>
      )}
    </div>
  );
}
