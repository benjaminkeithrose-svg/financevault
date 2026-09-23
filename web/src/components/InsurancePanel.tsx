import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Asset, Entity, InsurancePolicy, Person } from "../api/client.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { HelpLink } from "./HelpLink.js";
import { useDraft } from "../hooks/useDraft.js";
import { dueState, formatCurrency, formatDate } from "../utils.js";

export const POLICY_KINDS: Record<string, string> = {
  BUILDING: "Building insurance",
  CONTENTS: "Contents insurance",
  BUILDING_AND_CONTENTS: "Home and contents",
  LANDLORD: "Landlord insurance",
  STRATA: "Strata insurance",
  MOTOR: "Car or motorbike insurance",
  BOAT: "Boat insurance",
  PUBLIC_LIABILITY: "Public liability",
  LIFE: "Life cover",
  TPD: "TPD cover",
  TRAUMA: "Trauma cover",
  INCOME_PROTECTION: "Income protection",
  BUSINESS: "Business insurance",
  OTHER: "Other insurance",
};

/** Cover on a person rather than a thing — it can be held through super. */
export const PERSON_KINDS = ["LIFE", "TPD", "TRAUMA", "INCOME_PROTECTION"];

export const policyKindLabel = (kind: string) => POLICY_KINDS[kind] ?? "Insurance";

const FREQUENCY: Record<string, string> = { MONTHLY: "a month", QUARTERLY: "a quarter", ANNUALLY: "a year" };

export function premiumText(p: Pick<InsurancePolicy, "premium" | "premiumFrequency">): string | null {
  if (p.premium === null || p.premium === undefined) return null;
  return `${formatCurrency(p.premium)} ${FREQUENCY[p.premiumFrequency ?? "ANNUALLY"] ?? "a year"}`;
}

/** What a policy covers, as a link to it. */
export function coversLink(p: InsurancePolicy) {
  if (p.asset) {
    const to = p.asset.property ? `/properties/${p.asset.property.id}` : p.asset.commercialProperty ? `/commercial-properties/${p.asset.commercialProperty.id}` : `/assets/${p.asset.id}`;
    return <Link to={to}>{p.asset.name}</Link>;
  }
  if (p.person) return <Link to={`/people/${p.person.id}`}>{p.person.name}</Link>;
  if (p.entity) return <Link to={`/entities/${p.entity.id}`}>{p.entity.name}</Link>;
  return <span>—</span>;
}

export const EMPTY_POLICY = {
  kind: "BUILDING",
  insurer: "",
  coverAmount: "",
  premium: "",
  premiumFrequency: "ANNUALLY",
  renewalDate: "",
  entityId: "",
  heldInSuper: false,
  notes: "",
};
export type PolicyForm = typeof EMPTY_POLICY;

export function policyPayload(form: PolicyForm) {
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    kind: form.kind,
    insurer: form.insurer || null,
    coverAmount: num(form.coverAmount),
    premium: num(form.premium),
    premiumFrequency: form.premium ? form.premiumFrequency : null,
    renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : null,
    entityId: form.entityId || null,
    heldInSuper: PERSON_KINDS.includes(form.kind) ? form.heldInSuper : false,
    notes: form.notes || null,
  };
}

