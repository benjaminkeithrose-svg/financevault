import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Entity, Person, SmsfMember, SmsfOverview, SmsfPensionView } from "../api/client.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { HelpLink } from "./HelpLink.js";
import { IconBin } from "./icons.js";
import { useDraft } from "../hooks/useDraft.js";
import { confirmThenDelete, formatCurrency, formatDate } from "../utils.js";

/**
 * Everything particular to a self-managed super fund, shown at the top of
 * its entity page: what needs attention, members and their contributions
 * against the caps, trustee and compliance details, property bought with an
 * LRBA loan, and pensions.
 */

const SOURCES: Record<string, string> = {
  EMPLOYER: "Employer (super guarantee and other employer amounts)",
  SALARY_SACRIFICE: "Salary sacrifice",
  PERSONAL_DEDUCTED: "Personal — claiming a tax deduction",
  PERSONAL: "Personal — after tax, no deduction",
  SPOUSE: "From a spouse",
  DOWNSIZER: "Downsizer (from selling the home)",
  OTHER_EXCLUDED: "Other, not counted to the caps (e.g. small business CGT)",
};

const KIND_LABEL = { CONCESSIONAL: "Concessional", NON_CONCESSIONAL: "Non-concessional", EXCLUDED: "Not counted" } as const;

const toIso = (d: string) => (d ? new Date(d).toISOString() : null);
const dateInput = (d?: string | null) => (d ? d.slice(0, 10) : "");
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function SmsfPanel({ fundId }: { fundId: string }) {
  const [year, setYear] = useState<string | undefined>(undefined);
  const [view, setView] = useState<SmsfOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.smsf
      .get(fundId, year)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, [fundId, year]);

  if (error) return <div className="message-box warning">{error}</div>;
  if (!view) return <p className="empty-state">Loading the fund…</p>;

  return (
    <>
      <SmsfSummary view={view} onYear={setYear} />
      <MembersCard view={view} onChange={load} />
      <PensionsCard view={view} onChange={load} />
      <PropertyCard view={view} />
      <TrusteeCard view={view} onChange={load} />
    </>
  );
}

// --- Summary: year, balance, things to look at, dates -------------------------

