import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, BusinessUseSchedule, VehicleLogbook } from "../api/client.js";
import { recordsChanged } from "../features.js";
import { confirmThenDelete, financialYearLabelForToday, formatDate } from "../utils.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";

const EMPTY = { startDate: "", endDate: "", startOdometer: "", endOdometer: "", totalKm: "", businessKm: "", notes: "" };

/** The financial year before this one — the one being done at tax time. */
export function lastFy(): string {
  const now = financialYearLabelForToday();
  const start = Number(now.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

/**
 * A car's business use: its logbooks (12 continuous weeks, good for five
 * years) and a link to each year's business use schedule for tax time.
 */
export function BusinessUseCard({ assetId }: { assetId: string }) {
  const [logbooks, setLogbooks] = useState<VehicleLogbook[] | null>(null);
  const [info, setInfo] = useState<BusinessUseSchedule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api.vehicleBusiness.logbooks(assetId).then(setLogbooks).catch(() => setLogbooks([]));
    api.vehicleBusiness.schedule(assetId, lastFy()).then(setInfo).catch(() => setInfo(null));
  }
  useEffect(load, [assetId]);

  async function add() {
    setError(null);
    if (!form.startDate || !form.endDate) return setError("Enter the logbook's first and last day.");
    if (!form.businessKm) return setError("Enter the business kilometres.");
    setSaving(true);
    try {
      let documentId: string | null = null;
      if (file) {
        const { document } = await api.documents.upload(file);
        documentId = document.id;
        recordsChanged();
      }
      await api.vehicleBusiness.addLogbook(assetId, {
        startDate: form.startDate,
        endDate: form.endDate,
        startOdometer: num(form.startOdometer),
        endOdometer: num(form.endOdometer),
        totalKm: num(form.totalKm),
        businessKm: Number(form.businessKm),
        documentId,
        notes: form.notes.trim() || null,
      });
      setForm(EMPTY);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(l: VehicleLogbook) {
    if (await confirmThenDelete(`Delete the logbook from ${formatDate(l.startDate)}? Its scan stays in Documents.`, () => api.vehicleBusiness.removeLogbook(l.id))) {
      load();
    }
  }

  if (logbooks === null) return null;
  const superFund = info?.treatment === "SUPER_FUND";
  const thisFy = financialYearLabelForToday();
  const years = [lastFy(), thisFy];
  const total = form.startOdometer && form.endOdometer ? Number(form.endOdometer) - Number(form.startOdometer) : num(form.totalKm);
  const share = total && form.businessKm ? (Number(form.businessKm) / total) * 100 : null;

  return (
    <div className="card" id="business-use">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Business use <HelpLink topic="vehicle-business" />
        </h3>
        {!superFund && (
          <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Add a logbook"}
          </button>
        )}
      </div>
      {info && (
        <p className="cap-explain">
          Owned by {info.owner.name}: <strong>{info.treatmentTitle.toLowerCase()}</strong>. {info.treatmentExplain}
        </p>
      )}

      {showForm && (
        <div className="sub-form">
          <p className="cap-explain" style={{ marginTop: 0 }}>
            Keep the logbook for at least 12 weeks in a row that are typical of the year: each trip's date, odometer at the
            start and end, kilometres and why. It's good for this year and the next four.
          </p>
          <div className="grid grid-2">
            <div>
              <label htmlFor="lb-start">First day</label>
              <input id="lb-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lb-end">Last day</label>
              <input id="lb-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lb-odo-start">Odometer at the start</label>
              <input id="lb-odo-start" type="number" inputMode="numeric" value={form.startOdometer} onChange={(e) => setForm({ ...form, startOdometer: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lb-odo-end">Odometer at the end</label>
              <input id="lb-odo-end" type="number" inputMode="numeric" value={form.endOdometer} onChange={(e) => setForm({ ...form, endOdometer: e.target.value })} />
            </div>
            {!(form.startOdometer && form.endOdometer) && (
              <div>
                <label htmlFor="lb-total">Total kilometres (if no odometer readings)</label>
                <input id="lb-total" type="number" inputMode="numeric" value={form.totalKm} onChange={(e) => setForm({ ...form, totalKm: e.target.value })} />
              </div>
            )}
            <div>
              <label htmlFor="lb-business">Business kilometres</label>
              <input id="lb-business" type="number" inputMode="numeric" value={form.businessKm} onChange={(e) => setForm({ ...form, businessKm: e.target.value })} />
            </div>
          </div>
          {share !== null && Number.isFinite(share) && (
            <p className="cap-explain">
              Business use: <strong>{pct(share)}</strong> of {total?.toLocaleString("en-AU")} km.
            </p>
          )}
          <label htmlFor="lb-file">The logbook (a scan or photo, optional)</label>
          <input id="lb-file" ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <label htmlFor="lb-notes">Notes</label>
          <input id="lb-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Kept in the glovebox book" />
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn" disabled={saving} onClick={add}>
              {saving ? "Saving…" : "Add logbook"}
            </button>
          </div>
        </div>
      )}

      {superFund ? null : logbooks.length === 0 ? (
        !showForm && (
          <p className="empty-state">
            No logbook recorded. Used for work or a business? Add its logbook here — or open a year's schedule and enter the
            business share yourself.
          </p>
        )
      ) : (
        <ul className="plain-list" style={{ marginTop: 8 }}>
          {logbooks.map((l) => (
            <li key={l.id} style={{ justifyContent: "space-between", gap: 8 }}>
              <div>
                <strong>
                  {formatDate(l.startDate)} – {formatDate(l.endDate)}
                </strong>
                <div className="cap-explain" style={{ margin: 0 }}>
                  {pct((l.businessKm / l.totalKm) * 100)} business · {l.businessKm.toLocaleString("en-AU")} of {l.totalKm.toLocaleString("en-AU")} km
                  {l.document && (
                    <>
                      {" · "}
                      <Link to={`/documents/${l.document.id}`}>{l.document.originalFilename}</Link>
                    </>
                  )}
                </div>
              </div>
              <button className="icon-btn danger" aria-label={`Delete the logbook from ${formatDate(l.startDate)}`} onClick={() => remove(l)}>
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!superFund && (
        <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
          {years.map((fy) => (
            <Link key={fy} className="btn secondary" to={`/assets/${assetId}/business-use/${fy}`}>
              {fy} schedule
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
