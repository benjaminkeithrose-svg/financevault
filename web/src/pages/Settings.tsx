import { useEffect, useState } from "react";
import { api, Settings as SettingsType } from "../api/client.js";

export function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);

  useEffect(() => {
    api.settings.get().then(setSettings);
  }, []);

  async function toggleAi() {
    if (!settings) return;
    const updated = await api.settings.update({ allowExternalAiProcessing: !settings.allowExternalAiProcessing });
    setSettings(updated);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Security and privacy controls for Financial Vault.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>AI processing</h3>
        <p style={{ color: "var(--text-muted)" }}>
          Document classification currently runs entirely on-device using local heuristics — nothing is sent to a
          third party. When external AI processing is enabled in a future release, document text may be sent to an
          external provider to improve classification accuracy.
        </p>
        {settings && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={settings.allowExternalAiProcessing}
              onChange={toggleAi}
            />
            Allow external AI processing
          </label>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Data & privacy</h3>
        <ul style={{ color: "var(--text-muted)" }}>
          <li>Original documents are stored immutably and identified by a SHA-256 hash.</li>
          <li>Every classification change and confirmation is written to the audit log.</li>
          <li>Export, backup and encryption-at-rest controls arrive in a later stage.</li>
        </ul>
      </div>
    </div>
  );
}
