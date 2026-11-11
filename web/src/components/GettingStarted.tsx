import { useState } from "react";
import { Link } from "react-router-dom";
import { api, DashboardSummary, GettingStartedStep } from "../api/client.js";
import { FEATURES, FeatureId, setFeaturesOff, useFeatures } from "../features.js";
import { HelpLink } from "./HelpLink.js";

// "What do you have?" — the parts of the app that only matter if you have
// them. Unticked ones are switched off (hidden, nothing deleted).
const HAVE: FeatureId[] = ["vehicles", "investments", "super", "smsf", "commercial", "insurance"];

/**
 * Getting started, at the top of the dashboard: one small step at a time, in
 * the order the records are built up. Steps tick themselves off from what's
 * recorded, any can be skipped, and the list can be put away (Help brings it
 * back).
 */
export function GettingStarted({ summary, onChange }: { summary: DashboardSummary; onChange: () => void }) {
  const { steps, dismissed, complete } = summary.gettingStarted;
  const features = useFeatures();
  const [open, setOpen] = useState<string | null>(null);
  const [have, setHave] = useState<Set<string> | null>(null);

  if (dismissed || complete) return null;

  const current = steps.find((s) => !s.done && !s.skipped);
  const shown = open ?? current?.key ?? null;
  const done = steps.filter((s) => s.done || s.skipped).length;
  const skippedKeys = steps.filter((s) => s.skipped).map((s) => s.key);

  async function setSkipped(keys: string[]) {
    await api.settings.update({ setupSkipped: keys });
    setOpen(null);
    onChange();
  }

  async function saveHave() {
    const ticked = have ?? new Set(HAVE.filter((f) => features.on(f)));
    const off = [...features.off.filter((f) => !HAVE.includes(f as FeatureId)), ...HAVE.filter((f) => !ticked.has(f))];
    await api.settings.update({ featuresOff: off, setupHaveDone: true });
    setFeaturesOff(off);
    setOpen(null);
    onChange();
  }

  function stepBody(s: GettingStartedStep) {
    if (s.key === "have") {
      const ticked = have ?? new Set(HAVE.filter((f) => features.on(f)));
      return (
        <div className="setup-body">
          <p className="cap-explain">{s.explain}</p>
          {HAVE.map((f) => {
            const info = FEATURES.find((x) => x.id === f)!;
            return (
              <label key={f} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={ticked.has(f)}
                  onChange={(e) => {
                    const next = new Set(ticked);
                    if (e.target.checked) next.add(f);
                    else next.delete(f);
                    setHave(next);
                  }}
                />
                {info.name}
              </label>
            );
          })}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={saveHave}>
              Save
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="setup-body">
        <p className="cap-explain">{s.explain}</p>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          {s.buttons.map((b, i) => (
            <Link
              key={b.route}
              className={`btn${i === 0 ? "" : " secondary"}`}
              to={b.route}
              // Looking at the reports is the step itself.
              onClick={() => s.key === "reports" && void api.settings.update({ setupSkipped: [...skippedKeys, "reports"] })}
            >
              {b.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card getting-started">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>
          Getting started — {done} of {steps.length} <HelpLink topic="worth-doing" />
        </h3>
        <button className="link-button" onClick={() => api.settings.update({ checklistDismissed: true }).then(onChange)}>
          Hide
        </button>
      </div>
      <ul className="checklist setup-steps">
        {steps.map((s) => {
          const isOpen = shown === s.key && !s.done;
          return (
            <li key={s.key} className={`${s.done ? "done" : ""}${s.skipped ? " skipped" : ""}${isOpen ? " open" : ""}`}>
              <div className="setup-row">
                <span className="check" aria-hidden="true">
                  {s.done ? "✓" : ""}
                </span>
                {s.done ? (
                  <span>{s.label}</span>
                ) : (
                  <button className="link-button setup-label" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : s.key)}>
                    {s.label}
                  </button>
                )}
                {s.skipped && (
                  <>
                    <span className="cap-explain" style={{ margin: 0 }}>
                      skipped
                    </span>
                    <button className="link-button" onClick={() => setSkipped(skippedKeys.filter((k) => k !== s.key))}>
                      Undo
                    </button>
                  </>
                )}
                {isOpen && !s.skipped && (
                  <button className="link-button" style={{ marginLeft: "auto" }} onClick={() => setSkipped([...skippedKeys, s.key])}>
                    Skip
                  </button>
                )}
              </div>
              {isOpen && stepBody(s)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** For Help: bring the getting-started list back after it's been put away. */
export function ShowGettingStartedAgain() {
  const [done, setDone] = useState(false);
  return done ? (
    <p className="cap-explain">It's back at the top of the Dashboard.</p>
  ) : (
    <button
      className="btn secondary"
      onClick={() => api.settings.update({ checklistDismissed: false, setupSkipped: [] }).then(() => setDone(true))}
    >
      Show Getting started again
    </button>
  );
}
