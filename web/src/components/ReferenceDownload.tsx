import { useEffect, useState } from "react";
import { api, ReferenceDownloadStatus } from "../api/client.js";
import { formatDate } from "../utils.js";

/**
 * "Download everything for Claude": every official source in the reference
 * list and every ATO occupation guide, saved into a dated folder with a ZIP
 * to upload into the conversation. Runs on this computer, which the ATO lets
 * in; only public pages are fetched.
 */
export function ReferenceDownload() {
  const [s, setS] = useState<ReferenceDownloadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.referenceLibrary.downloadStatus().then(setS).catch(() => setS(null));
  }, []);

  // While it runs, ask how it's going every couple of seconds.
  const running = !!s?.running && !s.running.error;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => api.referenceLibrary.downloadStatus().then(setS).catch(() => undefined), 2000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    if (
      !window.confirm(
        "This goes online to fetch the public pages of the ATO, Revenue NSW, APRA and ASIC, including every ATO occupation guide. Nothing about you is sent. It can take 10 minutes or more. Go ahead?"
      )
    )
      return;
    setError(null);
    try {
      setS(await api.referenceLibrary.startDownload());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const last = s?.last;
  return (
    <details className="profit-details" open={open || running} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Download every official document into a folder (for Claude)</summary>
      <p className="cap-explain">
        Saves every source in the reference list, and every ATO occupation guide, into a dated folder in your Financial Vault
        Data folder — with a ZIP of it to upload to Claude. Nothing is added to your records.
      </p>
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={start} disabled={running}>
          {running ? "Downloading…" : last ? "Download again" : "Download everything"}
        </button>
        {last && !running && (
          <a className="btn" href={api.referenceLibrary.downloadZipUrl} download>
            Save the ZIP for Claude
          </a>
        )}
      </div>
      {running && (
        <p className="cap-explain" aria-live="polite">
          {s!.running!.done} pages so far — now: {s!.running!.current}
        </p>
      )}
      {s?.running?.error && <div className="message-box warning">It stopped: {s.running.error}</div>}
      {error && <div className="message-box warning">{error}</div>}
      {last && !running && (
        <>
          <p className="cap-explain">
            Last downloaded {formatDate(last.savedAt)}: {last.files} files — {last.sources} sources and {last.occupationPages} occupation guide
            page{last.occupationPages === 1 ? "" : "s"}{last.occupationSections ? ` (${last.occupationSections} as whole-section PDFs)` : ""}. In <code className="path">{last.folder}</code>
          </p>
          {last.failed.length > 0 && (
            <>
              <p className="cap-explain">
                {last.failed.length} couldn't be downloaded. Try again later — a site can be busy — or open each on this computer and save
                it as a PDF (Print, then Save as PDF) to upload with the ZIP.
              </p>
              <ul className="reference-failed">
                {last.failed.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.title}
                    </a>{" "}
                    <span className="cap-explain" style={{ display: "inline" }}>
                      — {f.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </details>
  );
}
