import { useEffect, useState } from "react";
import { api, CheckUpdate, DueDiligence, DueDiligenceCheckView } from "../api/client.js";
import { confirmThenDelete, formatCurrency, formatDate } from "../utils.js";
import { DocumentLinker } from "./DocumentLinker.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";

export const CHECK_STATUS: Record<DueDiligenceCheckView["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  NA: "Not applicable",
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** The details of one check (or issue, or development idea): what was found, cost, who, when, evidence. */
function CheckDetail({
  assetId,
  c,
  whoOptions,
  onSaved,
  development,
}: {
  assetId: string;
  c: DueDiligenceCheckView;
  whoOptions: string[];
  onSaved: (d: DueDiligence) => void;
  development?: boolean;
}) {
  const [form, setForm] = useState({
    findings: c.findings ?? "",
    cost: c.cost !== null ? String(c.cost) : "",
    who: c.who ?? "",
    dueDate: c.dueDate ? c.dueDate.slice(0, 10) : "",
    checked: c.checked,
    problem: c.problem,
  });
  const [checkId, setCheckId] = useState<string | null>(c.id);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Documents are linked to the check's own record — made the first time it's opened.
    if (!checkId) api.considering.ensureCheck(assetId, c.key).then((r) => setCheckId(r.id)).catch(() => {});
  }, [assetId, c.key, checkId]);

  async function save() {
    try {
      const data: CheckUpdate = {
        findings: form.findings.trim() || null,
        cost: num(form.cost),
        who: form.who || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        checked: form.checked,
        ...(development ? {} : { problem: form.problem }),
      };
      onSaved(await api.considering.saveCheck(assetId, c.key, data));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="sub-form check-detail">
      {c.why && <p className="cap-explain">{c.why}</p>}
      <label>{development ? "Notes" : "What was found"}</label>
      <textarea rows={2} value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} />
      <div className="grid grid-3">
        {!development && (
          <div>
            <label>Estimated cost ($)</label>
            <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
        )}
        <div>
          <label>Who's handling it</label>
          <select value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })}>
            <option value="">—</option>
            {[...new Set([...(form.who && !whoOptions.includes(form.who) ? [form.who] : []), ...whoOptions])].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Due by</label>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </div>
      </div>
      {development ? (
        <label className="checkbox-row">
          <input type="checkbox" checked={form.checked} onChange={(e) => setForm({ ...form, checked: e.target.checked })} /> The document linked below is
          the approval
        </label>
      ) : (
        <>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.checked} onChange={(e) => setForm({ ...form, checked: e.target.checked })} /> Checked (not just what
            the agent said)
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.checked })} /> Problem found
          </label>
        </>
      )}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>
      {error && <div className="message-box error">{error}</div>}
      {checkId && (
        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: 13 }}>{development ? "Documents (the approval, plans…)" : "Evidence"}</strong>
          <DocumentLinker targetType="DD_CHECK" targetId={checkId} />
        </div>
      )}
    </div>
  );
}

function useWhoOptions() {
  const [who, setWho] = useState<string[]>(["Me"]);
  useEffect(() => {
    Promise.all([api.people.list().catch(() => []), api.advisers.list().catch(() => [])]).then(([people, advisers]) =>
      setWho([
        "Me",
        ...people.map((p) => p.name),
        ...advisers.map((a) => [a.firm, [a.contactFirstName, a.contactSurname].filter(Boolean).join(" ")].filter(Boolean).join(" — ")).filter(Boolean),
      ])
    );
  }, []);
  return who;
}

/**
 * Open issues and due diligence on a property you're considering. The
 * checks are picked by the kind of property and its title; nothing is
 * compulsory. Problems found gather in Open issues, with their costs counted
 * in the assessment's cash needed.
 */
