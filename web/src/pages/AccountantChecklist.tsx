import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ChecklistItem } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";

/**
 * "Worth asking your accountant" — legitimate deductions, offsets and
 * concessions your records suggest might apply but aren't being used, and
 * areas the ATO watches. Each says why, the rule, the source and how settled
 * it is. Printable to take to the appointment.
 */

const RISK: Record<ChecklistItem["risk"], { label: string; explain: string }> = {
  SETTLED: { label: "Settled", explain: "Clearly allowed — claim it with records." },
  ARGUABLE: { label: "Arguable", explain: "A reasonable position — take the reasoning to your accountant; a private ruling can make it certain." },
  ATO_TARGETED: { label: "ATO watches this", explain: "An area the ATO has warned about — here so you know where the line is." },
};
const ORDER: ChecklistItem["risk"][] = ["SETTLED", "ARGUABLE", "ATO_TARGETED"];

export function AccountantChecklist() {
  const [data, setData] = useState<{ items: ChecklistItem[]; referenceDocs: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.advice.checklist().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (!data) return <div className="empty-state">{error ?? "Loading…"}</div>;
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Worth asking your accountant <HelpLink topic="accountant-checklist" />
          </h2>
          <p>What your records suggest you may be entitled to but aren't using, and what the ATO watches. Prompts, not advice.</p>
        </div>
        <button className="btn secondary no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="card">
          <p className="empty-state">Nothing to raise from what's recorded. The more you record — income, loans, costs, super — the more this finds.</p>
        </div>
      ) : (
        ORDER.map((risk) => {
          const items = data.items.filter((i) => i.risk === risk);
          if (!items.length) return null;
          return (
            <div key={risk} className="card">
              <h3 style={{ marginTop: 0 }}>
                {RISK[risk].label} ({items.length})
              </h3>
              <p className="cap-explain">{RISK[risk].explain}</p>
              {items.map((i) => {
                const refDoc = i.source.referenceCode ? data.referenceDocs[i.source.referenceCode] : undefined;
                return (
                  <div key={i.id} className={`member-block${risk === "ATO_TARGETED" ? " checklist-watch" : ""}`}>
                    <strong>{i.title}</strong>
                    <p style={{ margin: "4px 0" }}>{i.why}</p>
                    <p className="cap-explain">
                      <strong>The rule:</strong> {i.rule}
                    </p>
                    <p className="cap-explain">
                      <strong>Source:</strong> {refDoc ? <Link to={`/documents/${refDoc}`}>{i.source.label}</Link> : i.source.label}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      <strong>Ask:</strong> {i.action}
                    </p>
                    <div className="toolbar no-print" style={{ flexWrap: "wrap" }}>
                      {i.link && (
                        <Link className="btn secondary" to={i.link}>
                          Go to it
                        </Link>
                      )}
                      {i.facts && (
                        <a className="btn secondary" href={api.advice.factsUrl(i.id)} download>
                          Facts for a private ruling
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
      <p className="cap-explain">
        Nothing here looks for schemes. An arrangement whose main purpose is a tax benefit can be cancelled under Part IVA, with
        penalties. The best protection is the paper trail: each claim with its record and the rule behind it.
      </p>
    </div>
  );
}
