import { useEffect, useRef, useState } from "react";
import { MissingFlags } from "../components/MissingFlags.js";
import { TfnField } from "../components/TfnField.js";
import { Link, useParams } from "react-router-dom";
import { api, Document, Entity, FamilySuggestion, FinancialYear, PayPeriod, Person } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { familySummary, financialYearLabelForToday, formatCurrency, formatDate, humanize, confirmThenDelete } from "../utils.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { DeleteSection } from "../components/DeleteSection.js";
import { FamilyPanel } from "../components/FamilyPanel.js";
import { IdentityPanel } from "../components/IdentityPanel.js";
import { InsurancePanel } from "../components/InsurancePanel.js";
import { EstatePanel } from "../components/EstatePanel.js";
import { TrustFamilyPrompt } from "../components/TrustFamilyPrompt.js";
import { PersonalDetailsPanel } from "../components/PersonalDetailsPanel.js";
import { IncomeCard } from "../components/IncomeCard.js";
import { PaygPanel } from "../components/PaygPanel.js";
import { FeatureGate } from "../components/FeatureGate.js";

const RELATIONSHIP_TYPES = [
  "SETTLOR",
  "TRUSTEE",
  "DIRECTOR",
  "SHAREHOLDER",
  "BENEFICIARY",
  "MEMBER",
  "INDIVIDUAL_OWNER",
  "JOINT_OWNER",
  "GUARANTOR",
  "BORROWER",
  "APPOINTOR",
  "ACCOUNTANT",
  "TAX_AGENT",
  "OTHER",
];

const PAY_FREQUENCIES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"];

const STATUS_LABEL: Record<PayPeriod["status"], string> = {
  LOGGED: "Logged",
  NON_WORKING: "Non-working",
  MISSING: "Missing",
  PENDING: "Not yet due",
};

/** Pays from this date should come with their super (payday super). */
const PAYDAY_SUPER_FROM = "2026-07-01";

