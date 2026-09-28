import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset } from "../api/client.js";
import { CONSIDER_STAGES, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * At the top of a property you're considering: where it's up to, and the
 * two ways out — passing on it (kept, greyed, with your reason) or buying it
 * (it becomes yours and starts counting).
 */
export function ConsideringBar({ asset, onChange }: { asset: Asset; onChange: () => void }) {
  const [mode, setMode] = useState<"" | "pass" | "bought">("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(asset.askingPrice ? String(asset.askingPrice) : "");
  const [error, setError] = useState<string | null>(null);
  const stage = asset.pipelineStage ?? "LOOKING";
  const passed = asset.status === "PASSED_ON";

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setMode("");
      setError(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (passed) {
    return (
      <div className="card considering-bar passed">
        <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>
              Passed on{asset.passedOnAt ? ` ${formatDate(asset.passedOnAt)}` : ""} <HelpLink topic="considering" />
            </h3>
            <p style={{ margin: "4px 0 0" }}>{asset.passedOnReason || "No reason noted."}</p>
            <p className="cap-explain" style={{ margin: "4px 0 0" }}>
              Kept for reference, with everything you found out. It never counts in your totals.{" "}
              <Link to="/considering">All properties I'm considering</Link>
            </p>
          </div>
          <button className="btn secondary" onClick={() => run(() => api.considering.reconsider(asset.id))}>
            Bring it back
          </button>
        </div>
        {error && <div className="message-box error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="card considering-bar">
      <h3 style={{ marginTop: 0 }}>
        Considering buying <HelpLink topic="considering" />
      </h3>
      <div className="segmented stage-steps" role="group" aria-label="Where it's up to">
        {CONSIDER_STAGES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={stage === s.value ? "selected" : ""}
            aria-pressed={stage === s.value}
            onClick={() => run(() => api.considering.setStage(asset.id, s.value))}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="cap-explain">
        {CONSIDER_STAGES.find((s) => s.value === stage)?.explain} Not yours yet, so it isn't in any total.{" "}
        <Link to="/considering">All properties I'm considering</Link>
      </p>
      {mode === "" && (
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setMode("bought")}>
            We bought it
          </button>
          <button className="btn secondary" onClick={() => setMode("pass")}>
            Pass on this one
          </button>
        </div>
      )}
      {mode === "pass" && (
        <div className="sub-form">
          <label>Why not? (in your own words)</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Strata report showed a big special levy coming"
          />
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => run(() => api.considering.passOn(asset.id, reason))}>
              Pass on it
            </button>
            <button className="btn secondary" onClick={() => setMode("")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {mode === "bought" && (
        <div className="sub-form">
          <label>Price paid ($)</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          <p className="cap-explain">From today it's yours: it counts in your totals and moves to Properties.</p>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => run(() => api.considering.bought(asset.id, price ? Number(price) : null))}>
              It's ours
            </button>
            <button className="btn secondary" onClick={() => setMode("")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div className="message-box error">{error}</div>}
    </div>
  );
}
