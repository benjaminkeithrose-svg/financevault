import { useEffect, useState } from "react";
import { api, Settings as SettingsType } from "../api/client.js";

export function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [storageDirInput, setStorageDirInput] = useState("");
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  function load() {
    api.settings.get().then((s) => {
      setSettings(s);
      setStorageDirInput(s.customStorageDir || "");
    });
  }

  useEffect(load, []);

  async function toggleAi() {
    if (!settings) return;
    const updated = await api.settings.update({ allowExternalAiProcessing: !settings.allowExternalAiProcessing });
    setSettings(updated);
  }

  async function setLandingPage(defaultLandingPage: string) {
    const updated = await api.settings.update({ defaultLandingPage });
    setSettings(updated);
  }

  async function saveStorageDir() {
    setStorageError(null);
    setStorageSaving(true);
    try {
      const updated = await api.settings.update({ customStorageDir: storageDirInput.trim() || null });
      setSettings(updated);
    } catch (e) {
      setStorageError((e as Error).message);
    } finally {
      setStorageSaving(false);
    }
  }

  async function resetStorageDir() {
    setStorageError(null);
    setStorageSaving(true);
    try {
      const updated = await api.settings.update({ customStorageDir: null });
      setSettings(updated);
      setStorageDirInput("");
    } finally {
      setStorageSaving(false);
    }
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
        <h3 style={{ marginTop: 0 }}>Landing page</h3>
        <p style={{ color: "var(--text-muted)" }}>
          Choose what opens first when you launch Financial Vault.
        </p>
        {settings && (
          <select value={settings.defaultLandingPage} onChange={(e) => setLandingPage(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="DASHBOARD">Dashboard</option>
            <option value="VISUALIZATION">Visualization</option>
          </select>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Document storage location</h3>
        <p style={{ color: "var(--text-muted)" }}>
          Point this at a folder inside your Google Drive, OneDrive or Dropbox sync folder and new uploads get
          backed up automatically as you go, on top of the one-off ZIP below. Only documents uploaded from now on
          move — anything already stored stays exactly where it is. This doesn't move the database itself; that's
          set via <code>server/.env</code> and needs a restart, since it can't change while the app is running.
          If you sync between two computers, avoid opening this app on both at once — the database itself isn't
          safe to sync live.
        </p>
        {settings && (
          <>
            <label>Folder path</label>
            <input
              value={storageDirInput}
              onChange={(e) => setStorageDirInput(e.target.value)}
              placeholder={settings.effectiveStorageDir}
            />
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Currently: <code>{settings.effectiveStorageDir}</code>
              {!settings.customStorageDir && " (default location)"}
            </p>
            {storageError && <div className="message-box warning">{storageError}</div>}
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn secondary" onClick={saveStorageDir} disabled={storageSaving || !storageDirInput.trim()}>
                {storageSaving ? "Saving…" : "Save"}
              </button>
              {settings.customStorageDir && (
                <button className="btn secondary" onClick={resetStorageDir} disabled={storageSaving}>
                  Reset to default
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Backup</h3>
        <p style={{ color: "var(--text-muted)" }}>
          Downloads one ZIP with a full copy of your database and every uploaded document — everything needed to
          restore Financial Vault elsewhere. It goes straight to your browser's downloads; nothing is uploaded
          anywhere.
        </p>
        <a className="btn" href="/api/backup" download>
          Download full backup
        </a>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Data & privacy</h3>
        <ul style={{ color: "var(--text-muted)" }}>
          <li>Original documents are stored immutably and identified by a SHA-256 hash.</li>
          <li>Every classification change and confirmation is written to the audit log.</li>
          <li>Encryption at rest and stronger authentication arrive in a later stage.</li>
        </ul>
      </div>
    </div>
  );
}