function SmsfSummary({ view, onYear }: { view: SmsfOverview; onYear: (y: string) => void }) {
  const lastJune = view.members.reduce((s, m) => {
    const prior = m.years.find((y) => y.fyLabel === priorYear(view.year));
    return s + (prior?.closingBalance ?? 0);
  }, 0);
  const upcoming = view.dates;
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          Self-managed super fund <HelpLink topic="smsf" />
        </h3>
        <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          Year
          <select value={view.year} onChange={(e) => onYear(e.target.value)} style={{ width: "auto" }}>
            {view.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="stat-tile">
          <div className="label">Members' balances, 30 June {priorYear(view.year).slice(0, 4)}</div>
          <div className="value">{lastJune ? formatCurrency(lastJune) : "—"}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Members</div>
          <div className="value">{view.members.filter((m) => m.isMember).length}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Cash in the fund's bank accounts</div>
          <div className="value">{formatCurrency(view.cash)}</div>
        </div>
      </div>
      {!view.rules.known && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          The caps for {view.year} aren't in Financial Vault yet, so last known year's are used. Check ato.gov.au.
        </p>
      )}
      {view.checks.length > 0 && (
        <div className="message-box warning" style={{ marginTop: 12 }}>
          <strong>To look at</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {view.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {upcoming.length > 0 && (
        <>
          <h3>Deadlines</h3>
          <ul className="plain-list date-list">
            {upcoming.map((d) => (
              <li key={d.key} style={{ flexDirection: "column", alignItems: "flex-start" }}>
                <span>
                  <strong>{formatDate(d.date)}</strong> — {d.title.replace(` — ${view.fund.name}`, "")}
                </span>
                {d.detail && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{d.detail}</span>}
              </li>
            ))}
          </ul>
          <p className="cap-explain">These are in the expiry calendar too, and in its calendar file.</p>
        </>
      )}
    </div>
  );
}

function priorYear(label: string): string {
  const start = Number(label.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

// --- Members and contributions --------------------------------------------------

function CapBar({ used, limit }: { used: number; limit: number }) {
  const share = limit > 0 ? Math.min(1, used / limit) : used > 0 ? 1 : 0;
  const over = used > limit;
  return (
    <div className="cap-bar" aria-hidden="true">
      <div className={over ? "cap-bar-fill over" : "cap-bar-fill"} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

const EMPTY_CONTRIBUTION = { personId: "", date: "", amount: "", source: "EMPLOYER", otherFund: "" };

function MembersCard({ view, onChange }: { view: SmsfOverview; onChange: () => void }) {
  const fundId = view.fund.id;
  const [mode, setMode] = useState<"none" | "contribution" | "balance" | "member">("none");
  const [form, setForm, draft] = useDraft(`smsf:${fundId}:contribution`, EMPTY_CONTRIBUTION);
  const [balance, setBalance] = useState({ personId: "", fyLabel: priorYear(view.year), closingBalance: "", taxFree: "", tsb: "" });
  const [people, setPeople] = useState<Person[]>([]);
  const [newMember, setNewMember] = useState({ personId: "", trustee: true });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.restored) setMode("contribution");
  }, []);
  useEffect(() => {
    if (mode === "member") api.people.list().then(setPeople);
  }, [mode]);

  const members = view.members;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setMode("none");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const addContribution = () =>
    run(async () => {
      if (!form.personId || !form.date || !form.amount) throw new Error("Choose the member, the date and the amount.");
      await api.smsf.addContribution(fundId, {
        personId: form.personId,
        date: toIso(form.date),
        amount: Number(form.amount),
        source: form.source,
        paidIntoOtherFund: form.otherFund || null,
      });
      draft.clear();
    });

  const saveBalance = () =>
    run(async () => {
      if (!balance.personId || balance.closingBalance === "") throw new Error("Choose the member and enter the balance.");
      await api.smsf.saveMemberYear(fundId, {
        personId: balance.personId,
        fyLabel: balance.fyLabel,
        closingBalance: Number(balance.closingBalance),
        taxFreeComponent: balance.taxFree ? Number(balance.taxFree) : null,
        totalSuperBalance: balance.tsb ? Number(balance.tsb) : null,
      });
    });

  const addMember = () =>
    run(async () => {
      if (!newMember.personId) throw new Error("Choose a person.");
      await api.smsf.addMember(fundId, newMember.personId, newMember.trustee);
    });

  const toggle = (m: typeof mode) => {
    setError(null);
    setMode(mode === m ? "none" : m);
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Members and contributions — {view.year}</h3>
      <div className="toolbar">
        <button className="btn" onClick={() => toggle("contribution")} disabled={members.length === 0}>
          Add a contribution
        </button>
        <button className="btn secondary" onClick={() => toggle("balance")} disabled={members.length === 0}>
          Record a 30 June balance
        </button>
        <button className="btn secondary" onClick={() => toggle("member")}>
          Add a member
        </button>
      </div>
      {error && <div className="message-box warning">{error}</div>}

      {mode === "contribution" && (
        <div className="sub-form">
          <DraftNotice draft={draft} />
          <div className="grid grid-2">
            <div>
              <label>Member</label>
              <MemberSelect members={members} value={form.personId} onChange={(personId) => setForm({ ...form, personId })} />
            </div>
            <div>
              <label>Date received</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label>Type</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {Object.entries(SOURCES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label>Paid into another fund? (leave empty if it went into this fund)</label>
          <input
            value={form.otherFund}
            onChange={(e) => setForm({ ...form, otherFund: e.target.value })}
            placeholder="e.g. AustralianSuper — caps count every fund together"
          />
          <FormActions onSubmit={addContribution} draft={draft} label="Save contribution" />
        </div>
      )}

      {mode === "balance" && (
        <div className="sub-form">
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
            From the fund's annual statements. The total across all their super decides carry-forward and bring-forward.
          </p>
          <div className="grid grid-2">
            <div>
              <label>Member</label>
              <MemberSelect members={members} value={balance.personId} onChange={(personId) => setBalance({ ...balance, personId })} />
            </div>
            <div>
              <label>Balance at 30 June of</label>
              <select value={balance.fyLabel} onChange={(e) => setBalance({ ...balance, fyLabel: e.target.value })}>
                {view.years.map((y) => (
                  <option key={y} value={y}>
                    30 June {Number(y.slice(0, 4)) + 1} ({y})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Balance in this fund</label>
              <input type="number" value={balance.closingBalance} onChange={(e) => setBalance({ ...balance, closingBalance: e.target.value })} />
            </div>
            <div>
              <label>Of which tax-free (optional)</label>
              <input type="number" value={balance.taxFree} onChange={(e) => setBalance({ ...balance, taxFree: e.target.value })} />
            </div>
          </div>
          <label>Total across all their super funds (only if they have others)</label>
          <input type="number" value={balance.tsb} onChange={(e) => setBalance({ ...balance, tsb: e.target.value })} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={saveBalance}>
              Save balance
            </button>
          </div>
        </div>
      )}

      {mode === "member" && (
        <div className="sub-form">
          <label>Person</label>
          <select value={newMember.personId} onChange={(e) => setNewMember({ ...newMember, personId: e.target.value })}>
            <option value="">— Select —</option>
            {people
              .filter((p) => !members.some((m) => m.personId === p.id && m.isMember))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <label className="tick-row">
            <input
              type="checkbox"
              checked={newMember.trustee}
              onChange={(e) => setNewMember({ ...newMember, trustee: e.target.checked })}
            />
            Also an individual trustee (leave unticked if the fund has a trustee company)
          </label>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={addMember}>
              Add member
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <p className="empty-state">No members yet. Add each member — up to six.</p>
      ) : (
        members.map((m) => <MemberBlock key={m.personId} m={m} view={view} onChange={onChange} />)
      )}
    </div>
  );
}

function MemberSelect({ members, value, onChange }: { members: SmsfMember[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {members.map((m) => (
        <option key={m.personId} value={m.personId}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function MemberBlock({ m, view, onChange }: { m: SmsfMember; view: SmsfOverview; onChange: () => void }) {
  const cc = m.concessional;
  const ncc = m.nonConcessional;
  const roles = [m.isTrustee && "trustee", m.isDirector && "director of the trustee company", !m.isMember && "no longer a member"].filter(Boolean);

  async function removeContribution(id: string) {
    if (await confirmThenDelete("Delete this contribution?", () => api.smsf.removeContribution(id))) onChange();
  }
  async function removeMember() {
    if (await confirmThenDelete(`Remove ${m.name} as a member of ${view.fund.name}?`, () => api.smsf.removeMember(view.fund.id, m.personId))) onChange();
  }

  return (
    <div className="member-block">
      <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <Link to={`/people/${m.personId}`}>
            <strong>{m.name}</strong>
          </Link>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {m.age !== null ? ` · ${m.age}` : " · add their date of birth"}
            {roles.length > 0 ? ` · ${roles.join(", ")}` : ""}
            {m.latestBalance ? ` · ${formatCurrency(m.latestBalance.closingBalance)} at 30 June ${Number(m.latestBalance.fyLabel.slice(0, 4)) + 1}` : ""}
          </span>
        </div>
        {m.isMember && m.years.length === 0 && m.contributions.length === 0 && (
          <button className="icon-btn danger" aria-label={`Remove ${m.name} as a member`} onClick={removeMember}>
            <IconBin />
          </button>
        )}
      </div>

      <div className="grid grid-2">
        <div>
          <div className="cap-label">
            <span>Concessional</span>
            <span>
              {formatCurrency(cc.used)} of {formatCurrency(cc.available)}
            </span>
          </div>
          <CapBar used={cc.used} limit={cc.available} />
          <div className={cc.remaining < 0 ? "cap-note over" : "cap-note"}>
            {cc.remaining < 0 ? `Over by ${formatCurrency(-cc.remaining)}` : `${formatCurrency(cc.remaining)} left`}
            {cc.carryForward > 0 ? ` · includes ${formatCurrency(cc.carryForward)} carried forward` : ""}
          </div>
        </div>
        <div>
          <div className="cap-label">
            <span>Non-concessional</span>
            <span>
              {formatCurrency(ncc.used)} of {formatCurrency(ncc.maxThisYear)}
            </span>
          </div>
          <CapBar used={ncc.used} limit={ncc.maxThisYear} />
          <div className={ncc.remaining < 0 ? "cap-note over" : "cap-note"}>
            {ncc.remaining < 0 ? `Over by ${formatCurrency(-ncc.remaining)}` : `${formatCurrency(ncc.remaining)} left`}
            {!ncc.bringForward && ncc.maxThisYear > ncc.annualCap ? ` · ${formatCurrency(ncc.annualCap)} a year, more by bringing forward` : ""}
          </div>
        </div>
      </div>
      {[...cc.notes, ...ncc.notes].map((n) => (
        <p key={n} className="cap-explain">
          {n}
        </p>
      ))}
      {m.transferBalance && (
        <p className={m.transferBalance.used > m.transferBalance.cap ? "cap-explain over" : "cap-explain"}>
          Pensions started with {formatCurrency(m.transferBalance.used)} — the transfer balance cap when their first began (
          {m.transferBalance.capYear}) was {formatCurrency(m.transferBalance.cap)}. Their personal cap is in myGov.
        </p>
      )}

      {m.contributions.length > 0 && (
        <ul className="plain-list">
          {m.contributions.map((c) => (
            <li key={c.id}>
              <span>
                {formatDate(c.date)} · {formatCurrency(c.amount)} · {SOURCES[c.source]?.split(" (")[0] ?? c.source}{" "}
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  ({KIND_LABEL[c.kind]}
                  {c.otherFund ? `, into ${c.otherFund}` : ""})
                </span>
              </span>
              <button className="icon-btn danger" aria-label="Delete contribution" onClick={() => removeContribution(c.id)}>
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Pensions --------------------------------------------------------------------

const EMPTY_PENSION = { personId: "", kind: "ACCOUNT_BASED", startDate: "", startBalance: "" };

function PensionsCard({ view, onChange }: { view: SmsfOverview; onChange: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm, draft] = useDraft(`smsf:${view.fund.id}:pension`, EMPTY_PENSION);
  const [error, setError] = useState<string | null>(null);
  const active = view.pensions.filter((p) => p.year.active);
  const share = view.pensionShare;

  async function start() {
    setError(null);
    try {
      if (!form.personId || !form.startDate || !form.startBalance) throw new Error("Choose the member, the start date and the starting balance.");
      await api.smsf.addPension(view.fund.id, {
        personId: form.personId,
        kind: form.kind,
        startDate: toIso(form.startDate),
        startBalance: Number(form.startBalance),
      });
      draft.clear();
      setShowForm(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Pensions — {view.year}</h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)} disabled={view.members.length === 0}>
          {showForm ? "Close" : "Start a pension"}
        </button>
      </div>
      {showForm && (
        <div className="sub-form">
          <DraftNotice draft={draft} />
          <div className="grid grid-2">
            <div>
              <label>Member</label>
              <MemberSelect members={view.members} value={form.personId} onChange={(personId) => setForm({ ...form, personId })} />
            </div>
            <div>
              <label>Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="ACCOUNT_BASED">Account-based (retirement)</option>
                <option value="TRANSITION_TO_RETIREMENT">Transition to retirement</option>
              </select>
            </div>
            <div>
              <label>Started</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label>Balance it started with</label>
              <input type="number" value={form.startBalance} onChange={(e) => setForm({ ...form, startBalance: e.target.value })} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={start} draft={draft} label="Start pension" />
        </div>
      )}

      {view.pensions.length === 0 ? (
        <p className="empty-state">No pensions. When a member retires, start one here to track the yearly minimum.</p>
      ) : active.length === 0 ? (
        <p className="empty-state">No pensions running in {view.year}.</p>
      ) : (
        active.map((p) => <PensionBlock key={p.id} p={p} year={view.year} onChange={onChange} />)
      )}

      {active.some((p) => p.year.retirementPhase) && (
        <>
          <h3>Tax-free share of fund income (estimate)</h3>
          {share.share === null ? (
            <p className="empty-state">Record each member's balance at 30 June {priorYear(view.year).slice(0, 4)} to estimate it.</p>
          ) : (
            <p style={{ margin: 0 }}>
              About <strong>{pct(share.share)}</strong> — {formatCurrency(share.pensionBalances)} supporting retirement pensions out of{" "}
              {formatCurrency(share.fundBalance)} in the fund.{" "}
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {share.share < 1
                  ? "With both pension and accumulation balances, the exact figure comes from an actuary's certificate — your accountant arranges it."
                  : "If every balance supported a retirement pension all year, no actuary's certificate is needed."}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PensionBlock({ p, year, onChange }: { p: SmsfPensionView; year: string; onChange: () => void }) {
  const [mode, setMode] = useState<"none" | "payment" | "balance" | "end">("none");
  const [payment, setPayment] = useState({ date: "", amount: "" });
  const [opening, setOpening] = useState(p.openingBalance?.toString() ?? "");
  const [endDate, setEndDate] = useState(dateInput(p.endDate));
  const [error, setError] = useState<string | null>(null);
  const y = p.year;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setMode("none");
      setPayment({ date: "", amount: "" });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removePayment(id: string) {
    if (await confirmThenDelete("Delete this payment?", () => api.smsf.removePensionPayment(id))) onChange();
  }
  async function removePension() {
    if (await confirmThenDelete(`Delete ${p.personName}'s pension record?`, () => api.smsf.removePension(p.id))) onChange();
  }

  const kindLabel = p.kind === "ACCOUNT_BASED" ? "Account-based pension" : y.retirementPhase ? "Transition to retirement (now retirement phase)" : "Transition to retirement";
  return (
    <div className="member-block">
      <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <strong>{p.personName}</strong>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {" "}
            · {kindLabel} · started {formatDate(p.startDate)} with {formatCurrency(p.startBalance)}
            {p.endDate ? ` · ended ${formatDate(p.endDate)}` : ""}
          </span>
        </div>
        {p.paymentsThisYear.length === 0 && (
          <button className="icon-btn danger" aria-label={`Delete ${p.personName}'s pension`} onClick={removePension}>
            <IconBin />
          </button>
        )}
      </div>

      {y.minimum !== null ? (
        <>
          <div className="cap-label">
            <span>
              Paid {formatCurrency(p.paidThisYear)} of the {formatCurrency(y.minimum)} minimum
              {y.rate !== null ? ` (${pct(y.rate)} of ${formatCurrency(y.basis)})` : ""}
            </span>
            <span>{p.stillToPay ? `${formatCurrency(p.stillToPay)} to pay by 30 June` : "Minimum met"}</span>
          </div>
          <CapBar used={p.paidThisYear} limit={Math.max(y.minimum, 1)} />
          {y.maximum !== null && (
            <div className={p.overMaximum ? "cap-note over" : "cap-note"}>
              At most {formatCurrency(y.maximum)} this year (10% for a transition to retirement pension).
            </div>
          )}
        </>
      ) : null}
      {y.notes.map((n) => (
        <p key={n} className="cap-explain">
          {n}
        </p>
      ))}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn secondary" onClick={() => setMode(mode === "payment" ? "none" : "payment")}>
          Add a payment
        </button>
        <button className="btn secondary" onClick={() => setMode(mode === "balance" ? "none" : "balance")}>
          1 July balance
        </button>
        <button className="btn secondary" onClick={() => setMode(mode === "end" ? "none" : "end")}>
          {p.endDate ? "Change end date" : "It has stopped"}
        </button>
      </div>
      {error && <div className="message-box warning">{error}</div>}
      {mode === "payment" && (
        <div className="grid grid-3 sub-form">
          <div>
            <label>Paid on</label>
            <input type="date" value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} />
          </div>
          <div>
            <label>Amount</label>
            <input type="number" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button
              className="btn"
              onClick={() =>
                run(async () => {
                  if (!payment.date || !payment.amount) throw new Error("Enter the date and the amount.");
                  await api.smsf.addPensionPayment(p.id, { date: toIso(payment.date), amount: Number(payment.amount) });
                })
              }
            >
              Save payment
            </button>
          </div>
        </div>
      )}
      {mode === "balance" && (
        <div className="grid grid-2 sub-form">
          <div>
            <label>Pension balance on 1 July {year.slice(0, 4)}</label>
            <input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button
              className="btn"
              onClick={() =>
                run(async () => {
                  if (opening === "") throw new Error("Enter the balance.");
                  await api.smsf.savePensionBalance(p.id, year, Number(opening));
                })
              }
            >
              Save balance
            </button>
          </div>
        </div>
      )}
      {mode === "end" && (
        <div className="grid grid-2 sub-form">
          <div>
            <label>Stopped on (leave empty if it's still running)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn" onClick={() => run(() => api.smsf.updatePension(p.id, { endDate: toIso(endDate) }))}>
              Save
            </button>
          </div>
        </div>
      )}
      {p.paymentsThisYear.length > 0 && (
        <ul className="plain-list">
          {p.paymentsThisYear.map((x) => (
            <li key={x.id}>
              <span>
                {formatDate(x.date)} · {formatCurrency(x.amount)}
              </span>
              <button className="icon-btn danger" aria-label="Delete payment" onClick={() => removePayment(x.id)}>
                <IconBin />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Property bought with an LRBA loan ---------------------------------------------

function PropertyCard({ view }: { view: SmsfOverview }) {
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Property and borrowing (LRBA)</h3>
        <Link className="btn secondary" to={`/loans?newLrbaFor=${view.fund.id}`}>
          Add an LRBA loan
        </Link>
      </div>
      {view.lrba.length === 0 ? (
        <p className="empty-state">
          No limited recourse loans. If the fund borrowed to buy a property, add the property owned by {view.fund.name}, the holding
          trust under People & entities, then the loan.
        </p>
      ) : (
        view.lrba.map((l) => (
          <div className="member-block" key={l.id}>
            <Link to={`/liabilities/${l.id}`}>
              <strong>{l.name}</strong>
            </Link>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {l.lender ? ` · ${l.lender}` : ""}
              {l.interestRate ? ` · ${l.interestRate}%` : ""}
            </span>
            <table className="kv-table" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Property</td>
                  <td>{l.property ? <Link to={l.property.route}>{l.property.name}</Link> : <span className="cap-note over">Not linked — set the security on the loan</span>}</td>
                </tr>
                <tr>
                  <td>Held by</td>
                  <td>
                    {l.holdingTrust ? (
                      <Link to={`/entities/${l.holdingTrust.id}`}>{l.holdingTrust.name}</Link>
                    ) : (
                      <span className="cap-note over">No holding trust recorded</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Owing / value</td>
                  <td>
                    {formatCurrency(l.balance)} / {formatCurrency(l.property?.value)}
                    {l.lvr !== null ? ` · LVR ${pct(l.lvr)}` : ""}
                  </td>
                </tr>
                <tr>
                  <td>Rent / repayments a year</td>
                  <td>
                    {l.annualRent !== null ? formatCurrency(l.annualRent) : `No rent recorded (${l.property?.rentSource ?? "link the property"})`} /{" "}
                    {l.annualRepayments !== null ? formatCurrency(l.annualRepayments) : "no repayment recorded"}
                    {l.rentCover !== null && (
                      <span className={l.rentCover < 1 ? "cap-note over" : ""}>
                        {" "}
                        · rent covers {Math.round(l.rentCover * 100)}% of repayments
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

// --- Trustee and compliance ---------------------------------------------------------

function TrusteeCard({ view, onChange }: { view: SmsfOverview; onChange: () => void }) {
  const d = view.details;
  const initial = {
    trusteeType: (d?.trusteeType ?? "") as string,
    corporateTrusteeId: d?.corporateTrusteeId ?? "",
    auditorName: d?.auditorName ?? "",
    auditorNumber: d?.auditorNumber ?? "",
    lodgedBy: (d?.lodgedBy ?? "TAX_AGENT") as string,
    lastReturnLodged: d?.lastReturnLodged ?? "",
    returnDueDate: dateInput(d?.returnDueDate),
    strategyReviewedOn: dateInput(d?.strategyReviewedOn),
  };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [companies, setCompanies] = useState<Entity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) api.entities.list().then((all) => setCompanies(all.filter((e) => e.entityType === "COMPANY")));
  }, [editing]);

  async function save() {
    setError(null);
    try {
      await api.smsf.saveDetails(view.fund.id, {
        trusteeType: form.trusteeType || null,
        corporateTrusteeId: form.trusteeType === "CORPORATE" ? form.corporateTrusteeId || null : null,
        auditorName: form.auditorName || null,
        auditorNumber: form.auditorNumber || null,
        lodgedBy: form.lodgedBy || null,
        lastReturnLodged: form.lastReturnLodged || null,
        returnDueDate: toIso(form.returnDueDate),
        strategyReviewedOn: toIso(form.strategyReviewedOn),
      });
      setEditing(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // The years a return could have been done for.
  const lodgedChoices = view.years.filter((y) => y < view.years[0]);

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Trustee, auditor and deadlines</h3>
        <button
          className="btn secondary"
          onClick={() => {
            setForm(initial);
            setEditing((v) => !v);
          }}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="sub-form">
          <div className="grid grid-2">
            <div>
              <label>Trustee</label>
              <select value={form.trusteeType} onChange={(e) => setForm({ ...form, trusteeType: e.target.value })}>
                <option value="">— Not recorded —</option>
                <option value="INDIVIDUAL">Individual trustees (the members)</option>
                <option value="CORPORATE">A trustee company</option>
              </select>
            </div>
            {form.trusteeType === "CORPORATE" && (
              <div>
                <label>Trustee company</label>
                <select value={form.corporateTrusteeId} onChange={(e) => setForm({ ...form, corporateTrusteeId: e.target.value })}>
                  <option value="">— Select —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {companies.length === 0 && <p className="cap-explain">Add the company under People & entities first.</p>}
              </div>
            )}
            <div>
              <label>Auditor</label>
              <input value={form.auditorName} onChange={(e) => setForm({ ...form, auditorName: e.target.value })} />
            </div>
            <div>
              <label>Auditor number (SAN)</label>
              <input value={form.auditorNumber} onChange={(e) => setForm({ ...form, auditorNumber: e.target.value })} />
            </div>
            <div>
              <label>Annual return lodged by</label>
              <select value={form.lodgedBy} onChange={(e) => setForm({ ...form, lodgedBy: e.target.value })}>
                <option value="TAX_AGENT">A tax agent or accountant</option>
                <option value="SELF">The trustees themselves</option>
              </select>
            </div>
            <div>
              <label>Latest annual return lodged</label>
              <select value={form.lastReturnLodged} onChange={(e) => setForm({ ...form, lastReturnLodged: e.target.value })}>
                <option value="">— None recorded —</option>
                {lodgedChoices.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Next return due (only if your agent gave a different date)</label>
              <input type="date" value={form.returnDueDate} onChange={(e) => setForm({ ...form, returnDueDate: e.target.value })} />
            </div>
            <div>
              <label>Investment strategy last reviewed</label>
              <input type="date" value={form.strategyReviewedOn} onChange={(e) => setForm({ ...form, strategyReviewedOn: e.target.value })} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <table className="kv-table" style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td>Trustee</td>
              <td>
                {d?.trusteeType === "CORPORATE" ? (
                  d.corporateTrustee ? (
                    <Link to={`/entities/${d.corporateTrustee.id}`}>{d.corporateTrustee.name}</Link>
                  ) : (
                    "A trustee company (not chosen)"
                  )
                ) : d?.trusteeType === "INDIVIDUAL" ? (
                  view.members.filter((m) => m.isTrustee).map((m) => m.name).join(", ") || "Individual trustees (none recorded)"
                ) : (
                  "—"
                )}
              </td>
            </tr>
            <tr>
              <td>Auditor</td>
              <td>{d?.auditorName ? `${d.auditorName}${d.auditorNumber ? ` (SAN ${d.auditorNumber})` : ""}` : "—"}</td>
            </tr>
            <tr>
              <td>Annual returns</td>
              <td>
                {d?.lastReturnLodged ? `Lodged up to ${d.lastReturnLodged}` : "None recorded as lodged"} · next is {view.nextReturnYear}
              </td>
            </tr>
            <tr>
              <td>Investment strategy</td>
              <td>{d?.strategyReviewedOn ? `Reviewed ${formatDate(d.strategyReviewedOn)}` : "No review recorded"}</td>
            </tr>
          </tbody>
        </table>
      )}

    </div>
  );
}
