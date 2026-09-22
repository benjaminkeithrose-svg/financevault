import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Entity, FinancialYear, ImportBatchReview, ImportBatchSummary, ImportGroup } from "../api/client.js";
import { formatDate } from "../utils.js";

/** OCR is CPU-heavy, so a few at a time keeps things moving without thrashing. */
const UPLOAD_CONCURRENCY = 3;

interface Progress {
  total: number;
  done: number;
  imported: number;
  duplicates: number;
  failed: number;
  current: string | null;
}

type GroupDecision = { documentType: string; entityId: string; financialYearLabel: string };

export function BulkImport() {
  const { id: routeBatchId } = useParams();
  const navigate = useNavigate();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [recentBatches, setRecentBatches] = useState<ImportBatchSummary[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [review, setReview] = useState<ImportBatchReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, GroupDecision>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, number>>({});

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.entities.list().then(setEntities).catch(() => {});
    api.financialYears.list().then(setFinancialYears).catch(() => {});
    api.importBatches.list().then(setRecentBatches).catch(() => {});
  }, []);

  // A batch is persisted, so an import opened by URL — or reopened after the
  // page was closed mid-review — picks up exactly where it was.
  useEffect(() => {
    if (!routeBatchId) return;
    setProgress(null);
    api.importBatches
      .groups(routeBatchId)
      .then(setReview)
      .catch((e) => setError((e as Error).message));
  }, [routeBatchId]);

  // `webkitdirectory` isn't in React's JSX typings, so it's set directly on
  // the element — it's what makes the picker select a whole folder.
  useEffect(() => {
    if (folderInputRef.current) folderInputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  async function runImport(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setReview(null);
    setApplied({});
    setDecisions({});

    const counts: Progress = { total: files.length, done: 0, imported: 0, duplicates: 0, failed: 0, current: null };
    setProgress({ ...counts });

    try {
      const batch = await api.importBatches.create(`Import of ${files.length} files`);

      let cursor = 0;
      async function worker() {
        while (cursor < files.length) {
          const index = cursor++;
          const file = files[index];
          const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined;
          counts.current = file.name;
          try {
            const result = await api.importBatches.uploadFile(batch.id, file, relativePath);
            if (result.status === "IMPORTED") counts.imported += 1;
            else if (result.status === "DUPLICATE") counts.duplicates += 1;
            else counts.failed += 1;
          } catch {
            // A file the server never accepted at all still shouldn't stop
            // the run — record it and keep going.
            counts.failed += 1;
          }
          counts.done += 1;
          setProgress({ ...counts });
        }
      }

      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));

      setProgress({ ...counts, current: null });
      setReview(await api.importBatches.groups(batch.id));
      api.importBatches.list().then(setRecentBatches).catch(() => {});
      // Put the batch in the URL so a reload during review doesn't lose it.
      navigate(`/bulk-import/${batch.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function decisionFor(group: ImportGroup): GroupDecision {
    return (
      decisions[group.key] ?? {
        documentType: group.documentType ?? "",
        entityId: "",
        financialYearLabel: group.financialYearLabels.length === 1 ? group.financialYearLabels[0] : "",
      }
    );
  }

  function setDecision(group: ImportGroup, patch: Partial<GroupDecision>) {
    setDecisions((prev) => ({ ...prev, [group.key]: { ...decisionFor(group), ...patch } }));
  }

  async function applyGroup(group: ImportGroup, confirm: boolean) {
    if (!review) return;
    const decision = decisionFor(group);
    setApplying(group.key);
    setError(null);
    try {
      const payload: Record<string, unknown> = { documentIds: group.documentIds, confirm };
      if (decision.documentType.trim()) payload.documentType = decision.documentType.trim();
      if (decision.entityId) payload.entityId = decision.entityId;
      if (decision.financialYearLabel) payload.financialYearLabel = decision.financialYearLabel;

      const result = await api.importBatches.apply(review.batch.id, payload);
      setApplied((prev) => ({ ...prev, [group.key]: result.updated }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  }

  const busy = progress !== null && progress.done < progress.total;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Bulk import</h2>
          <p>
            For loading a whole folder at once. Files that look alike are grouped afterwards so you can classify a
            run of statements in one go rather than one at a time.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Choose what to import</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Picking a folder keeps its structure as a hint — a file in <code>Tax Returns/2023-24</code> is read as
          exactly that, which is usually better than anything guessed from the page itself. Nothing leaves your
          computer.
        </p>
        <input
          ref={folderInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => runImport(Array.from(e.target.files || []))}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => runImport(Array.from(e.target.files || []))}
        />
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => folderInputRef.current?.click()}>
            Choose a folder
          </button>
          <button className="btn secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            Choose files
          </button>
        </div>
      </div>

      {error && <div className="message-box warning">{error}</div>}

      {!progress && !review && recentBatches.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Earlier imports</h3>
          <table>
            <tbody>
              {recentBatches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/bulk-import/${b.id}`}>{b.name}</Link>
                  </td>
                  <td>{b._count.files} files</td>
                  <td>{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {progress && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            {busy ? "Importing…" : "Import finished"} ({progress.done} of {progress.total})
          </h3>
          <div
            style={{
              height: 8,
              background: "var(--border)",
              borderRadius: 4,
              overflow: "hidden",
              margin: "8px 0 12px",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                background: "var(--accent)",
                transition: "width 0.2s",
              }}
            />
          </div>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            {progress.imported} imported · {progress.duplicates} already had · {progress.failed} couldn't be read
            {busy && progress.current ? ` · reading ${progress.current}` : ""}
          </p>
        </div>
      )}

      {review && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Review by group ({review.groups.length})</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Least certain groups first. Set what's right for a group and apply it to every file in it at once.
              Anything you leave blank is left exactly as the classifier proposed it, per document.
            </p>

            {review.groups.length === 0 ? (
              <p className="empty-state">Nothing imported to review.</p>
            ) : (
              review.groups.map((group) => {
                const decision = decisionFor(group);
                const appliedCount = applied[group.key];
                return (
                  <div
                    key={group.key}
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: 16,
                      marginTop: 16,
                    }}
                  >
                    <h4 style={{ margin: "0 0 4px" }}>
                      {group.count} × {group.documentType || "Unclassified"}
                      {group.folder ? ` — ${group.folder}` : ""}
                    </h4>
                    <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>
                      {group.sampleFilenames.join(", ")}
                      {group.count > group.sampleFilenames.length ? ` and ${group.count - group.sampleFilenames.length} more` : ""}
                      {group.averageConfidence !== null && ` · avg confidence ${Math.round(group.averageConfidence * 100)}%`}
                      {group.financialYearLabels.length > 1 && ` · spans FY ${group.financialYearLabels.join(", ")}`}
                    </p>

                    <div className="grid grid-3">
                      <div>
                        <label>Document type</label>
                        <input
                          value={decision.documentType}
                          onChange={(e) => setDecision(group, { documentType: e.target.value })}
                          placeholder="Leave blank to keep each file's own"
                        />
                      </div>
                      <div>
                        <label>Entity</label>
                        <select
                          value={decision.entityId}
                          onChange={(e) => setDecision(group, { entityId: e.target.value })}
                        >
                          <option value="">Leave as proposed</option>
                          {entities.map((en) => (
                            <option key={en.id} value={en.id}>
                              {en.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Financial year</label>
                        <select
                          value={decision.financialYearLabel}
                          onChange={(e) => setDecision(group, { financialYearLabel: e.target.value })}
                        >
                          <option value="">Leave as proposed</option>
                          {financialYears.map((fy) => (
                            <option key={fy.id} value={fy.label}>
                              {fy.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="toolbar" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        disabled={applying === group.key}
                        onClick={() => applyGroup(group, true)}
                      >
                        {applying === group.key ? "Applying…" : `Apply to all ${group.count} and confirm`}
                      </button>
                      <button
                        className="btn secondary"
                        disabled={applying === group.key}
                        onClick={() => applyGroup(group, false)}
                      >
                        Apply without confirming
                      </button>
                      {appliedCount !== undefined && (
                        <span style={{ color: "var(--success)", alignSelf: "center" }}>
                          Applied to {appliedCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {review.failed.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Couldn't be read ({review.failed.length})</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                These were skipped. Everything else still imported.
              </p>
              <table>
                <tbody>
                  {review.failed.map((f) => (
                    <tr key={f.id}>
                      <td>{f.originalFilename}</td>
                      <td style={{ color: "var(--text-muted)" }}>{f.errorMessage || "Unknown error"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {review.duplicates.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Already had these ({review.duplicates.length})</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Identical to documents already stored, so they weren't added again.
              </p>
              <p style={{ margin: 0 }}>{review.duplicates.map((d) => d.originalFilename).join(", ")}</p>
            </div>
          )}

          <div className="card">
            <p style={{ margin: 0 }}>
              Anything you didn't confirm is waiting in the <Link to="/inbox">Inbox</Link>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
