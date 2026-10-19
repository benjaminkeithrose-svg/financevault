import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PackType, ProfessionalPack as Pack } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { formatDate } from "../utils.js";

export const PACKS: Array<{ type: PackType; label: string; who: string }> = [
  { type: "broker", label: "Broker", who: "broker" },
  { type: "accountant", label: "Accountant", who: "accountant" },
  { type: "solicitor", label: "Solicitor or conveyancer", who: "solicitor or conveyancer" },
  { type: "due-diligence", label: "Due diligence summary", who: "adviser" },
];

/**
 * A pack for a professional about a property you're considering: a summary
 * made from what's recorded, your questions for them, and the property's
 * documents. Print it (or save it as a PDF), or download a ZIP with the
 * same summary and the documents you tick.
 */
export function ProfessionalPack() {
  const { assetId = "", type = "broker" } = useParams();
  const [pack, setPack] = useState<Pack | null>(null);
  const [questions, setQuestions] = useState("");
  const [savedQuestions, setSavedQuestions] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const who = PACKS.find((p) => p.type === type)?.who ?? "adviser";

  const load = () =>
    api.considering
      .pack(assetId, type as PackType)
      .then((p) => {
        setPack(p);
        setQuestions(p.questions);
        setSavedQuestions(p.questions);
        return p;
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    setPack(null);
    void load().then((p) => p && setTicked(new Set(p.documents.map((d) => d.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, type]);

  if (!pack) return <div className="empty-state">{error ?? "Loading…"}</div>;

  async function saveQuestions() {
    try {
      await api.considering.savePackQuestions(assetId, type as PackType, questions);
      setSaved(true);
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggle = (id: string) => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };
  const chosen = pack.documents.filter((d) => ticked.has(d.id));
  const unsaved = questions !== savedQuestions;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {pack.title.split(" — ")[0]} <HelpLink topic="considering" />
          </h2>
          <p>
            <Link to={pack.route}>{pack.address}</Link> · prepared {formatDate(pack.prepared)}
          </p>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>

      <div className="card no-print">
        <h3 style={{ marginTop: 0 }}>Your questions for the {who}</h3>
        <textarea
          rows={4}
          value={questions}
          onChange={(e) => {
            setQuestions(e.target.value);
            setSaved(false);
          }}
          aria-label={`Your questions for the ${who}`}
          placeholder="One question a line"
        />
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn secondary" onClick={saveQuestions} disabled={!unsaved}>
            Save questions
          </button>
          {saved && !unsaved && (
            <span className="cap-explain" style={{ margin: 0 }}>
              Saved — they're in the pack below.
            </span>
          )}
        </div>
      </div>

      {pack.sections.map((s) => (
        <div className="card" key={s.title}>
          <h3 style={{ marginTop: 0 }}>{s.title}</h3>
          {s.rows && (
            <div className="table-scroll">
              <table className="pack-rows">
                <tbody>
                  {s.rows.map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.lines && (
            <ul className="pack-lines">
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        {pack.documents.length === 0 ? (
          <p className="cap-explain">None linked to this property yet. Identity documents are never included.</p>
        ) : (
          <>
            <p className="cap-explain no-print">Tick the ones to put in the ZIP. Identity documents are never included.</p>
            <ul className="check-list">
              {pack.documents.map((d) => (
                <li key={d.id} className={ticked.has(d.id) ? "" : "no-print"}>
                  <label className="checkbox-row" style={{ margin: 0 }}>
                    <input type="checkbox" className="no-print" checked={ticked.has(d.id)} onChange={() => toggle(d.id)} /> {d.name}
                    {d.type && (
                      <span className="cap-explain" style={{ margin: "0 0 0 6px" }}>
                        {d.type}
                      </span>
                    )}
                    {d.date && (
                      <span className="cap-explain" style={{ margin: "0 0 0 6px" }}>
                        {formatDate(d.date)}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="toolbar no-print" style={{ flexWrap: "wrap", marginTop: 8 }}>
          <a
            className="btn secondary"
            href={api.considering.packZipUrl(
              assetId,
              type as PackType,
              chosen.map((d) => d.id),
            )}
            download
          >
            Download the pack (ZIP)
          </a>
          <span className="cap-explain" style={{ margin: 0 }}>
            The summary as a page, plus {chosen.length} document{chosen.length === 1 ? "" : "s"}.
          </span>
        </div>
      </div>

      <div className="message-box info">{pack.disclaimer}</div>
      {error && <div className="message-box error">{error}</div>}
    </div>
  );
}