/** The fields of a policy, shared by the add form and the policy's own page. */
export function PolicyFields({
  form,
  onChange,
  entities,
  policyNumber,
  onPolicyNumber,
  policyNumberHint,
}: {
  form: PolicyForm;
  onChange: (f: PolicyForm) => void;
  entities: Entity[];
  policyNumber: string;
  onPolicyNumber: (v: string) => void;
  policyNumberHint?: string;
}) {
  const set = (patch: Partial<PolicyForm>) => onChange({ ...form, ...patch });
  return (
    <>
      <div className="grid grid-2">
        <div>
          <label>Kind of cover</label>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {Object.entries(POLICY_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Insurer</label>
          <input value={form.insurer} onChange={(e) => set({ insurer: e.target.value })} placeholder="NRMA, AAMI, TAL…" />
        </div>
        <div>
          <label>Policy number</label>
          <input value={policyNumber} onChange={(e) => onPolicyNumber(e.target.value)} autoComplete="off" placeholder={policyNumberHint} />
        </div>
        <div>
          <label>Renews on</label>
          <input type="date" value={form.renewalDate} onChange={(e) => set({ renewalDate: e.target.value })} />
        </div>
        <div>
          <label>Amount covered</label>
          <input type="number" min="0" value={form.coverAmount} onChange={(e) => set({ coverAmount: e.target.value })} />
        </div>
        <div>
          <label>Premium</label>
          <div className="toolbar" style={{ flexWrap: "nowrap" }}>
            <input type="number" min="0" value={form.premium} onChange={(e) => set({ premium: e.target.value })} />
            <select value={form.premiumFrequency} onChange={(e) => set({ premiumFrequency: e.target.value })} aria-label="How often">
              <option value="MONTHLY">a month</option>
              <option value="QUARTERLY">a quarter</option>
              <option value="ANNUALLY">a year</option>
            </select>
          </div>
        </div>
        <div>
          <label>Policy held by</label>
          <select value={form.entityId} onChange={(e) => set({ entityId: e.target.value })}>
            <option value="">— Not recorded —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {PERSON_KINDS.includes(form.kind) && (
        <label className="checkbox-row">
          <input type="checkbox" checked={form.heldInSuper} onChange={(e) => set({ heldInSuper: e.target.checked })} /> Held through a super fund
        </label>
      )}
      <label>Notes</label>
      <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
    </>
  );
}

export function RenewalBadge({ date }: { date?: string | null }) {
  if (!date) return <span>No renewal date</span>;
  const state = dueState(date);
  return (
    <span className={state ? "badge status-PENDING" : ""}>
      {state === "expired" ? "Renewal passed" : "Renews"} {formatDate(date)}
    </span>
  );
}

/**
 * The insurance hung off one thing — an asset or a person — or, with
 * neither, every policy (with a choice of what a new one covers).
 */
export function InsurancePanel({
  assetId,
  personId,
  defaultKind,
  defaultHolderId,
  title = "Insurance",
}: {
  assetId?: string;
  personId?: string;
  defaultKind?: string;
  /** Who usually holds the policy: the asset's owner, or the person themselves. */
  defaultHolderId?: string | null;
  title?: string;
}) {
  const scoped = !!(assetId || personId);
  const start = { ...EMPTY_POLICY, kind: defaultKind ?? (personId ? "LIFE" : "BUILDING"), entityId: defaultHolderId ?? "" };
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm, draft] = useDraft<PolicyForm & { covers: string }>(`insurance:${assetId ?? personId ?? "all"}`, { ...start, covers: "" });
  const [policyNumber, setPolicyNumber] = useState("");
  const [showForm, setShowForm] = useState(draft.restored);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.insurance.list(assetId ? { assetId } : personId ? { personId } : undefined).then(setPolicies);
  }
  useEffect(load, [assetId, personId]);
  useEffect(() => {
    api.entities.list().then(setEntities);
    if (!scoped) {
      api.people.list().then(setPeople);
      api.assets.list().then((all) => setAssets(all.filter((a) => !a.disposalDate)));
    }
  }, [scoped]);

  async function create() {
    setError(null);
    const [coverKind, coverId] = form.covers.split(":");
    const target = scoped
      ? { assetId: assetId ?? null, personId: personId ?? null }
      : { assetId: coverKind === "asset" ? coverId : null, personId: coverKind === "person" ? coverId : null };
    if (!target.assetId && !target.personId && !form.entityId) {
      setError("Choose what the policy covers, or who holds it.");
      return;
    }
    try {
      await api.insurance.create({ ...policyPayload(form), ...target, policyNumber: policyNumber || null });
      draft.clear();
      setPolicyNumber("");
      setShowForm(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const annual = policies.reduce((s, p) => {
    if (!p.premium) return s;
    const times = p.premiumFrequency === "MONTHLY" ? 12 : p.premiumFrequency === "QUARTERLY" ? 4 : 1;
    return s + p.premium * times;
  }, 0);

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          {title} <HelpLink topic="insurance" />
        </h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Add a policy"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 12 }}>
          <DraftNotice draft={draft} />
          {!scoped && (
            <>
              <label>What it covers</label>
              <select value={form.covers} onChange={(e) => setForm({ ...form, covers: e.target.value })}>
                <option value="">— Choose —</option>
                <optgroup label="People">
                  {people.map((p) => (
                    <option key={p.id} value={`person:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Assets">
                  {assets.map((a) => (
                    <option key={a.id} value={`asset:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </>
          )}
          <PolicyFields form={form} onChange={(f) => setForm({ ...form, ...f })} entities={entities} policyNumber={policyNumber} onPolicyNumber={setPolicyNumber} />
          <p className="cap-explain">The policy number is stored encrypted. Attach the policy schedule from the policy's page once it's saved.</p>
          {error && <div className="message-box warning">{error}</div>}
          <FormActions
            onSubmit={create}
            label="Save"
            draft={{
              ...draft,
              isDirty: draft.isDirty || !!policyNumber,
              clear: () => {
                draft.clear();
                setPolicyNumber("");
              },
            }}
          />
        </div>
      )}

      {policies.length === 0 && !showForm ? (
        <p className="empty-state">No insurance recorded{scoped ? " for this yet" : " yet"}.</p>
      ) : (
        <ul className="plain-list" style={{ marginTop: 12 }}>
          {policies.map((p) => (
            <li key={p.id} style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0" }}>
              <div>
                <Link to={`/insurance/${p.id}`}>
                  <strong>{policyKindLabel(p.kind)}</strong>
                  {p.insurer ? ` — ${p.insurer}` : ""}
                </Link>
                {!scoped && <span style={{ color: "var(--text-muted)" }}> · covers {coversLink(p)}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {[p.coverAmount ? `Cover ${formatCurrency(p.coverAmount)}` : null, premiumText(p), p.heldInSuper ? "Held in super" : null]
                  .filter(Boolean)
                  .join(" · ")}
                {p.coverAmount || p.premium || p.heldInSuper ? " · " : ""}
                <RenewalBadge date={p.renewalDate} />
                {" · "}
                {p.documentCount} document{p.documentCount === 1 ? "" : "s"}
              </div>
            </li>
          ))}
        </ul>
      )}
      {policies.length > 1 && annual > 0 && (
        <p className="cap-explain">Premiums come to about {formatCurrency(annual)} a year.</p>
      )}
    </div>
  );
}
