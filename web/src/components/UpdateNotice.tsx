import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AppInfo } from "../api/client.js";
import { ReleaseNotes } from "./ProgramUpdates.js";

/** Once, after the launcher installed an update (or couldn't): what happened and what's new. */
export function UpdateNotice() {
  const [last, setLast] = useState<AppInfo["lastUpdate"]>(null);
  useEffect(() => {
    api.app
      .info()
      .then((i) => setLast(i.lastUpdate && !i.lastUpdate.seen ? i.lastUpdate : null))
      .catch(() => setLast(null));
  }, []);
  if (!last) return null;

  async function dismiss() {
    setLast(null);
    await api.app.updateSeen().catch(() => {});
  }

  return (
    <div className={`card update-notice ${last.kind === "FAILED" ? "failed" : ""}`}>
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {last.kind === "UPDATED" && <h3 style={{ margin: 0 }}>Updated to version {last.to} — here's what's new</h3>}
          {last.kind === "ROLLED_BACK" && <h3 style={{ margin: 0 }}>Version {last.to} is back</h3>}
          {last.kind === "FAILED" && <h3 style={{ margin: 0 }}>Version {last.to} couldn't be installed</h3>}
        </div>
        <button className="btn secondary" onClick={dismiss}>
          Got it
        </button>
      </div>
      {last.kind === "UPDATED" && last.notes && <ReleaseNotes notes={last.notes} />}
      {last.kind === "ROLLED_BACK" && <p>Your records are as they were. You can install the newer version again later from Settings.</p>}
      {last.kind === "FAILED" && (
        <p>
          Version {last.from} was put back, with your records exactly as they were before. Nothing was lost. The reason:{" "}
          <em>{last.error}</em>. The full details are in the Logs folder inside your data folder — see{" "}
          <Link to="/settings#updates">Settings → Program and updates</Link>.
        </p>
      )}
    </div>
  );
}
