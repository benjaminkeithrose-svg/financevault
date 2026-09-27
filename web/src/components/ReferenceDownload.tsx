import { useEffect, useRef, useState } from "react";
import { api, ReferenceDownloadStatus } from "../api/client.js";
import { useFeatures } from "../features.js";
import { formatDate } from "../utils.js";

/**
 * "Download and check for updates": every official source in the reference
 * list and every ATO occupation guide, filed in the library (a changed one
 * saved as a new copy, the old one kept as replaced), and written into
 * folders in the data folder. With "Save the ZIP for Claude" switched on,
 * a ZIP of the folders to upload. Runs on this computer, which the ATO lets
 * in; only public pages are fetched.
 */
export function ReferenceDownload({ primary, onDone }: { primary: boolean; onDone: () => void }) {
  const features = useFeatures();
  const [s, setS] = useState<ReferenceDownloadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    api.referenceLibrary.downloadStatus().then(setS).catch(() => setS(null));
  }, []);

  // While it runs, ask how it's going every couple of seconds; reload the list when it's finished.
  const running = !!s?.running && !s.running.error;
  useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      onDone();
    }
    if (!running) return;
    const t = setInterval(() => api.referenceLibrary.downloadStatus().then(setS).catch(() => undefined), 2000);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="reference-download">
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <button className={primary ? "btn" : "btn secondary"} onClick={start} disabled={running}>
          {running ? "Downloading…" : "Download and check for updates"}
        </button>
        {last && !running && features.on("reference-zip") && (
          <a className="btn secondary" href={api.referenceLibrary.downloadZipUrl} download>
            Save the ZIP for Claude
          </a>
        )}
      </div>
      {running && (
        <p className="cap-explain" aria-live="polite">
          {s!.running!.done} done so far — now: {s!.running!.current}
        </p>
      )}
      {s?.running?.error && <div className="message-box warning">It stopped: {s.running.error}</div>}
      {error && <div className="message-box warning">{error}</div>}
      {last && !running && (
        <p className="cap-explain">
          Last downloaded {formatDate(last.savedAt)}: {last.documents} documents in the library
          {last.occupationGuides ? `, including ${last.occupationGuides} occupation guides` : ""} —{" "}
          {last.changed === 0 ? "nothing had changed" : `${last.changed} new or changed`}. Copies in folders at{" "}
          <code className="path">{last.folder}</code>
        </p>
      )}
      {last && !running && last.failed.length > 0 && (
        <details className="profit-details">
          <summary>
            {last.failed.length} couldn't be downloaded — try again later, or save them by hand
          </summary>
          <p className="cap-explain">A site can be busy. Or open each on this computer and save it as a PDF (Print, then Save as PDF).</p>
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
        </details>
      )}
    </div>
  );
}
