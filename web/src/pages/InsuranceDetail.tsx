import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Entity, InsurancePolicy } from "../api/client.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { HelpLink } from "../components/HelpLink.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { coversLink, EMPTY_POLICY, InsurancePanel, PolicyFields, PolicyForm, policyKindLabel, policyPayload, premiumText, RenewalBadge } from "../components/InsurancePanel.js";
import { formatCurrency } from "../utils.js";

/** One insurance policy: what it covers, the numbers, and its schedule and certificates. */
export function InsuranceDetail() {
  const { id } = useParams<{ id: string }>();
  const [policy, setPolicy] = useState<InsurancePolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PolicyForm>(EMPTY_POLICY);
  const [policyNumber, setPolicyNumber] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.insurance.get(id).then(setPolicy).catch((e: Error) => setLoadError(e.message));
  }
  useEffect(load, [id]);
  useEffect(() => {
    api.entities.list().then(setEntities).catch(() => {});
  }, []);

  if (!policy) {
    if (loadError) return <LoadFailed message={loadError} backTo="/insurance" backLabel="Back to insurance" />;
    return <div className="empty-state">Loading…</div>;
  }

  function startEditing() {
    if (!policy) return;
    setForm({
      kind: policy.kind,
      insurer: policy.insurer ?? "",
      coverAmount: policy.coverAmount?.toString() ?? "",
      premium: policy.premium?.toString() ?? "",
      premiumFrequency: policy.premiumFrequency ?? "ANNUALLY",
      renewalDate: policy.renewalDate?.slice(0, 10) ?? "",
      entityId: policy.entityId ?? "",
      heldInSuper: policy.heldInSuper,
      notes: policy.notes ?? "",
    });
    // Stored encrypted: typed only to change it.
    setPolicyNumber("");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!id) return;
    try {
      await api.insurance.update(id, { ...policyPayload(form), ...(policyNumber ? { policyNumber } : {}) });
      setEditing(false);
      setRevealed(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reveal() {
    if (!id) return;
    if (revealed) setRevealed(null);
    else setRevealed((await api.insurance.reveal(id)).policyNumber ?? "");
  }

  const title = `${policyKindLabel(policy.kind)}${policy.insurer ? ` — ${policy.insurer}` : ""}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {title} <HelpLink topic="insurance" />
          </h2>
          <p>Covers {coversLink(policy)}</p>
        </div>
        {!editing && (
          <button className="btn" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      <div className="card">
        {editing ? (
          <>
            <PolicyFields
              form={form}
              onChange={setForm}
              entities={entities}
              policyNumber={policyNumber}
              onPolicyNumber={setPolicyNumber}
              policyNumberHint={policy.policyNumberMasked ? "Leave blank to keep it" : undefined}
            />
            {error && <div className="message-box warning">{error}</div>}
            <div className="toolbar" style={{ marginTop: 16 }}>
              <button className="btn" onClick={save}>
                Save
              </button>
              <button className="btn secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <dl className="detail-list">
            <dt>Policy number</dt>
            <dd>
              {policy.policyNumberMasked ? (
                <>
                  {revealed ?? policy.policyNumberMasked}{" "}
                  <button className="link-button" onClick={reveal}>
                    {revealed ? "Hide" : "Show"}
                  </button>
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt>Renewal</dt>
            <dd>
              <RenewalBadge date={policy.renewalDate} />
            </dd>
            <dt>Amount covered</dt>
            <dd>{policy.coverAmount ? formatCurrency(policy.coverAmount) : "—"}</dd>
            <dt>Premium</dt>
            <dd>{premiumText(policy) ?? "—"}</dd>
            <dt>Held by</dt>
            <dd>
              {policy.entity?.name ?? "—"}
              {policy.heldInSuper ? " (through super)" : ""}
            </dd>
            {policy.notes && (
              <>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{policy.notes}</dd>
              </>
            )}
          </dl>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Policy schedule and certificates</h3>
        <DocumentLinker targetType="INSURANCE_POLICY" targetId={policy.id} onChange={load} />
      </div>

      <DeleteSection
        title="Delete this policy"
        note="For a policy entered by mistake or one you no longer hold. Its documents stay in Documents."
        question={`Delete ${title}?`}
        action={() => api.insurance.remove(policy.id)}
        redirectTo="/insurance"
      />
    </div>
  );
}

/** Every policy in one place, soonest renewal first. */
export function Insurance() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Insurance <HelpLink topic="insurance" />
          </h2>
          <p>Every policy, what it covers and when it renews. Each one also shows on what it covers, and in the asset tree.</p>
        </div>
      </div>
      <InsurancePanel title="All policies" />
    </div>
  );
}
