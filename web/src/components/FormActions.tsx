import type { Draft } from "../hooks/useDraft.js";

/** A note shown when a form reopens with what was typed last time. */
export function DraftNotice({ draft }: { draft: Draft }) {
  if (!draft.restored) return null;
  return <div className="message-box info">Draft kept from last time — carry on, or Clear to start again.</div>;
}

/**
 * The form's main action with Clear beside it, so both controls are in one
 * place. Clear empties the form and throws the draft away.
 */
export function FormActions({
  onSubmit,
  draft,
  label = "Create",
  busy = false,
}: {
  onSubmit: () => void;
  draft: Draft;
  label?: string;
  busy?: boolean;
}) {
  return (
    <div className="toolbar" style={{ marginTop: 16 }}>
      <button className="btn" onClick={onSubmit} disabled={busy}>
        {label}
      </button>
      <button className="btn secondary" onClick={draft.clear} disabled={!draft.isDirty}>
        Clear
      </button>
    </div>
  );
}