function PayPeriodRow({ period, onChange }: { period: PayPeriod; onChange: () => void }) {
  const { id } = useParams<{ id: string }>();
  const [amount, setAmount] = useState(period.entry?.amount?.toString() ?? "");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function logWithDocument(documentId: string) {
    if (!id) return;
    await api.people.logPayPeriod(id, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: "LOGGED",
      documentId,
      amount: amount ? Number(amount) : null,
    });
    setPickerOpen(false);
    onChange();
  }

  async function uploadAndLog(files: FileList | null) {
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      const { document } = await api.documents.upload(files[0]);
      await logWithDocument(document.id);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function markNonWorking() {
    if (!id) return;
    await api.people.logPayPeriod(id, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: "NON_WORKING",
    });
    onChange();
  }

  async function undo() {
    if (!period.entry) return;
    await api.people.removePayPeriodEntry(period.entry.id);
    onChange();
  }

  // Shown ticked straight away; the list reloads once it's saved.
  const [superPaid, setSuperPaid] = useState(!!period.entry?.superPaid);
  useEffect(() => setSuperPaid(!!period.entry?.superPaid), [period.entry?.superPaid]);

  async function toggleSuper(checked: boolean) {
    if (!period.entry) return;
    setSuperPaid(checked);
    try {
      await api.people.setPayPeriodSuper(period.entry.id, checked);
    } catch {
      setSuperPaid(!checked);
    }
    onChange();
  }

  const superApplies = period.status === "LOGGED" && period.periodEnd.slice(0, 10) >= PAYDAY_SUPER_FROM;

  async function openPicker() {
    setPickerOpen(true);
    setDocuments(await api.documents.list());
  }

  return (
    <>
      <tr>
        <td>
          {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
        </td>
        <td>
          <span className={`badge status-${period.status}`}>{STATUS_LABEL[period.status]}</span>
        </td>
        <td>
          {period.entry?.document ? (
            <Link to={`/documents/${period.entry.document.id}`}>{period.entry.document.originalFilename}</Link>
          ) : (
            "—"
          )}
        </td>
        <td>
          {period.status === "LOGGED" ? (
            formatCurrency(period.entry?.amount)
          ) : (
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 120 }}
            />
          )}
        </td>
        <td>
          {superApplies ? (
            <label className="checkbox-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={superPaid} onChange={(e) => toggleSuper(e.target.checked)} />
              Paid
            </label>
          ) : (
            "—"
          )}
        </td>
        <td>
          {period.entry ? (
            <button className="btn secondary" onClick={undo}>
              Undo
            </button>
          ) : (
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <input ref={fileInputRef} type="file" hidden onChange={(e) => uploadAndLog(e.target.files)} />
              <button className="btn secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload payslip"}
              </button>
              <button className="btn secondary" onClick={openPicker}>
                Link existing
              </button>
              <button className="btn secondary" onClick={markNonWorking}>
                Non-working
              </button>
            </div>
          )}
        </td>
      </tr>
      {pickerOpen && (
        <tr>
          <td colSpan={6}>
            <div className="card" style={{ margin: 0 }}>
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <strong>Choose a document to link as this period's payslip</strong>
                <button className="btn secondary" onClick={() => setPickerOpen(false)}>
                  Close
                </button>
              </div>
              <table>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.originalFilename}</td>
                      <td>{d.documentType || "—"}</td>
                      <td>
                        <button className="btn secondary" onClick={() => logWithDocument(d.id)}>
                          Link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relType, setRelType] = useState("TRUSTEE");
  const [relEntityId, setRelEntityId] = useState("");
  const [relPercent, setRelPercent] = useState("");
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearId] = useState("");
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [personalEntity, setPersonalEntity] = useState<Entity | null>(null);
  const [prompt, setPrompt] = useState<{ entityId: string; entityName: string; suggestions: FamilySuggestion[] } | null>(
    null
  );
  const [relError, setRelError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.people.get(id).then(setPerson).catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    if (person?.entityId) api.entities.get(person.entityId).then(setPersonalEntity).catch(() => setPersonalEntity(null));
  }, [person?.entityId]);
  useEffect(() => {
    api.people.list().then(setPeople);
    api.entities.list().then(setEntities);
    api.financialYears.list().then((years) => {
      setFinancialYears(years);
      const current = years.find((y) => y.label === financialYearLabelForToday());
      if (current) setFinancialYearId(current.id);
    });
  }, []);

  function loadPeriods() {
    if (!id || !financialYearId || !person?.payFrequency) {
      setPeriods([]);
      return;
    }
    api.people.payPeriods(id, financialYearId).then((res) => setPeriods(res.periods));
  }

  useEffect(loadPeriods, [id, financialYearId, person?.payFrequency]);

  async function setPayFrequency(value: string) {
    if (!id) return;
    await api.people.update(id, { payFrequency: value || null });
    load();
  }

  if (!person) {
    if (loadError) return <LoadFailed message={loadError} backTo="/people" backLabel="Back to people" />;
    return <div className="empty-state">Loading…</div>;
  }

  async function addRelationship() {
    if (!id || !relEntityId) return;
    setRelError(null);
    try {
      const created = await api.people.addRelationship({
        personId: id,
        entityId: relEntityId,
        relationshipType: relType,
        ownershipPercent: relPercent ? Number(relPercent) : null,
      });
      // Setting up a family trust: offer the rest of the family.
      if (created.familySuggestions.length > 0) {
        setPrompt({
          entityId: created.entityId,
          entityName: created.entity?.name ?? "the trust",
          suggestions: created.familySuggestions,
        });
      }
      setRelEntityId("");
      setRelPercent("");
      load();
    } catch (err) {
      setRelError((err as Error).message);
    }
  }

  async function removeRelationship(relId: string) {
    const deleted = await confirmThenDelete(
      "Remove this relationship?",
      () => api.people.removeRelationship(relId)
    );
    if (!deleted) return;
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{person.name}</h2>
          <p>{familySummary(person) || "Person"} · also their own entity for anything held in their own name.</p>
        </div>
      </div>

      {prompt && (
        <TrustFamilyPrompt
          entityId={prompt.entityId}
          entityName={prompt.entityName}
          suggestions={prompt.suggestions}
          onDone={() => {
            setPrompt(null);
            load();
          }}
        />
      )}

      {personalEntity?.financialPosition && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Held in their own name</h3>
            <Link className="btn secondary" to={`/entities/${personalEntity.id}`}>
              Open
            </Link>
          </div>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            <div className="stat-tile">
              <div className="label">Assets</div>
              <div className="value">{formatCurrency(personalEntity.financialPosition.totalAssets)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Liabilities</div>
              <div className="value">{formatCurrency(personalEntity.financialPosition.totalLiabilities)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Net</div>
              <div className="value">{formatCurrency(personalEntity.financialPosition.netAssets)}</div>
            </div>
          </div>
        </div>
      )}

      <PersonalDetailsPanel person={person} onChange={load} />

      <IncomeCard person={person} onChange={load} />

      <FeatureGate feature="payg" quiet>
        <PaygPanel person={person} onChange={load} />
      </FeatureGate>

      <FamilyPanel person={person} people={people} onChange={load} />

      <IdentityPanel personId={person.id} />

      <MissingFlags target={`person:${person.id}`} />
      <InsurancePanel personId={person.id} title="Life & income cover" defaultHolderId={person.entityId} />

      <EstatePanel personId={person.id} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tax file number</h3>
        <TfnField owner="person" id={person.id} hasTfn={person.hasTfn} tfnMasked={person.tfnMasked} onSaved={load} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Roles in trusts, companies and funds</h3>
        {(person.entityRelationships || []).length === 0 ? (
          <p className="empty-state">No relationships recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Entity</th>
                <th>Ownership %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(person.entityRelationships || []).map((r) => (
                <tr key={r.id}>
                  <td>{humanize(r.relationshipType)}</td>
                  <td>
                    <Link to={`/entities/${r.entityId}`}>{r.entity?.name}</Link>
                  </td>
                  <td>{r.ownershipPercent !== null && r.ownershipPercent !== undefined ? `${r.ownershipPercent}%` : "—"}</td>
                  <td>
                    <button className="btn secondary" onClick={() => removeRelationship(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <label>Role</label>
        <select value={relType} onChange={(e) => setRelType(e.target.value)}>
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
        <div className="grid grid-2">
          <div>
            <label>Entity</label>
            <select value={relEntityId} onChange={(e) => setRelEntityId(e.target.value)}>
              <option value="">— Select —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({humanize(e.entityType)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Ownership % (if relevant)</label>
            <input type="number" value={relPercent} onChange={(e) => setRelPercent(e.target.value)} />
          </div>
        </div>
        {relError && <div className="message-box warning">{relError}</div>}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={addRelationship}>
            Add relationship
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Pay tracking</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Tracks payslips against expected pay periods so a missed upload gets flagged rather than silently
          forgotten. Mark a period "Non-working" instead of uploading when it was an intentional gap (e.g. a casual
          week off) — it will never be counted as missing.
        </p>
        <label>Pay frequency</label>
        <select value={person.payFrequency || ""} onChange={(e) => setPayFrequency(e.target.value)}>
          <option value="">Not tracked</option>
          {PAY_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {humanize(f)}
            </option>
          ))}
        </select>

        {person.payFrequency && (
          <>
            <label style={{ marginTop: 12 }}>Financial year</label>
            <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} style={{ width: 160 }}>
              <option value="">— Select FY —</option>
              {financialYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>

            {financialYearId &&
              (periods.length === 0 ? (
                <p className="empty-state">No periods for this financial year.</p>
              ) : (
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Status</th>
                      <th>Document</th>
                      <th>Amount</th>
                      <th>Super</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <PayPeriodRow key={p.periodStart} period={p} onChange={loadPeriods} />
                    ))}
                  </tbody>
                </table>
              ))}
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="PERSON" targetId={person.id} />
      </div>
      <DeleteSection
        title="Delete this person"
        note="Removes the person with their personal entity, family links, ID records and pay-period log. Not possible while anything is still held in their own name. Documents are kept."
        question={`Delete ${person.name}? Their personal entity, family links, ID records and pay-period log are removed too. This can't be undone.`}
        action={() => api.people.remove(person.id)}
        redirectTo="/people"
      />
    </div>
  );
}
