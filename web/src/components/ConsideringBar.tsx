import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, PurchaseStepView } from "../api/client.js";
import { CONSIDER_STAGES, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * At the top of a property you're considering: where it's up to, and the
 * two ways out — passing on it (kept, greyed, with your reason) or buying it
 * (it becomes yours and starts counting).
 */
export function ConsideringBar({ asset, onChange }: { asset: Asset; onChange: () => void }) {
  const [mode, setMode] = useState<"" | "pass">("");
  const [reason, setReason] = useState("");
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
      <StageSteps asset={asset} stage={stage} onChange={onChange} />
      {mode === "" && (
        <div className="toolbar" style={{ flexWrap: "wrap", marginTop: 8 }}>
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
      {error && <div className="message-box error">{error}</div>}
    </div>
  );
}

const NEXT_STAGE: Record<string, string> = { LOOKING: "INVESTIGATING", INVESTIGATING: "OFFER", OFFER: "CONTRACT", CONTRACT: "SETTLEMENT" };

/**
 * The steps of the stage it's at (offer, contract, settlement), each keeping
 * the date it was ticked. The next one is shown first. Ticking "Settled"
 * makes it yours.
 */
function StageSteps({ asset, stage, onChange }: { asset: Asset; stage: string; onChange: () => void }) {
  const [steps, setSteps] = useState<PurchaseStepView[]>([]);
  const [values, setValues] = useState<Record<string, { amount: string; date: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api.considering
      .steps(asset.id)
      .then((r) => {
        setSteps(r.steps);
        setValues(Object.fromEntries(r.steps.map((s) => [s.key, { amount: s.amount != null ? String(s.amount) : "", date: s.date ? s.date.slice(0, 10) : "" }])));
      })
      .catch(() => setSteps([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, stage]);

  const mine = steps.filter((s) => s.stage === stage);
  const next = mine.find((s) => !s.doneAt);
  const nextStage = NEXT_STAGE[stage];
  const nextLabel = CONSIDER_STAGES.find((s) => s.value === nextStage)?.label;

  async function save(s: PurchaseStepView, patch: { done?: boolean }) {
    const v = values[s.key] ?? { amount: "", date: "" };
    // Show the tick straight away.
    if (patch.done !== undefined) setSteps((all) => all.map((x) => (x.key === s.key ? { ...x, doneAt: patch.done ? new Date().toISOString() : null } : x)));
    try {
      await api.considering.saveStep(asset.id, s.key, {
        ...patch,
        ...(s.amountLabel ? { amount: v.amount ? Number(v.amount) : null } : {}),
        ...(s.dateLabel ? { date: v.date ? new Date(v.date).toISOString() : null } : {}),
      });
      setError(null);
      // Settled (or a step further along) changes the page itself.
      if (patch.done !== undefined && (s.key === "settled" || s.stage !== stage)) onChange();
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (stage === "LOOKING" || stage === "INVESTIGATING") {
    return (
      <div className="next-step">
        <strong>Next:</strong>{" "}
        {stage === "LOOKING"
          ? "add the rent and running costs, and work out the numbers in the assessment below."
          : "go through the checks below, then make an offer."}{" "}
        <button className="link-button" onClick={() => api.considering.setStage(asset.id, nextStage).then(onChange)}>
          Move on to {nextLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="stage-steps-list">
      {next ? (
        <div className="next-step">
          <strong>Next:</strong> {next.label.toLowerCase()}.
        </div>
      ) : (
        nextStage && (
          <div className="next-step">
            <strong>All done here.</strong>{" "}
            <button className="link-button" onClick={() => api.considering.setStage(asset.id, nextStage).then(onChange)}>
              Move on to {nextLabel}
            </button>
          </div>
        )
      )}
      <ul className="check-list">
        {mine.map((s) => (
          <li key={s.key} className={s.doneAt ? "dealt" : ""}>
            <div className="check-row">
              <label className="checkbox-row" style={{ margin: 0, flex: "1 1 200px" }}>
                <input type="checkbox" checked={!!s.doneAt} onChange={(e) => save(s, { done: e.target.checked })} /> {s.label}
                {s.doneAt && <span className="cap-explain" style={{ margin: "0 0 0 6px" }}>done {formatDate(s.doneAt)}</span>}
              </label>
              {s.amountLabel && (
                <input
                  type="number"
                  aria-label={s.amountLabel}
                  placeholder={s.amountLabel}
                  style={{ width: 170, margin: 0 }}
                  value={values[s.key]?.amount ?? ""}
                  onChange={(e) => setValues({ ...values, [s.key]: { ...values[s.key], amount: e.target.value } })}
                  onBlur={() => s.doneAt && save(s, {})}
                />
              )}
              {s.dateLabel && (
                <input
                  type="date"
                  aria-label={s.dateLabel}
                  style={{ width: 170, margin: 0 }}
                  value={values[s.key]?.date ?? ""}
                  onChange={(e) => setValues({ ...values, [s.key]: { ...values[s.key], date: e.target.value } })}
                  onBlur={() => s.doneAt && save(s, {})}
                />
              )}
            </div>
            {s.hint && !s.doneAt && <p className="cap-explain" style={{ margin: "0 0 6px 28px" }}>{s.hint}</p>}
          </li>
        ))}
      </ul>
      {error && <div className="message-box error">{error}</div>}
    </div>
  );
}
