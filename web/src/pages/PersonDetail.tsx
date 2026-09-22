import { useEffect, useRef, useState } from "react";
import { TfnField } from "../components/TfnField.js";
import { Link, useParams } from "react-router-dom";
import { api, Document, Entity, FinancialYear, PayPeriod, Person } from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { financialYearLabelForToday, formatCurrency, formatDate, humanize } from "../utils.js";

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
          <td colSpan={5}>
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
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relType, setRelType] = useState("TRUSTEE");
  const [relEntityId, setRelEntityId] = useState("");
  const [relPercent, setRelPercent] = useState("");
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearId] = useState("");
  const [periods, setPeriods] = useState<PayPeriod[]>([]);

  function load() {
    if (!id) return;
    api.people.get(id).then(setPerson);
  }

  useEffect(load, [id]);
  useEffect(() => {
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

  if (!person) return <div className="empty-state">Loading…</div>;

  async function addRelationship() {
    if (!id || !relEntityId) return;
    await api.people.addRelationship({
      personId: id,
      entityId: relEntityId,
      relationshipType: relType,
      ownershipPercent: relPercent ? Number(relPercent) : null,
    });
    setRelEntityId("");
    setRelPercent("");
    load();
  }

  async function removeRelationship(relId: string) {
    await api.people.removeRelationship(relId);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{person.name}</h2>
          <p>Person — relationships to the legal entities that own assets on their behalf or with their involvement.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tax file number</h3>
        <TfnField owner="person" id={person.id} hasTfn={person.hasTfn} tfnMasked={person.tfnMasked} onSaved={load} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Relationships to entities</h3>
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
    </div>
  );
}
