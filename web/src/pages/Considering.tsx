import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ConsideredProperty, Entity } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { OwnersPicker, useOwners, withOwners } from "../components/OwnersPicker.js";
import { useDraft } from "../hooks/useDraft.js";
import { CONSIDER_STAGES, formatCurrency, formatDate } from "../utils.js";

type Show = "ALL" | "RESIDENTIAL" | "COMMERCIAL";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Card({ p }: { p: ConsideredProperty }) {
  const passed = p.status === "PASSED_ON";
  return (
    <Link to={p.route} className={`board-card${passed ? " passed" : ""}`}>
      <span className="board-card-title">{p.address}</span>
      <span>{p.askingPrice ? `Asking ${formatCurrency(p.askingPrice)}` : "No asking price yet"}</span>
      {p.expected ? (
        <span className="board-card-figures">
          {p.expected.netYield !== null
            ? `Net yield ${pct(p.expected.netYield)}`
            : p.expected.grossYield !== null
              ? `Yield ${pct(p.expected.grossYield)}`
              : ""}
          {p.expected.weeklyCash !== null
            ? ` · ${formatCurrency(p.expected.weeklyCash)} a week${p.expected.afterTax ? " after tax" : ""}`
            : ""}
        </span>
      ) : p.grossYield !== null ? (
        <span className="board-card-figures">Yield {pct(p.grossYield)} (rent ÷ price)</span>
      ) : (
        <span className="board-card-figures muted">Add the rent to see the yield</span>
      )}
      {passed && (
        <span className="board-card-figures muted">
          Passed on {p.passedOnAt ? formatDate(p.passedOnAt) : ""}
          {p.passedOnReason ? ` — ${p.passedOnReason}` : ""}
        </span>
      )}
      {p.kind === "COMMERCIAL" && <span className="board-card-figures muted">Commercial</span>}
    </Link>
  );
}

/**
 * Properties I'm considering: everything you're looking at buying, in
 * columns by how far along it is, with the ones you passed on greyed at the
 * end. Each opens as a normal property page. None of it counts in any total
 * until it's bought.
 */
export function Considering() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ConsideredProperty[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [show, setShow] = useState<Show>("ALL");
  const [form, setForm, draft] = useDraft("considering:new", { kind: "RESIDENTIAL", address: "", askingPrice: "", entityId: "" });
  const owners = useOwners("considering:new");
  const formDraft = withOwners(draft, owners);
  const [adding, setAdding] = useState(draft.restored);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.considering
      .list()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    void load();
    api.entities
      .list()
      .then(setEntities)
      .catch(() => setEntities([]));
  }, []);

  async function add() {
    if (!form.address.trim() || !form.entityId) {
      setError("Enter the address and who'd buy it.");
      return;
    }
    const problem = owners.problem(form.entityId);
    if (problem) {
      setError(problem);
      return;
    }
    const created = await api.considering.add({
      kind: form.kind as "RESIDENTIAL" | "COMMERCIAL",
      address: form.address.trim(),
      askingPrice: form.askingPrice ? Number(form.askingPrice) : null,
      entityId: form.entityId,
      owners: owners.payload(form.entityId),
    });
    formDraft.clear();
    navigate(created.route);
  }

  const shown = (items ?? []).filter((p) => show === "ALL" || p.kind === show);
  const columns = [
    ...CONSIDER_STAGES.map((s) => ({
      key: s.value,
      label: s.label,
      cards: shown.filter((p) => p.status === "CONSIDERING" && p.stage === s.value),
    })),
    { key: "PASSED_ON", label: "Passed on", cards: shown.filter((p) => p.status === "PASSED_ON") },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Properties I'm considering <HelpLink topic="considering" />
          </h2>
          <p>From first spotting one to buying it. None of these count in your totals until they're bought.</p>
        </div>
      </div>

      {!adding ? (
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <button className="btn" onClick={() => setAdding(true)}>
            Add a property I'm considering
          </button>
        </div>
      ) : (
        <div className="card">
          <DraftNotice draft={formDraft} />
          <div className="segmented" role="group" aria-label="Kind of property">
            {[
              ["RESIDENTIAL", "Home or rental"],
              ["COMMERCIAL", "Commercial"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={form.kind === value ? "selected" : ""}
                aria-pressed={form.kind === value}
                onClick={() => setForm({ ...form, kind: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <label>Address</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="12 Smith St, Dubbo NSW 2830"
          />
          <label>Asking price ($)</label>
          <input type="number" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
          <OwnersPicker
            label="Who'd buy it"
            entities={entities}
            primaryId={form.entityId}
            onPrimary={(entityId) => setForm({ ...form, entityId })}
            owners={owners}
          />
          <p className="cap-explain">Everything else can be added on its page, as you find it out.</p>
          {error && <div className="message-box error">{error}</div>}
          <FormActions onSubmit={add} draft={formDraft} label="Add it" />
          <button className="link-button" onClick={() => setAdding(false)}>
            Close
          </button>
        </div>
      )}

      <div className="segmented" role="group" aria-label="Which properties" style={{ marginBottom: 12 }}>
        {(
          [
            ["ALL", "All"],
            ["RESIDENTIAL", "Residential"],
            ["COMMERCIAL", "Commercial"],
          ] as Array<[Show, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={show === value ? "selected" : ""}
            aria-pressed={show === value}
            onClick={() => setShow(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="empty-state">{error ?? "Loading…"}</p>
      ) : items.length === 0 ? (
        <p className="empty-state">Nothing yet. Add a property you're looking at, with just its address and asking price.</p>
      ) : (
        <div className="board" role="list">
          {columns.map((c) => (
            <section key={c.key} className={`board-column${c.key === "PASSED_ON" ? " passed" : ""}`} role="listitem" aria-label={c.label}>
              <h3>
                {c.label} <span className="board-count">{c.cards.length}</span>
              </h3>
              {c.cards.map((p) => (
                <Card key={p.assetId} p={p} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
