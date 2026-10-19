import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ChecklistItem, OccupationChecklist as Checklist, OccupationGuideSummary, Person } from "../api/client.js";
import { formatCurrency } from "../utils.js";

/**
 * The ATO occupation guide for this person's job, as a year-round checklist
 * (IDEAS.md idea 10): the expenses the guide says can be claimed, the ones it
 * says usually can't, and — for what they claim — what's recorded this year
 * and what's still to do before 30 June.
 */
export function OccupationChecklist({
  person,
  fy,
  reloadKey,
  onAddClaim,
  onGuideChanged,
}: {
  person: Person;
  fy: string;
  reloadKey: number;
  onAddClaim: (item: ChecklistItem) => void;
  onGuideChanged: () => void;
}) {
  const [data, setData] = useState<Checklist | null>(null);
  const [guides, setGuides] = useState<OccupationGuideSummary[] | null>(null);
  const [changing, setChanging] = useState(false);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.payg
      .checklist(person.id, fy)
      .then((c) => {
        setData(c);
        setPick(c.chosen ?? c.suggested ?? "");
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, fy, reloadKey]);
  useEffect(() => {
    if ((changing || (data && !data.guide)) && !guides) api.payg.guides().then(setGuides);
  }, [changing, data, guides]);

  async function useGuide(key: string | null) {
    await api.people.update(person.id, { occupationGuide: key });
    setChanging(false);
    onGuideChanged();
  }

  async function choose(item: ChecklistItem, choice: "CLAIM" | "NOT_FOR_ME" | null) {
    await api.payg.choose(person.id, item.key, choice);
    load();
  }

  if (error) return <div className="message-box warning">{error}</div>;
  if (!data) return null;

  const picker = (
    <div className="sub-form">
      <label htmlFor={`guide-${person.id}`}>The ATO guide for {person.occupation || "this job"}</label>
      <select id={`guide-${person.id}`} value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">— None —</option>
        {(guides ?? []).map((g) => (
          <option key={g.key} value={g.key}>
            {g.title}
            {g.key === data.suggested ? " (suggested)" : ""}
          </option>
        ))}
      </select>
      <p className="cap-explain">
        The ATO has a guide for about 40 jobs. If none fits, "Office workers" covers most desk jobs; the general rules below
        apply to everyone.
      </p>
      <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={!pick && !data.chosen} onClick={() => useGuide(pick || null)}>
          {pick ? "Use this guide" : "Stop using a guide"}
        </button>
        {data.guide && (
          <button className="btn secondary" onClick={() => setChanging(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  if (!data.guide) {
    return (
      <section className="occupation-checklist">
        <h3>Checklist for this job</h3>
        <p className="cap-explain">
          {data.suggestedTitle
            ? `The ATO's guide for ${data.suggestedTitle.toLowerCase()} looks like the one for ${person.occupation}. Choose it to see what can and can't be claimed, as a checklist for each year.`
            : "Choose the ATO's guide for this job to see what can and can't be claimed, as a checklist for each year."}
        </p>
        {picker}
      </section>
    );
  }

  const g = data.guide;
  const items = data.items ?? [];
  const mine = items.filter((i) => i.choice === "CLAIM" || i.claims.length > 0);
  const maybe = items.filter((i) => i.choice === null && i.claims.length === 0 && i.verdict !== "CANT");
  const cant = items.filter((i) => i.choice === null && i.claims.length === 0 && i.verdict === "CANT");
  const notMine = items.filter((i) => i.choice === "NOT_FOR_ME" && i.claims.length === 0);
  const toRecord = mine.filter((i) => i.claims.length === 0);

  return (
    <section className="occupation-checklist">
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checklist: {g.title}</h3>
        {!changing && (
          <button className="link-button" onClick={() => setChanging(true)}>
            Change guide
          </button>
        )}
      </div>
      <p className="cap-explain">
        From the ATO's guide{g.updated ? `, last updated ${g.updated}` : ""}
        {g.source === "LIBRARY" ? " (your downloaded copy)" : ""}.{" "}
        {g.documentId ? (
          <Link to={`/documents/${g.documentId}`}>Read the whole guide</Link>
        ) : g.url ? (
          <a href={g.url} target="_blank" rel="noreferrer">
            Read the whole guide on the ATO website
          </a>
        ) : null}
      </p>
      {changing && picker}

      {items.length === 0 ? (
        <div className="message-box info">
          This guide's list of expenses wasn't downloaded when this version was made. On the{" "}
          <Link to="/documents">Documents</Link> page, under Official reference library, choose{" "}
          <strong>Download and check for updates</strong> — the checklist fills in from your copy.
        </div>
      ) : (
        <>
          {mine.length > 0 ? (
            <p style={{ margin: "8px 0" }}>
              {mine.length - toRecord.length} of {mine.length} things you claim have something recorded for {fy}.
            </p>
          ) : (
            <p className="cap-explain">Mark what you claim most years; each year this shows what's still to record before 30 June.</p>
          )}
          {toRecord.length > 0 && (
            <div className="message-box warning" style={{ marginBottom: 8 }}>
              Still to record for {fy}: {toRecord.map((i) => i.name).join(", ")}.
            </div>
          )}

          {mine.length > 0 && (
            <>
              <h4 className="checklist-heading">You claim these</h4>
              <ul className="plain-list">
                {mine.map((i) => (
                  <ItemRow key={i.key} item={i} fy={fy} onAddClaim={onAddClaim} onChoose={choose} />
                ))}
              </ul>
            </>
          )}

          {maybe.length > 0 && (
            <>
              <h4 className="checklist-heading">Might apply to you</h4>
              <ul className="plain-list">
                {maybe.map((i) => (
                  <ItemRow key={i.key} item={i} fy={fy} onAddClaim={onAddClaim} onChoose={choose} />
                ))}
              </ul>
            </>
          )}

          {cant.length > 0 && (
            <details className="profit-details">
              <summary>Usually can't be claimed ({cant.length})</summary>
              <ul className="plain-list">
                {cant.map((i) => (
                  <ItemRow key={i.key} item={i} fy={fy} onAddClaim={onAddClaim} onChoose={choose} />
                ))}
              </ul>
            </details>
          )}

          {notMine.length > 0 && (
            <details className="profit-details">
              <summary>Not for you ({notMine.length})</summary>
              <ul className="plain-list">
                {notMine.map((i) => (
                  <ItemRow key={i.key} item={i} fy={fy} onAddClaim={onAddClaim} onChoose={choose} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

const VERDICT: Record<ChecklistItem["verdict"], string> = { CAN: "Can claim", DEPENDS: "It depends", CANT: "Usually can't" };

function ItemRow({
  item,
  fy,
  onAddClaim,
  onChoose,
}: {
  item: ChecklistItem;
  fy: string;
  onAddClaim: (item: ChecklistItem) => void;
  onChoose: (item: ChecklistItem, choice: "CLAIM" | "NOT_FOR_ME" | null) => void;
}) {
  const claimed = item.choice === "CLAIM" || item.claims.length > 0;
  const status = claimed
    ? item.claims.length
      ? `${formatCurrency(item.total)} recorded${item.claims.some((c) => !c.hasRecord) ? " · no receipt attached" : ""}`
      : `Nothing recorded for ${fy} yet`
    : item.choice === "NOT_FOR_ME"
      ? "Not for you"
      : VERDICT[item.verdict];
  return (
    <li className="checklist-item">
      <details>
        <summary>
          <span className="checklist-name">{item.name}</span>
          <span className={`cap-explain checklist-status${claimed && item.claims.length === 0 ? " to-record" : ""}`}>{status}</span>
        </summary>
        <AtoWords text={item.text} />
        <div className="toolbar" style={{ flexWrap: "wrap", marginTop: 8 }}>
          {item.verdict !== "CANT" || claimed ? (
            <button className="btn secondary" onClick={() => onAddClaim(item)}>
              Add a claim
            </button>
          ) : null}
          {item.choice !== "CLAIM" && item.verdict !== "CANT" && (
            <button className="btn secondary" onClick={() => onChoose(item, "CLAIM")}>
              I claim this most years
            </button>
          )}
          {item.choice === "CLAIM" && (
            <button className="btn secondary" onClick={() => onChoose(item, null)}>
              I don't claim this every year
            </button>
          )}
          {item.choice !== "NOT_FOR_ME" && item.claims.length === 0 && item.verdict !== "CANT" && (
            <button className="btn secondary" onClick={() => onChoose(item, "NOT_FOR_ME")}>
              Not for me
            </button>
          )}
          {item.choice === "NOT_FOR_ME" && (
            <button className="btn secondary" onClick={() => onChoose(item, null)}>
              Put it back
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

/** The ATO's words: paragraphs, with the lines of a list gathered into one. */
function AtoWords({ text }: { text: string }) {
  const blocks: Array<{ list: boolean; lines: string[] }> = [];
  for (const line of text.split("\n")) {
    const list = /^[a-z]/.test(line);
    const last = blocks[blocks.length - 1];
    if (list && last?.list) last.lines.push(line);
    else blocks.push({ list, lines: [line] });
  }
  return (
    <div className="ato-words">
      {blocks.map((b, n) =>
        b.list ? (
          <ul key={n}>
            {b.lines.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={n}>{b.lines[0]}</p>
        )
      )}
      <p className="cap-explain">The ATO's words; its worked examples are in the whole guide.</p>
    </div>
  );
}
