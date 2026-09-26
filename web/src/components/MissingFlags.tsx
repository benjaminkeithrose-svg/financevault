import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ExpectationGroup } from "../api/client.js";
import { RECORDS_CHANGED, useFeatures } from "../features.js";
import { addLink } from "../pages/Missing.js";

/**
 * The "What's missing" items for one property, vehicle, person or trust, on
 * its own page. Shows nothing when nothing's missing (or the feature is off).
 */
export function MissingFlags({ target }: { target: string }) {
  const features = useFeatures();
  const on = features.on("expected");
  const [group, setGroup] = useState<ExpectationGroup | null>(null);

  useEffect(() => {
    if (!on) return;
    const load = () =>
      api.expected
        .get({ target })
        .then((r) => setGroup(r.groups[0] ?? null))
        .catch(() => setGroup(null));
    load();
    // Ticks off as soon as a policy is added or a document linked on this page.
    window.addEventListener(RECORDS_CHANGED, load);
    return () => window.removeEventListener(RECORDS_CHANGED, load);
  }, [target, on]);

  if (!on || !group) return null;
  const open = group.items.filter((i) => !i.met && !i.dismissed);
  if (open.length === 0) return null;
  return (
    <div className="card missing-flags">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>What's missing</h3>
        <Link to="/missing">See the full list</Link>
      </div>
      <ul className="missing-list">
        {open.map((i) => (
          <li key={i.key} className={i.level === "RED" ? "required" : "worth"}>
            <span className="missing-mark" aria-hidden="true">
              {i.level === "RED" ? "!" : "?"}
            </span>
            <div className="missing-body">
              <strong>{i.label}</strong>
              {i.fyLabel && <span className="cap-explain" style={{ display: "inline" }}> · {i.fyLabel}</span>}
              <span className={`missing-level ${i.level === "RED" ? "required" : "worth"}`}>{i.level === "RED" ? "Required" : "Worth checking"}</span>
              <div className="cap-explain">{i.why}</div>
            </div>
            {i.kind === "INSURANCE" && (
              <div className="missing-actions">
                <Link className="btn secondary" to={addLink(group, i)}>
                  Add policy
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
