import { Entity } from "../api/client.js";
import { useDraft } from "../hooks/useDraft.js";
import { IconBin } from "./icons.js";

/**
 * "Owned by" with room for more than one owner — a house 50/50 between two
 * people, a car split between four. The first owner is the one on record;
 * with others added, everyone gets a percentage and they must add up to
 * 100%. The co-owners are kept as a draft alongside the form's own.
 */

export interface CoOwner {
  entityId: string;
  percent: string;
}

const EMPTY = { primaryPercent: "", others: [] as CoOwner[] };

export function useOwners(formKey: string) {
  const [state, setState, draft] = useDraft(`${formKey}:owners`, EMPTY);
  const shared = state.others.length > 0;

  function total(): number {
    return Number(state.primaryPercent || 0) + state.others.reduce((s, o) => s + Number(o.percent || 0), 0);
  }

  /** What's wrong with the owners as entered, or null. */
  function problem(primaryId: string): string | null {
    if (!shared) return null;
    if (!primaryId || state.others.some((o) => !o.entityId)) return "Choose each owner, or remove the empty row.";
    const ids = [primaryId, ...state.others.map((o) => o.entityId)];
    if (new Set(ids).size !== ids.length) return "Each owner can only be listed once.";
    if (Math.abs(total() - 100) > 0.01) return `The shares add up to ${Math.round(total() * 100) / 100}% — they need to add up to 100%.`;
    return null;
  }

  /** The owners to send when creating, or undefined when there's just one. */
  function payload(primaryId: string) {
    if (!shared || !primaryId) return undefined;
    return [
      { entityId: primaryId, percent: Number(state.primaryPercent) },
      ...state.others.map((o) => ({ entityId: o.entityId, percent: Number(o.percent) })),
    ];
  }

  return { state, setState, shared, total, problem, payload, draft };
}

/** Wraps a form's draft so Clear and the "unsaved" state cover the co-owners too. */
export function withOwners<D extends { isDirty: boolean; clear: () => void; restored: boolean }>(
  draft: D,
  owners: ReturnType<typeof useOwners>
): D {
  return {
    ...draft,
    isDirty: draft.isDirty || owners.draft.isDirty,
    restored: draft.restored || owners.draft.restored,
    clear: () => {
      draft.clear();
      owners.draft.clear();
    },
  };
}

export function OwnersPicker({
  label = "Owned by",
  entities,
  primaryId,
  onPrimary,
  owners,
}: {
  label?: string;
  entities: Entity[];
  primaryId: string;
  onPrimary: (id: string) => void;
  owners: ReturnType<typeof useOwners>;
}) {
  const { state, setState, shared } = owners;

  // Adding or removing an owner shares it out evenly again; adjust after.
  function evenly(others: CoOwner[]) {
    const n = others.length + 1;
    if (n === 1) return setState({ primaryPercent: "", others: [] });
    const each = Math.floor(10000 / n) / 100;
    const first = Math.round((100 - each * (n - 1)) * 100) / 100;
    setState({ primaryPercent: String(first), others: others.map((o) => ({ ...o, percent: String(each) })) });
  }

  const setOther = (i: number, patch: Partial<CoOwner>) =>
    setState({ ...state, others: state.others.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  const options = (
    <>
      <option value="">— Select —</option>
      {entities.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </>
  );

  const problem = owners.problem(primaryId);
  return (
    <div className="owners-picker">
      <label>{label}</label>
      <div className="owner-row">
        <select value={primaryId} onChange={(e) => onPrimary(e.target.value)}>
          {options}
        </select>
        {shared && (
          <PercentInput value={state.primaryPercent} onChange={(v) => setState({ ...state, primaryPercent: v })} />
        )}
      </div>
      {state.others.map((o, i) => (
        <div className="owner-row" key={i}>
          <select value={o.entityId} onChange={(e) => setOther(i, { entityId: e.target.value })} aria-label={`Owner ${i + 2}`}>
            {options}
          </select>
          <PercentInput value={o.percent} onChange={(v) => setOther(i, { percent: v })} />
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Remove this owner"
            onClick={() => evenly(state.others.filter((_, j) => j !== i))}
          >
            <IconBin />
          </button>
        </div>
      ))}
      <button type="button" className="link-button" onClick={() => evenly([...state.others, { entityId: "", percent: "" }])}>
        + Add another owner
      </button>
      {shared && problem && <p className="cap-note over">{problem}</p>}
    </div>
  );
}

function PercentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="percent-input">
      <input type="number" min="0" max="100" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Share" />
      <span>%</span>
    </span>
  );
}
