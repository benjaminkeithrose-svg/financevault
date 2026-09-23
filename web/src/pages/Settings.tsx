import { useEffect, useState } from "react";
import { api, Settings as SettingsType } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { ThemePicker } from "../components/ThemePicker.js";

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

  const [pcCurrent, setPcCurrent] = useState("");
  const [pcNew, setPcNew] = useState("");
  const [pcConfirm, setPcConfirm] = useState("");
  const [pcMessage, setPcMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePasscode() {
    if (pcNew !== pcConfirm) {
      setPcMessage({ ok: false, text: "The new passcodes don't match." });
      return;
    }
    try {
      await api.vault.changePasscode(pcCurrent, pcNew);
      setPcCurrent("");
      setPcNew("");
      setPcConfirm("");
      setPcMessage({ ok: true, text: "Passcode changed. Your recovery key still works as before." });
    } catch (e) {
      setPcMessage({ ok: false, text: (e as Error).message });
    }
  }

  async function togglePriceLookups() {
    if (!settings) return;
    const updated = await api.settings.update({ allowPriceLookups: !settings.allowPriceLookups });
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
        <h3 style={{ marginTop: 0 }}>
          Look and feel <HelpLink topic="look-and-feel" />
        </h3>
        <p style={{ color: "var(--text-muted)" }}>
          Pick a colour and a style. It's remembered on this computer only, so each person can choose their own.
        </p>
        <ThemePicker />
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
        <h3 style={{ marginTop: 0 }}>Passcode <HelpLink topic="passcode" /></h3>
        <p style={{ color: "var(--text-muted)" }}>
          Changing your passcode doesn't re-encrypt anything and doesn't change your recovery key — it just changes
          what opens the vault.
        </p>
        <div className="grid grid-3">
          <div>
            <label>Current passcode</label>
            <input type="password" autoComplete="current-password" value={pcCurrent} onChange={(e) => setPcCurrent(e.target.value)} />
          </div>
          <div>
            <label>New passcode</label>
            <input type="password" autoComplete="new-password" value={pcNew} onChange={(e) => setPcNew(e.target.value)} />
          </div>
          <div>
            <label>New passcode again</label>
            <input type="password" autoComplete="new-password" value={pcConfirm} onChange={(e) => setPcConfirm(e.target.value)} />
          </div>
        </div>
        {pcMessage && <div className={`message-box ${pcMessage.ok ? "success" : "warning"}`}>{pcMessage.text}</div>}
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={changePasscode} disabled={!pcCurrent || !pcNew}>
            Change passcode
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Market price lookups <HelpLink topic="investments" /></h3>
        <p style={{ color: "var(--text-muted)" }}>
          Lets the app look up prices for the shares, ETFs and crypto you hold, so its valuations and your net worth
          stay current. This is the only part of the investment module that reaches the internet. A lookup discloses
          only <strong>which codes you hold</strong> to the price provider — never quantities, values, account details
          or anything identifying you. Prices only ever refresh when you ask; nothing runs in the background.
          Everything still works with prices you enter by hand, which is the normal path for managed funds and super
          where no free feed exists.
        </p>
        {settings && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={settings.allowPriceLookups}
              onChange={togglePriceLookups}
            />
            Allow market price lookups
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
        <h3 style={{ marginTop: 0 }}>Backup <HelpLink topic="backup" /></h3>
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
          <li>The app only answers this computer — not other devices on your network, and not other websites.</li>
          <li>
            Tax file numbers and your email app password are encrypted with a key that only exists while the app is
            unlocked.
          </li>
          <li>
            Everything else — balances, transactions, documents and their text — is stored unencrypted on this
            computer. The passcode stops people using the app; it doesn't stop someone with access to your files
            reading them directly.
          </li>
        </ul>
      </div>
    </div>
  );
}