export function DueDiligenceCards({ assetId, onChange }: { assetId: string; onChange?: () => void }) {
  const [dd, setDd] = useState<DueDiligence | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState<"" | "ISSUE" | "CHECK" | "DEVELOPMENT">("");
  const [newItem, setNewItem] = useState({ label: "", cost: "", group: "" });
  const [resolving, setResolving] = useState<{ key: string; text: string } | null>(null);
  const whoOptions = useWhoOptions();

  const apply = (d: DueDiligence) => {
    setDd(d);
    onChange?.();
  };
  useEffect(() => {
    api.considering.checks(assetId).then(setDd).catch(() => setDd(null));
  }, [assetId]);
  if (!dd) return null;

  async function add() {
    if (!adding || !newItem.label.trim()) return;
    apply(
      await api.considering.addCheck(assetId, {
        kind: adding,
        label: newItem.label.trim(),
        group: adding === "CHECK" ? newItem.group || dd!.groups[0]?.name : null,
        cost: adding === "ISSUE" ? num(newItem.cost) : null,
      })
    );
    setAdding("");
    setNewItem({ label: "", cost: "", group: "" });
  }

  const addForm = (kind: "ISSUE" | "CHECK" | "DEVELOPMENT") =>
    adding === kind && (
      <div className="sub-form">
        <label>{kind === "ISSUE" ? "The issue" : kind === "CHECK" ? "The check" : "The idea (e.g. granny flat, subdivide)"}</label>
        <input value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} />
        {kind === "ISSUE" && (
          <>
            <label>Estimated cost ($)</label>
            <input type="number" value={newItem.cost} onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })} />
          </>
        )}
        {kind === "CHECK" && (
          <>
            <label>In which group</label>
            <select value={newItem.group} onChange={(e) => setNewItem({ ...newItem, group: e.target.value })}>
              {dd.groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn" onClick={add}>
            Add
          </button>
          <button className="btn secondary" onClick={() => setAdding("")}>
            Cancel
          </button>
        </div>
      </div>
    );

  const removeButton = (c: DueDiligenceCheckView) =>
    (c.own || c.kind !== "CHECK") && (
      <button
        className="icon-btn danger"
        aria-label={`Remove ${c.label}`}
        onClick={async () => {
          let next: DueDiligence | null = null;
          if (await confirmThenDelete(`Remove "${c.label}"?`, async () => (next = await api.considering.removeCheck(assetId, c.key)))) apply(next!);
        }}
      >
        <IconBin />
      </button>
    );

  const issueLine = (c: DueDiligenceCheckView, resolved: boolean) => (
    <li key={c.key} className={`issue${resolved ? " resolved" : ""}`}>
      <div className="issue-main">
        <strong>{c.label}</strong>
        {c.cost ? ` — ${formatCurrency(c.cost)}` : ""}
        {c.findings && <div className="cap-explain">{c.findings}</div>}
        {resolved && <div className="cap-explain">Resolved{c.resolvedAt ? ` ${formatDate(c.resolvedAt)}` : ""}{c.resolution ? `: ${c.resolution}` : ""}</div>}
      </div>
      {!resolved &&
        (resolving?.key === c.key ? (
          <div className="sub-form" style={{ width: "100%" }}>
            <label>How was it resolved?</label>
            <textarea rows={2} value={resolving.text} onChange={(e) => setResolving({ ...resolving, text: e.target.value })} />
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                className="btn"
                onClick={async () => {
                  apply(await api.considering.saveCheck(assetId, c.key, { resolved: true, resolution: resolving.text.trim() || null }));
                  setResolving(null);
                }}
              >
                Save
              </button>
              <button className="btn secondary" onClick={() => setResolving(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn secondary" onClick={() => setResolving({ key: c.key, text: "" })}>
            Resolved
          </button>
        ))}
      {resolved && (
        <button className="link-button" onClick={async () => apply(await api.considering.saveCheck(assetId, c.key, { resolved: false }))}>
          Reopen
        </button>
      )}
      {c.kind === "ISSUE" && removeButton(c)}
    </li>
  );

  const needsKind = dd.kind === "RESIDENTIAL" && (!dd.propertyKind || !dd.titleType);

  return (
    <>
      <div className="card open-issues">
        <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>
            Open issues{dd.openIssues.length ? ` (${dd.openIssues.length})` : ""}
            {dd.openIssueCosts ? ` — ${formatCurrency(dd.openIssueCosts)}` : ""}
          </h3>
          {adding !== "ISSUE" && (
            <button className="btn secondary" onClick={() => setAdding("ISSUE")}>
              Add an issue
            </button>
          )}
        </div>
        {addForm("ISSUE")}
        {dd.openIssues.length === 0 ? (
          <p className="cap-explain">No problems found yet. Tick "Problem found" on a check, or add an issue here.</p>
        ) : (
          <>
            <ul className="issue-list">{dd.openIssues.map((c) => issueLine(c, false))}</ul>
            {dd.openIssueCosts > 0 && <p className="cap-explain">Their costs are counted in the assessment's cash needed.</p>}
          </>
        )}
        {dd.resolvedIssues.length > 0 && (
          <>
            <h4>Resolved</h4>
            <ul className="issue-list">{dd.resolvedIssues.map((c) => issueLine(c, true))}</ul>
          </>
        )}
      </div>

      <div className="card due-diligence">
        <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>
            Due diligence — {dd.totals.done} of {dd.totals.total} done <HelpLink topic="considering" />
          </h3>
          {adding !== "CHECK" && (
            <button className="btn secondary" onClick={() => setAdding("CHECK")}>
              Add a check
            </button>
          )}
        </div>
        <p className="cap-explain">
          Nothing here is compulsory — mark what doesn't fit as Not applicable.
          {needsKind && " Set the kind of property and its title under Overview to get the right checks (strata, community title)."}
        </p>
        {addForm("CHECK")}
        {dd.groups.map((g) => {
          const isOpen = open[g.name] ?? false;
          return (
            <div key={g.name} className="check-group">
              <button className="check-group-head" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [g.name]: !isOpen })}>
                <span>{g.name}</span>
                <span className="cap-explain" style={{ margin: 0 }}>
                  {g.done} of {g.total} done
                </span>
              </button>
              {isOpen && (
                <ul className="check-list">
                  {g.checks.map((c) => (
                    <li key={c.key} className={c.status === "DONE" || c.status === "NA" ? "dealt" : ""}>
                      <div className="check-row">
                        <button className="link-button check-label" aria-expanded={expanded === c.key} onClick={() => setExpanded(expanded === c.key ? null : c.key)}>
                          {c.label}
                        </button>
                        <span className="check-badges">
                          {c.problem && !c.resolvedAt && <span className="badge status-PENDING">Problem</span>}
                          {c.checked && <span className="badge status-CONFIRMED">Checked</span>}
                          {c.evidence > 0 && <span className="cap-explain" style={{ margin: 0 }}>{c.evidence} doc{c.evidence === 1 ? "" : "s"}</span>}
                          {c.dueDate && c.status !== "DONE" && c.status !== "NA" && (
                            <span className="cap-explain" style={{ margin: 0 }}>
                              by {formatDate(c.dueDate)}
                            </span>
                          )}
                        </span>
                        <select
                          aria-label={`Status of ${c.label}`}
                          value={c.status}
                          onChange={async (e) => apply(await api.considering.saveCheck(assetId, c.key, { status: e.target.value as DueDiligenceCheckView["status"] }))}
                        >
                          {Object.entries(CHECK_STATUS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        {removeButton(c)}
                      </div>
                      {expanded === c.key && (
                        <CheckDetail assetId={assetId} c={c} whoOptions={whoOptions} onSaved={(d) => apply(d)} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {dd.kind === "RESIDENTIAL" && (
          <>
            <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 16 }}>
              <h4 style={{ margin: 0 }}>Development ideas</h4>
              {adding !== "DEVELOPMENT" && (
                <button className="btn secondary" onClick={() => setAdding("DEVELOPMENT")}>
                  Add an idea
                </button>
              )}
            </div>
            <p className="cap-explain">A granny flat, a subdivision… kept as notes. Never treated as approved until the approval is linked.</p>
            {addForm("DEVELOPMENT")}
            <ul className="check-list">
              {dd.development.map((c) => (
                <li key={c.key}>
                  <div className="check-row">
                    <button className="link-button check-label" aria-expanded={expanded === c.key} onClick={() => setExpanded(expanded === c.key ? null : c.key)}>
                      {c.label}
                    </button>
                    <span className={`badge ${c.approved ? "status-CONFIRMED" : "status-ARCHIVED"}`}>{c.approved ? "Approved — see document" : "Not approved"}</span>
                    {removeButton(c)}
                  </div>
                  {expanded === c.key && <CheckDetail assetId={assetId} c={c} whoOptions={whoOptions} onSaved={(d) => apply(d)} development />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
