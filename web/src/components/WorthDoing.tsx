import { useState } from "react";
import { Link } from "react-router-dom";
import { api, DashboardSummary } from "../api/client.js";
import { formatCurrency, formatDate } from "../utils.js";

const DAY = 86_400_000;

/**
 * The dashboard's short list of things worth doing: a backup that's due,
 * values nobody has looked at in a year, and — while a new setup is being
 * filled in — the getting-started steps. Shows nothing when there's nothing.
 */
export function WorthDoing({ summary, onChange }: { summary: DashboardSummary; onChange: () => void }) {
  const [showAllValues, setShowAllValues] = useState(false);
  const { backup, staleValues, gettingStarted } = summary;
  const backupDays = backup.lastBackupAt ? Math.floor((Date.now() - new Date(backup.lastBackupAt).getTime()) / DAY) : null;
  const backupDue = backupDays === null || backupDays >= backup.remindAfterDays;
  const showChecklist = !gettingStarted.dismissed && !gettingStarted.complete;
  // The checklist already covers a first backup.
  const showBackup = backupDue && !(showChecklist && backupDays === null);
  const values = showAllValues ? staleValues : staleValues.slice(0, 3);

  if (!showChecklist && !showBackup && staleValues.length === 0) return null;

  async function stillRight(id: string) {
    await api.assets.valueChecked(id);
    onChange();
  }

  async function dismissChecklist() {
    await api.settings.update({ checklistDismissed: true });
    onChange();
  }

  const done = gettingStarted.steps.filter((s) => s.done).length;

  return (
    <div className="card worth-doing">
      <h3 style={{ marginTop: 0 }}>Worth doing</h3>

      {showChecklist && (
        <div className="worth-block">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <strong>
              Getting started — {done} of {gettingStarted.steps.length} done
            </strong>
            <button className="link-button" onClick={dismissChecklist}>
              Hide this list
            </button>
          </div>
          <ul className="checklist">
            {gettingStarted.steps.map((s) => (
              <li key={s.key} className={s.done ? "done" : ""}>
                <span className="check" aria-hidden="true">
                  {s.done ? "✓" : ""}
                </span>
                {s.done ? <span>{s.label}</span> : <Link to={s.route}>{s.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showBackup && (
        <div className="worth-block worth-row">
          <span>
            {backupDays === null ? "No full backup taken yet." : `Last full backup: ${backupDays} days ago.`}{" "}
            <span className="cap-explain" style={{ display: "inline" }}>
              Keep a copy somewhere other than this computer.
            </span>
          </span>
          <a className="btn secondary" href="/api/backup" download onClick={() => window.setTimeout(onChange, 4000)}>
            Download a backup
          </a>
        </div>
      )}

      {staleValues.length > 0 && (
        <div className="worth-block">
          <strong>Values not updated in over a year</strong>
          <ul className="plain-list">
            {values.map((v) => (
              <li key={v.id}>
                <span>
                  <Link to={v.route}>{v.name}</Link> — {formatCurrency(v.value)}{" "}
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>since {formatDate(v.since)}</span>
                </span>
                <button className="btn secondary" onClick={() => stillRight(v.id)} title="The value is still about right">
                  Still right
                </button>
              </li>
            ))}
          </ul>
          {staleValues.length > 3 && (
            <button className="link-button" onClick={() => setShowAllValues((x) => !x)}>
              {showAllValues ? "Show fewer" : `Show all ${staleValues.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
