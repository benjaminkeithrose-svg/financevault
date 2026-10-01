import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Document, Entity, FinancialYear, TaxRecord } from "../api/client.js";
import { financialYearLabelForToday, formatCurrency, humanize, confirmThenDelete } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";
import { DraftNotice, FormActions } from "../components/FormActions.js";
import { useDraft } from "../hooks/useDraft.js";

const RECORD_TYPES = ["INCOME", "EXPENSE", "CAPITAL_GAIN", "CAPITAL_LOSS"];
const STATUSES = ["RECORDED", "ESTIMATED", "NEEDS_REVIEW", "ACCOUNTANT_CONFIRMED"];

const emptyForm = { recordType: "INCOME", description: "", amount: "", status: "RECORDED" };

export function Tax() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [entityId, setEntityId] = useState("");
  const [financialYearId, setFinancialYearId] = useState("");
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [form, setForm, draft] = useDraft("tax-records:new", emptyForm);
  const [showForm, setShowForm] = useState(draft.restored);

  useEffect(() => {
    api.entities.list().then(setEntities);
    api.financialYears.list().then((years) => {
      setFinancialYears(years);
      const current = years.find((y) => y.label === financialYearLabelForToday());
      if (current) setFinancialYearId(current.id);
    });
  }, []);

  function loadRecords() {
    if (!entityId || !financialYearId) {
      setRecords([]);
      return;
    }
    api.taxRecords.list({ entityId, financialYearId }).then(setRecords);
  }

  function loadDocuments() {
    if (!entityId || !financialYearId) {
      setDocuments([]);
      return;
    }
    api.documents.list({ entityId, financialYearId }).then((docs) =>
      setDocuments(docs.filter((d) => d.taxRelevance === "POSSIBLE" || d.taxRelevance === "CONFIRMED"))
    );
  }

  useEffect(loadRecords, [entityId, financialYearId]);
  useEffect(loadDocuments, [entityId, financialYearId]);

  async function addRecord() {
    if (!entityId || !financialYearId || !form.description.trim()) return;
    await api.taxRecords.create({
      entityId,
      financialYearId,
      recordType: form.recordType,
      description: form.description,
      amount: form.amount ? Number(form.amount) : null,
      status: form.status,
    });
    draft.clear();
    setShowForm(false);
    loadRecords();
  }

  async function updateStatus(id: string, status: string) {
    await api.taxRecords.update(id, { status });
    loadRecords();
  }

  async function removeRecord(id: string) {
    if (!(await confirmThenDelete("Delete this tax record?", () => api.taxRecords.remove(id)))) return;
    loadRecords();
  }

  const income = records.filter((r) => r.recordType === "INCOME");
  const expenses = records.filter((r) => r.recordType === "EXPENSE");
  const capital = records.filter((r) => r.recordType === "CAPITAL_GAIN" || r.recordType === "CAPITAL_LOSS");
  const sum = (rows: TaxRecord[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  function section(title: string, rows: TaxRecord[]) {
    return (
      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            {title} — {formatCurrency(sum(rows))}
          </h3>
        </div>
        {rows.length === 0 ? (
          <p className="empty-state">Nothing recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td>{formatCurrency(r.amount)}</td>
                  <td>
                    <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn secondary" onClick={() => removeRecord(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Tax <HelpLink topic="tax" /></h2>
          <p>Organised by entity and financial year — an information organiser, not tax advice.</p>
        </div>
      </div>

      <div className="toolbar">
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ width: 240 }}>
          <option value="">— Select entity —</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} style={{ width: 160 }}>
          <option value="">— Select FY —</option>
          {financialYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
        {entityId && financialYearId && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New record"}
          </button>
        )}
      </div>

      {!entityId || !financialYearId ? (
        <div className="placeholder-page">
          <p>Choose an entity and a financial year to see its tax records.</p>
        </div>
      ) : (
        <>
          {showForm && (
            <div className="card">
              <DraftNotice draft={draft} />
              <label>Type</label>
              <select value={form.recordType} onChange={(e) => setForm({ ...form, recordType: e.target.value })}>
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid grid-2">
                <div>
                  <label>Amount</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <FormActions onSubmit={addRecord} draft={draft} label="Add" />
            </div>
          )}

          {section("Income", income)}
          {section("Expenses", expenses)}
          {section("Capital gains / losses", capital)}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Documents tagged for tax</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Documents for this entity and financial year marked tax-relevant (possible or confirmed).
            </p>
            {documents.length === 0 ? (
              <p className="empty-state">None yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Tax relevance</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/documents/${d.id}`}>{d.originalFilename}</Link>
                      </td>
                      <td>{d.documentType || "—"}</td>
                      <td>{formatCurrency(d.amount)}</td>
                      <td>
                        <span className={`badge relevance-${d.taxRelevance}`}>{humanize(d.taxRelevance)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
