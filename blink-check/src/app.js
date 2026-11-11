/* Blink Check pages: five steps, saved in this browser, charts drawn here (no libraries). */
(function () {
  "use strict";
  const E = window.BlinkEngine;
  const D = E.DEFAULT_ASSUMPTIONS;
  // The page as it arrived, before anything is drawn — for "Download a copy".
  const PRISTINE = "<!doctype html>\n" + document.documentElement.outerHTML;
  const STORE = "blink-check-v1";
  const STANDALONE = (() => {
    try {
      return window.self === window.top;
    } catch (e) {
      return false;
    }
  })();
  const PAGES = [
    ["you", "You"],
    ["own", "What you own"],
    ["plans", "Plans"],
    ["check", "Blink check"],
    ["assume", "Assumptions"],
  ];
  const BASE_NAME = "No change";
  const SERIES = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)"];
  const BIN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

  const FLAG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';

  // ---------------------------------------------------------------- words explained

  const HELP = {
    offset: ["Offset account", "A savings account linked to a loan. Its balance is taken off the loan before interest is charged, so $60,000 in the offset of a $420,000 loan means interest on $360,000. Same effect as paying the loan down — but you can take the money out again."],
    pi: ["Principal and interest (P&I)", "Repayments cover the interest and part of the loan itself, so the loan shrinks to nothing by the end of the term."],
    io: ["Interest only (IO)", "Repayments cover only the interest for a set number of years — the loan doesn't shrink. Common for investment loans to keep cash flow up. Repayments jump when the interest-only years end."],
    equity: ["Equity", "What a property is worth less what's owed on it. Lenders will usually lend against it up to 80% of the value in total — that's how a deposit is 'borrowed from equity'."],
    lvr: ["LVR (loan to value ratio)", "The loan as a share of the property's value. 80% LVR on a $700,000 property is a $560,000 loan. Over 80% usually means lenders mortgage insurance; commercial lenders usually stop at 65–70%."],
    yield: ["Rental yield", "A year's rent as a share of the price. Gross yield is before costs; net yield is after the owner's costs. $600 a week on a $700,000 property is a 4.5% gross yield."],
    caprate: ["Cap rate (capitalisation rate)", "The commercial word for net yield: a year's net rent (after the owner's costs) divided by the price. An $800,000 property at a 6.5% cap rate earns about $52,000 a year. A higher cap rate means more income per dollar, but often more risk or slower growth."],
    netlease: ["Net lease and outgoings", "Outgoings are a property's running costs — council and water rates, insurance, strata, maintenance. In most commercial leases the tenant pays most of them on top of the rent (a net lease). Residential owners pay their own."],
    wale: ["WALE (weighted average lease expiry)", "How many years, on average, the tenants are locked in for. A longer WALE is safer — the income is contracted. Worth asking about for any commercial property."],
    vacancy: ["Weeks empty", "Time with no tenant. Residential is often a couple of weeks a year between tenants. Commercial can sit empty for six to twelve months — keep a cash buffer."],
    negativeGearing: ["Negative gearing", "When a rental costs more than it earns (interest, running costs and write-offs), the loss is taken off your other income, so you pay less tax. You still lose money — the tax back only softens it. Positively geared means it earns more than it costs, and that extra is taxed."],
    depreciation: ["Tax write-offs (depreciation)", "Owners can claim the building's wear: 2.5% a year of the construction cost for buildings started after September 1987. Fittings (carpets, blinds, appliances) can be claimed too, but for residential only in new or near-new properties. A quantity surveyor's report gives the exact figures; this tool uses a cautious estimate unless you enter one."],
    duty: ["Stamp duty", "The state's tax on buying property, paid at settlement. Worked out here at NSW rates (premium duty for residential over $3.87m); for other states enter a percentage under Assumptions."],
    landTax: ["Land tax", "A yearly NSW tax on investment land once an owner's total land value passes $1,075,000. Your home is exempt. Worked out here per person, on the land value share of each property."],
    cgt: ["Capital gains tax", "Tax on the profit when an investment is sold. Held over a year, only half the gain is added to your income. Your home is exempt."],
    serviceability: ["Borrowing check (serviceability)", "Lenders test whether your income covers every repayment at about 3% above the actual rate, counting only part of the rent (about 80% for residential) and about 3.8% of your credit card limits each month — even if the cards are paid off. This is a rough version of that test."],
    debtRecycling: ["Debt recycling", "Paying the home loan down with cash (often from the offset), then borrowing the same amount back as a separate loan split to invest. The total owed doesn't change, but the interest on the new split is tax-deductible because it's used to invest. Talk to your accountant before doing it — it has to be set up correctly."],
    smsf: ["SMSF", "A self-managed super fund. It can buy property, but the fund and the property must stay separate from you: no living in it, and no renting residential property to family. Commercial property can be leased to your own business at market rent."],
    lrba: ["SMSF loan (LRBA)", "A limited recourse borrowing arrangement — the only way an SMSF can borrow to buy property. Lenders usually lend 60–70%, at higher rates, and the fund needs cash left over afterwards."],
    franking: ["Franking credits", "Tax an Australian company has already paid on its profits, passed on with its dividends. It counts towards your tax, so franked dividends are taxed less."],
    costBase: ["What you paid (cost base)", "The price plus stamp duty and buying costs. Used to work out capital gains tax if it's sold."],
    yardstick: ["No change", "The plan every other plan is measured against: you buy nothing new and keep what you have. For a working household, savings and every spare dollar go into the home loan offset — that's the safe, tax-free return any idea has to beat. For a retiree, you stay as you are (keep renting, or stay in your home). If a plan doesn't end up ahead of No change, it isn't worth the risk and effort."],
    spare: ["Where spare money goes", "When the year leaves money over, this decides where it goes: the home loan offset (usually best — that interest isn't tax-deductible), a positive property's own loan offset, the dearest loan, or savings. When a plan needs money, it comes from savings first, then the offsets."],
    topUp: ["Top-ups", "What the investments cost you each year after tax — rent and dividends, less running costs, loan repayments and the tax effect. This is the money that has to come out of your pay or savings."],
    worstYear: ["Worst year", "The year the investments need the most from you, usually when interest rates peak. Check you could carry this."],
    moneyChain: ["Where the money comes from", "How each purchase is paid for: the loan on the new property, any borrowing against equity in what you own, and your own cash — against the price, stamp duty and buying costs."],
    rateCycle: ["The rate cycle", "Instead of guessing, rates rise and fall the way the Reserve Bank's cash rate did since 2000 (the 2008 peak, the 2020 low and the 2022–23 rises), added to today's rates. Year 1 is always today's rate."],
    netWorth: ["Net worth", "Everything you own (property, shares, savings, offsets, super) less everything you owe. 'Outside super' leaves super out, because you can't use it until retirement."],
    agePension: ["Age Pension", "The government pension from age 67, means-tested. It's the lower of two tests: the assets test (savings, super, shares, investment property, car and contents — but not your home) and the income test (pay, rent, and 'deemed' income on savings, super and shares). Blink Check estimates it each year; Services Australia works out the real amount."],
    deeming: ["Deeming", "For the Age Pension income test, savings, super and shares are assumed to earn a set rate (about 0.75% on the first $64,200 for a single, 2.75% above), whatever they really earn."],
    superPension: ["Super pension (account-based)", "Once retired, super can pay you a regular income. Earnings in the pension are tax-free, and payments are tax-free from 60. There's a minimum you must take each year — 4% of the balance under 65, 5% at 65–74, 6% at 75–79, 7% at 80–84, 9% at 85–89, 11% at 90–94 and 14% from 95. You can take more, including lump sums (for example to buy a home)."],
    homeEquityAccess: ["Home Equity Access Scheme", "A government loan for people of Age Pension age, secured on their home, paid as a fortnightly income or small lump sums. It's repaid when the home is sold. A fallback if money runs short — not something to plan on."],
    lastUntil: ["How long the money must last", "Blink Check runs to age 100 and flags a plan in red if savings and super run out before the age you pick. About 1 in 4 women aged 65 today will live past 95."],
    living: ["Living costs", "What the household spends each month on everything except loan repayments — food, bills, school, cars, holidays. The tool works out the loan repayments itself."],
  };

  // ---------------------------------------------------------------- state

  const uid = () => Math.random().toString(36).slice(2, 9);

  function example() {
    return {
      example: true,
      people: [
        { id: "p1", name: "Alex", salary: 170000, super: 160000 },
        { id: "p2", name: "Sam", salary: 125000, super: 110000 },
      ],
      livingMonthly: 5500,
      cardLimits: 15000,
      otherRepayMonthly: 600,
      otherRepayYears: 3,
      goal: "GROWTH",
      risk: "MIDDLE",
      cash: 20000,
      home: { has: true, value: 900000, loan: { balance: 420000, rate: 5.8, type: "PI", ioYears: 0, yearsLeft: 25, offset: 60000 } },
      rentals: [
        {
          id: "r1", name: "Rental 1", kind: "RES", value: 650000, costBase: 520000, rentWeekly: 600, costPct: 25, writeOff: "BUILDING", owners: [50, 50],
          loan: { balance: 470000, rate: 6.2, type: "IO", ioYears: 3, yearsLeft: 28, offset: 0 },
        },
      ],
      shares: { value: 0, costBase: 0 },
      smsf: { has: false, open: false },
      assumptions: {},
      scenarios: [
        { id: "base", name: "Cash stays in the offset", baseline: true, spare: "HOME_OFFSET", steps: [] },
        {
          id: "s1", name: "Residential now, another in year 8", spare: "HOME_OFFSET",
          steps: [
            { id: uid(), type: "BUY", year: 1, kind: "RES", name: "Second rental", price: 700000, rentWeekly: 600, funding: "EQUITY", loanType: "IO", ioYears: 5, writeOff: "BUILDING" },
            { id: uid(), type: "BUY", year: 8, kind: "RES", name: "Third rental", price: 800000, rentWeekly: 680, funding: "EQUITY", loanType: "IO", ioYears: 5, writeOff: "BUILDING" },
          ],
        },
        {
          id: "s2", name: "Commercial now, sell Rental 1 in year 10", spare: "HOME_OFFSET",
          steps: [
            { id: uid(), type: "BUY", year: 1, kind: "COM", name: "Commercial unit", price: 800000, rentWeekly: 1000, funding: "EQUITY", loanType: "PI", writeOff: "BUILDING" },
            { id: uid(), type: "SELL", year: 10, target: "r1", then: "PAY_DEBT" },
          ],
        },
        { id: "s3", name: "Debt recycle $80k into shares", spare: "HOME_OFFSET", steps: [{ id: uid(), type: "SHARES", year: 1, amount: 80000, funding: "RECYCLE", loanType: "IO" }] },
      ],
    };
  }

  // A made-up retiree: sold her home, money in super and savings, renting, thinking about buying.
  function exampleRetired() {
    return {
      example: true,
      stage: "RETIRED",
      people: [{ id: "p1", name: "Pat", age: 72, salary: 0, super: 750000 }],
      livingMonthly: 4000,
      cardLimits: 0,
      otherRepayMonthly: 0,
      otherRepayYears: 0,
      rentWeekly: 550,
      superDrawMode: "MIN",
      superDrawYearly: 0,
      goal: "GROWTH",
      risk: "CAREFUL",
      cash: 450000,
      home: { has: false, value: 0, loan: { balance: 0, rate: D.homeRate, type: "PI", ioYears: 0, yearsLeft: 25, offset: 0 } },
      rentals: [],
      shares: { value: 0, costBase: 0 },
      smsf: { has: false, open: false },
      assumptions: {},
      notes: "Should I buy a home, and how much can I spend so the money lasts?",
      scenarios: [
        { id: "base", name: "Keep renting", baseline: true, spare: "HOME_OFFSET", steps: [] },
        { id: "s1", name: "Buy a $900k home", spare: "HOME_OFFSET", steps: [{ id: uid(), type: "HOME", year: 1, price: 900000, name: "Home" }] },
        { id: "s2", name: "Buy a $650k unit", spare: "HOME_OFFSET", steps: [{ id: uid(), type: "HOME", year: 1, price: 650000, name: "Unit" }] },
      ],
    };
  }

  function blank() {
    return {
      example: false,
      people: [{ id: "p1", name: "", salary: 0, super: 0 }],
      livingMonthly: 0,
      cardLimits: 0,
      otherRepayMonthly: 0,
      otherRepayYears: 0,
      goal: "GROWTH",
      risk: "MIDDLE",
      cash: 0,
      home: { has: true, value: 0, loan: { balance: 0, rate: D.homeRate, type: "PI", ioYears: 0, yearsLeft: 25, offset: 0 } },
      rentals: [],
      shares: { value: 0, costBase: 0 },
      smsf: { has: false, open: false },
      assumptions: {},
      scenarios: [
        { id: "base", name: "Cash stays in the offset", baseline: true, spare: "HOME_OFFSET", steps: [] },
        { id: "s1", name: "Plan 1", spare: "HOME_OFFSET", steps: [] },
      ],
    };
  }

  // Figures saved inside this file (by "Save a copy"), if any.
  function embedded() {
    try {
      const saved = JSON.parse(document.getElementById("saved-figures").textContent || "null");
      if (saved && saved.people) return saved;
    } catch (e) {
      /* none */
    }
    return null;
  }
  const FILE = embedded();
  const FILE_ID = (FILE && FILE.fileId) || "blank";
  const storeKey = () => STORE + ":" + FILE_ID;

  // The file's figures, unless this browser has newer changes made to this same file.
  function load() {
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(storeKey()) || "null");
    } catch (e) {
      /* storage unavailable */
    }
    if (local && local.people && (!FILE || (local.updatedAt || 0) > (FILE.savedAt || 0))) return local;
    if (FILE) return JSON.parse(JSON.stringify(FILE));
    return example();
  }

  let state = load();
  const ui = { fullMain: 1, fullCompare: { base: true }, fullShow: { nw: true, debt: true, income: true, cash: true }, atYear: 0, openHelp: {}, page: "you", plan: 1, metric: "nw", hidden: {}, chainPlan: 1, tablePlan: 1, confirm: null, panel: null, message: "" };
  let results = null;

  function save() {
    results = null;
    try {
      localStorage.setItem(storeKey(), JSON.stringify(state));
    } catch (e) {
      /* fine — figures just won't be remembered in this browser */
    }
  }
  const unsaved = () => (state.updatedAt || 0) > (state.savedAt || 0);

  const A = (k) => (state.assumptions[k] ?? D[k]);
  const retired = () => state.stage === "RETIRED";
  const youngestAge = () => Math.min(...state.people.map((p) => +p.age || 67));
  const horizon = () => (retired() ? Math.max(10, Math.min(40, 100 - youngestAge() + 1)) : Math.max(5, Math.min(30, Number(A("horizon")) || 20)));
  const plans = () => state.scenarios.filter((s) => !s.baseline);

  function compute() {
    if (!results) results = E.runAll(state);
    return results;
  }

  // ---------------------------------------------------------------- formatting

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => (n === null || n === undefined || isNaN(n) ? "—" : (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-AU"));
  const signed = (n) => (n > 0 ? "+" : "") + money(n);
  const compact = (n) => {
    const a = Math.abs(n);
    const s = n < 0 ? "−$" : "$";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "m";
    if (a >= 1e3) return s + Math.round(a / 1e3) + "k";
    return s + Math.round(a);
  };
  const pctText = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString() + "%";
  const yearLabel = (y) => `Year ${y}`;
  const weekly = (n) => money(n / 52) + " a week";

  function getPath(path) {
    return path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), state);
  }
  function setPath(path, value) {
    const keys = path.split(".");
    let o = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] === null || o[keys[i]] === undefined) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }
  const valueOf = (path) => {
    const v = getPath(path);
    if (v === undefined && path.startsWith("assumptions.")) return D[path.slice(12)];
    return v;
  };

  // ---------------------------------------------------------------- fields

  const fid = (path) => "f-" + path.replace(/\./g, "-");
  function shown(kind, v) {
    if (v === null || v === undefined || v === "") return "";
    if (kind === "money") return money(v);
    return String(v);
  }
  function helpButton(key, id) {
    if (!key || !HELP[key]) return "";
    return `<button type="button" class="info" data-help="${esc(id)}" aria-expanded="${!!ui.openHelp[id]}" aria-label="What's ${esc(HELP[key][0])}?" title="What's this?">?</button>`;
  }
  function helpPop(key, id) {
    if (!key || !HELP[key] || !ui.openHelp[id]) return "";
    return `<div class="help-pop"><b>${esc(HELP[key][0])}.</b> ${esc(HELP[key][1])} <button type="button" class="btn quiet small" data-go="help">More in Help</button></div>`;
  }
  const labelRow = (id, label, help) => `<div class="label-row"><label for="${id}">${esc(label)}</label>${helpButton(help, id)}</div>`;

  function field(kind, path, label, opts = {}) {
    const v = valueOf(path);
    const id = fid(path);
    return `<div class="field"${opts.wide ? ' style="grid-column: 1 / -1"' : ""}>
      ${labelRow(id, label, opts.help)}
      <input type="text" id="${id}" data-path="${path}" data-kind="${kind}" inputmode="${kind === "text" ? "text" : "decimal"}" autocomplete="off"
        value="${esc(shown(kind, v))}" placeholder="${esc(opts.placeholder || "")}">
      ${opts.hint ? `<span class="hint">${opts.hint}</span>` : ""}${helpPop(opts.help, id)}
    </div>`;
  }
  function notesField(path, label, hint) {
    const id = fid(path);
    return `<div class="field"><label for="${id}">${esc(label)}</label>
      <textarea id="${id}" data-path="${path}" data-kind="text" rows="4" style="font-family:var(--font-body);font-size:15px;min-height:96px">${esc(valueOf(path) || "")}</textarea>
      ${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  }
  const moneyField = (p, l, o) => field("money", p, l, o);
  const numField = (p, l, o) => field("num", p, l, o);
  const textField = (p, l, o) => field("text", p, l, o);
  function selectField(path, label, options, opts = {}) {
    const v = valueOf(path);
    const id = fid(path);
    return `<div class="field"${opts.wide ? ' style="grid-column: 1 / -1"' : ""}>
      ${labelRow(id, label, opts.help)}
      <select id="${id}" data-path="${path}" data-kind="${opts.kind || "select"}">
        ${options.map(([val, text]) => `<option value="${esc(val)}"${String(v) === String(val) ? " selected" : ""}>${esc(text)}</option>`).join("")}
      </select>
      ${opts.hint ? `<span class="hint">${opts.hint}</span>` : ""}${helpPop(opts.help, id)}
    </div>`;
  }
  function toggle(path, label, help) {
    const id = fid(path);
    return `<div><div class="label-row"><label class="toggle" for="${id}"><input type="checkbox" id="${id}" data-path="${path}" data-kind="bool"${valueOf(path) ? " checked" : ""}> ${esc(label)}</label>${helpButton(help, id)}</div>${helpPop(help, id)}</div>`;
  }
  function chips(path, options, kind = "select") {
    const v = valueOf(path);
    return `<div class="chips" role="group">${options
      .map(([val, text]) => `<button type="button" class="chip" data-chip="${path}" data-kind="${kind}" data-value="${esc(val)}" aria-pressed="${String(v) === String(val)}">${esc(text)}</button>`)
      .join("")}</div>`;
  }
  const yearsLeftText = (months) => {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return `${y} year${y === 1 ? "" : "s"}${m ? ` ${m} month${m === 1 ? "" : "s"}` : ""}`;
  };

  function confirmBox(key, question, action) {
    if (ui.confirm !== key) return "";
    return `<div class="confirm" role="alert"><span>${esc(question)}</span>
      <button type="button" class="btn danger" data-act="${action}" data-key="${esc(key)}">${BIN} Yes, remove</button>
      <button type="button" class="btn secondary" data-act="cancel-confirm">Keep it</button></div>`;
  }
  const binButton = (key, label) => `<button type="button" class="btn icon secondary" data-act="ask" data-key="${esc(key)}" aria-label="${esc(label)}" title="${esc(label)}">${BIN}</button>`;

  // Rent hint: a typical rent for the price, or — once rent is entered — the yield (cap rate for commercial).
  function rentHint(price, rentWeekly, costPct, kind) {
    const com = kind === "COM";
    if (!(price > 0)) return "";
    if (!(rentWeekly > 0)) return `About ${money(Math.round((price * (com ? 0.065 : 0.04)) / 52))} at a ${com ? "6.5% cap rate" : "4% yield"}.`;
    const gross = (rentWeekly * 52) / price;
    const cost = (costPct != null && costPct !== "" ? +costPct : com ? A("comCostPct") : A("resCostPct")) / 100;
    const net = gross * (1 - cost);
    return com ? `Cap rate about ${(net * 100).toFixed(1)}% (${(gross * 100).toFixed(1)}% before the owner's costs).` : `Gross yield about ${(gross * 100).toFixed(1)}%, about ${(net * 100).toFixed(1)}% after costs.`;
  }

  // ---------------------------------------------------------------- pages

  function navButtons(prev, next) {
    const label = (id) => PAGES.find((p) => p[0] === id)[1];
    return `<div class="nav">${prev ? `<button type="button" class="btn secondary" data-go="${prev}">Back: ${label(prev)}</button>` : "<span></span>"}
      ${next ? `<button type="button" class="btn" data-go="${next}">Next: ${label(next)}</button>` : ""}</div>`;
  }

  function exampleBanner() {
    if (!state.example) return "";
    return `<div class="banner example"><span><b>These are example figures</b> for a made-up ${retired() ? "retiree" : "household"}. Change them to yours, or start with empty boxes.</span>
      <span class="row"><button type="button" class="btn secondary" data-act="${retired() ? "example-working" : "example-retired"}">${retired() ? "Show the working example" : "Show a retiree example"}</button>
      <button type="button" class="btn secondary" data-act="ask" data-key="fresh">Start with empty boxes</button></span></div>${confirmBox("fresh", "Clear every figure and plan?", "fresh")}`;
  }

  function pageYou() {
    const two = state.people.length > 1;
    return `${exampleBanner()}
    <div class="intro"><h2>You</h2><p class="muted">Type or use your phone's microphone in any box — "145 thousand", "$145k" and "145,000" all work.</p></div>
    <div class="card">
      <div class="field"><span class="label">Stage of life</span>${chips("stage", [["WORKING", "Working"], ["RETIRED", "Retired — living on super, savings and the Age Pension"]])}</div>
    </div>
    ${retired() ? pageYouRetired(two) : pageYouWorking(two)}
    ${navButtons(null, "own")}`;
  }

  function pageYouRetired(two) {
    return `<div class="card">
      <div class="card-head"><h3>Who</h3>${two ? "" : `<button type="button" class="btn quiet" data-act="add-person">+ Add a partner</button>`}</div>
      ${state.people
        .map(
          (p, i) => `<div class="grid">
            ${textField(`people.${i}.name`, "Name", { placeholder: i ? "Partner" : "You" })}
            ${numField(`people.${i}.age`, "Age now", { placeholder: "67" })}
            ${moneyField(`people.${i}.super`, "Super", { hint: "Paid out as a pension (account-based). Tax-free from 60.", help: "superPension" })}
            ${moneyField(`people.${i}.salary`, "Other income a year, before tax", { placeholder: "0", hint: "Part-time work, for example." })}
            ${i ? `<div class="field" style="align-self:end">${binButton("person-" + i, "Remove this person")}</div>` : ""}
          </div>${confirmBox("person-" + i, `Remove ${p.name || "this person"}?`, "remove-person")}`
        )
        .join("")}
    </div>
    <div class="card">
      <h3>Money in and out</h3>
      <div class="grid">
        ${moneyField("livingMonthly", "Living costs a month", { hint: "Everything except rent, and the rates and upkeep of a home bought in a plan — those are added for you.", help: "living" })}
        ${state.home && state.home.has ? "" : moneyField("rentWeekly", "Rent a week now", { hint: "Stops when a plan buys a home." })}
        ${moneyField("cash", "Savings in the bank")}
      </div>
      <div class="field"><span class="label">Take from super each year</span>${chips("superDrawMode", [["MIN", "The minimum (4–14% by age)"], ["SET", "A set amount"]])}</div>
      ${state.superDrawMode === "SET" ? `<div class="grid">${moneyField("superDrawYearly", "Amount a year (at least the minimum)", { help: "superPension" })}</div>` : ""}
      <p class="small muted">The Age Pension is worked out for you each year from age 67 — the home doesn't count in the assets test.</p>
    </div>
    <div class="card">
      <h3>What you're after</h3>
      <div class="field"><span class="label">The money must last until age</span>${chips("assumptions.lastUntil", [90, 95, 100].map((y) => [y, String(y)]), "num")}</div>
      <p class="small muted">Blink Check looks ahead to age 100 (${horizon()} years) and shows how long the money lasts.</p>
      ${notesField("notes", "What I'm trying to work out", "In your own words — it goes in the summary for an adviser or accountant.")}
    </div>`;
  }

  function pageYouWorking(two) {
    return `<div class="card">
      <div class="card-head"><h3>Who's buying</h3>${two ? "" : `<button type="button" class="btn quiet" data-act="add-person">+ Add a second person</button>`}</div>
      ${state.people
        .map(
          (p, i) => `<div class="grid">
            ${textField(`people.${i}.name`, "Name", { placeholder: i ? "Partner" : "You" })}
            ${moneyField(`people.${i}.salary`, "Income a year, before tax")}
            ${i ? `<div class="field" style="align-self:end">${binButton("person-" + i, "Remove this person")}</div>` : ""}
          </div>${confirmBox("person-" + i, `Remove ${p.name || "this person"}?`, "remove-person")}`
        )
        .join("")}
    </div>
    <div class="card">
      <h3>Each month</h3>
      <div class="grid">
        ${moneyField("livingMonthly", "Living costs a month", { hint: "Everything except loan repayments — the tool works those out.", help: "living" })}
        ${moneyField("cardLimits", "Credit card limits, all cards", { hint: "Lenders count about 3.8% of the limit a month, even if it's paid off.", help: "serviceability" })}
        ${moneyField("otherRepayMonthly", "Car or personal loan repayments a month")}
        ${numField("otherRepayYears", "Years left on those loans")}
      </div>
    </div>
    <div class="card">
      <h3>What you're after</h3>
      <div class="field"><span class="label">Main goal</span>${chips("goal", [["GROWTH", "Build wealth"], ["CASHFLOW", "More cash flow"], ["HOMEFIRST", "Pay the home off sooner"], ["RETIRE", "Retire earlier"]])}</div>
      <div class="field"><span class="label">How much risk feels right</span>${chips("risk", [["CAREFUL", "Careful"], ["MIDDLE", "In the middle"], ["ADVENTUROUS", "Adventurous"]])}</div>
      <div class="field"><span class="label">Look ahead</span>${chips("assumptions.horizon", [10, 15, 20, 25, 30].map((y) => [y, `${y} years`]), "num")}</div>
      ${notesField("notes", "What we're trying to work out", "In your own words — it goes in the summary for your accountant or broker.")}
    </div>`;
  }

  function loanFields(base, opts = {}) {
    const type = valueOf(base + ".type");
    return `<div class="grid">
      ${moneyField(base + ".balance", "Loan owing")}
      ${numField(base + ".rate", "Interest rate (% a year)")}
      ${selectField(base + ".type", "Repayments", [["PI", "Principal and interest"], ["IO", "Interest only"]], { help: type === "IO" ? "io" : "pi" })}
      ${type === "IO" ? numField(base + ".ioYears", "Interest-only years left") : ""}
      ${numField(base + ".yearsLeft", "Years left on the loan")}
      ${moneyField(base + ".offset", opts.offsetLabel || "Money in its offset", { help: "offset" })}
    </div>`;
  }

  function payoffNote(loan) {
    if (!loan || !(loan.balance > 0) || loan.type === "IO") return "";
    const r = (loan.rate || 0) / 100;
    const n = (loan.yearsLeft || 25) * 12;
    const pay = E.pmt(r, n, loan.balance);
    const off = loan.offset || 0;
    if (!(off > 0)) return `<p class="note-box">Repayments about <b>${money(pay)}</b> a month, paid off in ${yearsLeftText(n)} at today's rate.</p>`;
    const m = E.monthsToClear(loan.balance, off, r, pay);
    const interestWith = pay * m - (loan.balance - off);
    const interestWithout = pay * n - loan.balance;
    return `<p class="note-box">Repayments about <b>${money(pay)}</b> a month. With ${money(off)} in the offset it's paid off in <b>${yearsLeftText(m)}</b> instead of ${yearsLeftText(n)},
      saving about <b>${money(interestWithout - interestWith)}</b> of interest at today's rate.</p>`;
  }

  function pageOwn() {
    const two = state.people.length > 1;
    const home = state.home || {};
    return `${exampleBanner()}
    <div class="intro"><h2>What you own</h2><p class="muted">Today's values and loans. Leave out anything you don't have.</p></div>
    <div class="card">
      <div class="card-head"><h3>Home</h3>${toggle("home.has", "We own the home we live in")}</div>
      ${home.has ? `<div class="grid">${moneyField("home.value", "What it's worth")}</div>${loanFields("home.loan")}${payoffNote(home.loan)}` : ""}
    </div>
    ${state.rentals
      .map((r, i) => {
        const b = `rentals.${i}`;
        return `<div class="card">
          <div class="card-head"><h3>${esc(r.name || "Rental property")}</h3>${binButton("rental-" + i, "Remove this property")}</div>
          ${confirmBox("rental-" + i, `Remove ${r.name || "this property"}? Plans that sell it will skip that step.`, "remove-rental")}
          <div class="grid">
            ${textField(b + ".name", "Name")}
            ${selectField(b + ".kind", "Kind", [["RES", "Residential"], ["COM", "Commercial"]])}
            ${moneyField(b + ".value", "What it's worth")}
            ${moneyField(b + ".costBase", "What you paid, with stamp duty and costs", { hint: "For capital gains tax if it's sold.", help: "costBase" })}
            ${moneyField(b + ".rentWeekly", "Rent a week", { hint: rentHint(r.value, r.rentWeekly, r.costPct, r.kind), help: r.kind === "COM" ? "caprate" : "yield" })}
            ${numField(b + ".costPct", "Running costs (% of rent)", { hint: r.kind === "COM" ? "Net lease: owner pays about 12%." : "Rates, insurance, repairs, management: about 25%.", help: r.kind === "COM" ? "netlease" : "" })}
            ${selectField(b + ".writeOff", "Tax write-off (depreciation)", [["NONE", "None"], ["BUILDING", "Building only (built after 1987)"], ["NEW", "Building + fittings (new or near-new)"]], { help: "depreciation" })}
            ${moneyField(b + ".writeOffAmount", "Or your depreciation report's figure a year", { placeholder: "Optional" })}
            ${two ? numField(b + ".owners.0", `${state.people[0].name || "Person 1"}'s share (%)`, { hint: `${state.people[1].name || "Person 2"} owns the rest.` }) : ""}
          </div>
          <h4>Its loan</h4>
          ${loanFields(b + ".loan")}
        </div>`;
      })
      .join("")}
    <div class="row"><button type="button" class="btn secondary" data-act="add-rental" data-kind="RES">+ Add a rental property</button>
      <button type="button" class="btn secondary" data-act="add-rental" data-kind="COM">+ Add a commercial property</button></div>
    <div class="card">
      <h3>${retired() ? "Shares" : "Savings, shares and super"}</h3>
      <div class="grid">
        ${retired() ? "" : moneyField("cash", "Savings not in an offset")}
        ${moneyField("shares.value", "Shares and ETFs, worth")}
        ${moneyField("shares.costBase", "What you paid for them")}
        ${retired() ? "" : state.people.map((p, i) => moneyField(`people.${i}.super`, `${p.name || (i ? "Partner" : "Your")}'s super`)).join("")}
      </div>
      ${retired() ? `<p class="small muted">Savings and super are on the first page.</p>` : `<div class="row">${toggle("smsf.has", "Our super is in an SMSF", "smsf")}${toggle("smsf.open", "Open to investing through super")}</div>`}
    </div>
    ${navButtons("you", "plans")}`;
  }

  const SPARE = [
    ["HOME_OFFSET", "Into the home loan offset (then the next loan that isn't tax-deductible)"],
    ["OWN_OFFSET", "A property that's in the black puts its money in its own loan's offset; the rest goes to the home loan offset"],
    ["HIGHEST_RATE", "Into the offset of the dearest loan"],
    ["CASH", "Kept in savings"],
  ];

  function propertyChoices(plan, beforeYear) {
    const list = state.rentals.map((r) => [r.id, r.name || "Rental property"]);
    for (const s of plan.steps) if ((s.type === "BUY" || s.type === "SMSF") && +s.year < +beforeYear) list.push([s.id, s.name || (s.type === "SMSF" ? "SMSF property" : s.kind === "COM" ? "Commercial purchase" : "Residential purchase")]);
    return list;
  }

  function stepCard(plan, pi, s) {
    const si = plan.steps.indexOf(s);
    const b = `scenarios.${pi}.steps.${si}`;
    const H = horizon();
    const yearField = numField(b + ".year", `Year (1–${H})`);
    const two = state.people.length > 1;
    let title = "";
    let body = "";
    if (s.type === "BUY") {
      const com = s.kind === "COM";
      title = `Buy ${com ? "commercial" : "residential"}${s.name ? ` — ${esc(s.name)}` : ""}`;
      body = `<div class="grid">
        ${textField(b + ".name", "Name")}
        ${yearField}
        ${moneyField(b + ".price", "Price")}
        ${moneyField(b + ".rentWeekly", "Rent a week", { hint: rentHint(s.price, s.rentWeekly, null, s.kind), help: com ? "caprate" : "yield" })}
        ${selectField(b + ".funding", "Deposit and costs", [["EQUITY", "Borrow from equity — keep your cash"], ["CASH", "Use savings and offset cash first"], ["MIX", "Use a set amount of cash"]], { help: "equity" })}
        ${s.funding === "MIX" ? moneyField(b + ".cashAmount", "Cash to put in") : ""}
        ${numField(b + ".lvr", "Bank lends (% of price)", { placeholder: String(com ? A("comLvr") : A("resLvr")), help: "lvr" })}
        ${selectField(b + ".loanType", "Repayments", [["PI", "Principal and interest"], ["IO", "Interest only"]], { help: s.loanType === "IO" ? "io" : "pi" })}
        ${s.loanType === "IO" ? numField(b + ".ioYears", "Interest-only years", { placeholder: "5" }) : ""}
        ${selectField(b + ".writeOff", "Tax write-off (depreciation)", [["NONE", "None"], ["BUILDING", "Building only (built after 1987)"], ["NEW", "Building + fittings (new or near-new)"]], { help: "depreciation" })}
        ${moneyField(b + ".writeOffAmount", "Or a depreciation estimate a year", { placeholder: "Optional" })}
        ${two ? numField(b + ".owners.0", `${state.people[0].name || "Person 1"}'s share (%)`, { placeholder: "50" }) : ""}
      </div>`;
    } else if (s.type === "SMSF") {
      title = `SMSF purchase${s.name ? ` — ${esc(s.name)}` : ""}`;
      body = `<div class="grid">${textField(b + ".name", "Name")}${yearField}
        ${selectField(b + ".kind", "Kind", [["COM", "Commercial"], ["RES", "Residential"]])}
        ${moneyField(b + ".price", "Price")}${moneyField(b + ".rentWeekly", "Rent a week", { hint: rentHint(s.price, s.rentWeekly, null, s.kind), help: s.kind === "COM" ? "caprate" : "yield" })}
        ${numField(b + ".lvr", "Bank lends (% of price)", { placeholder: String(A("smsfLvr")), help: "lrba" })}</div>
        <p class="small muted">Deposit and costs come out of super; rent and repayments stay inside the fund. Super can't be touched until retirement age.</p>`;
    } else if (s.type === "SELL") {
      title = "Sell a property";
      const choices = propertyChoices(plan, s.year);
      body = `<div class="grid">${yearField}
        ${selectField(b + ".target", "Which property", choices.length ? choices : [["", "Nothing to sell yet"]])}
        ${selectField(b + ".then", "Then", [["PAY_DEBT", "Pay down the other loans (home loan first)"], ["OFFSET", "Put the money in the offset"]])}</div>
        <p class="small muted">Selling costs, capital gains tax (with the 50% discount after a year) and clearing its loans are included.</p>`;
    } else if (s.type === "SHARES") {
      title = "Buy shares or ETFs";
      body = `<div class="grid">${yearField}${moneyField(b + ".amount", "Amount")}
        ${selectField(b + ".funding", "Paid for by", [["CASH", "Savings and offset cash"], ["EQUITY", "Borrowing against property equity"], ["RECYCLE", "Debt recycling — pay the home loan down, borrow it back to invest"]], { help: "debtRecycling" })}
        ${s.funding !== "CASH" ? selectField(b + ".loanType", "Loan repayments", [["IO", "Interest only"], ["PI", "Principal and interest"]]) : ""}</div>
        ${s.funding === "RECYCLE" ? `<p class="small muted">Your offset cash pays down the home loan, and the same amount is borrowed back as a separate split to buy the shares — so that interest becomes tax-deductible. Talk to your accountant before doing it.</p>` : ""}`;
    } else if (s.type === "OFFSET") {
      title = "Put cash in an offset";
      body = `<div class="grid">${yearField}${moneyField(b + ".amount", "Amount from savings")}
        ${selectField(b + ".to", "Which loan's offset", [["home", "Home loan"]].concat(propertyChoices(plan, 99)))}</div>`;
    } else if (s.type === "HOME") {
      title = `Buy a home to live in${s.name ? ` — ${esc(s.name)}` : ""}`;
      const owns = state.home && state.home.has;
      body = `<div class="grid">${textField(b + ".name", "Name")}${yearField}
        ${moneyField(b + ".price", "Price")}
        ${moneyField(b + ".keep", "Keep at least this much in the bank", { placeholder: money(Math.max(20000, (state.livingMonthly || 0) * 3)), hint: "Paid from savings above this, then super, then the rest of savings." })}</div>
        <p class="small muted">${owns ? "Your current home is sold first. " : "Rent stops once it's bought. "}Stamp duty and buying costs are added; rates, insurance and upkeep (about ${A("homeRunPct")}% of its value a year) come out of the budget.</p>`;
    } else if (s.type === "PI") {
      title = "Switch to principal and interest";
      body = `<div class="grid">${yearField}${selectField(b + ".target", "Which property's loans", propertyChoices(plan, 99).concat([["home", "Home"]]))}</div>`;
    }
    const key = `step-${pi}-${s.id}`;
    return `<div class="step"><div class="step-head"><h4><span class="yr">${yearLabel(s.year)}</span>${title}</h4>${binButton(key, "Remove this step")}</div>
      ${confirmBox(key, "Remove this step?", "remove-step")}${body}</div>`;
  }

  function pagePlans() {
    const list = state.scenarios;
    const idx = Math.min(ui.plan, list.length - 1);
    const plan = list[idx];
    const tabs = list
      .map((s, i) => `<button type="button" class="plan-tab" data-plan="${i}" aria-selected="${i === idx}"><span class="dot" style="background:${SERIES[i]}"></span>${esc(s.baseline ? BASE_NAME : s.name || "Plan " + i)}</button>`)
      .join("");
    let body;
    if (plan.baseline) {
      body = retired()
        ? `<div class="card"><h3>No change: stay as you are</h3>
        <p>Nothing new is bought. ${state.home && state.home.has ? "You stay in your home" : "You keep renting"}; super pays a pension, savings earn interest, and the Age Pension is worked out each year. Each plan is compared with this.</p></div>`
        : `<div class="card"><h3>No change: cash stays in the offset</h3>
        <p>Nothing new is bought. Your savings and every spare dollar go into the home loan offset (then the next loan that isn't tax-deductible), which cuts interest and pays the loans off sooner. Each plan is compared with this.</p></div>`;
    } else {
      const sorted = plan.steps.slice().sort((a, b) => a.year - b.year);
      const smsfOk = state.smsf && (state.smsf.has || state.smsf.open);
      body = `<div class="card">
        <div class="card-head"><h3>${esc(plan.name || "Plan")}</h3>
          <div class="row">${plans().length < 3 ? `<button type="button" class="btn secondary" data-act="copy-plan">Copy this plan</button>` : ""}${binButton("plan-" + plan.id, "Delete this plan")}</div></div>
        ${confirmBox("plan-" + plan.id, `Delete "${plan.name || "this plan"}"?`, "remove-plan")}
        <div class="grid wide">${textField(`scenarios.${idx}.name`, "Plan name")}
          ${selectField(`scenarios.${idx}.spare`, "Where spare money goes", SPARE, { wide: true, hint: "When the plan needs money, it comes from savings first, then the offsets (home loan first).", help: "spare" })}</div>
        ${notesField(`scenarios.${idx}.notes`, "Notes and questions about this plan", "For example: “Would buying in the trust be better?” or “Can we borrow this much?”")}
      </div>
      <div class="steps">${sorted.length ? sorted.map((s) => stepCard(plan, idx, s)).join("") : `<p class="note-box">No steps yet — add one below.</p>`}</div>
      <div class="card no-print"><h4>Add a step</h4><div class="add-steps">
        ${retired() ? `<button type="button" class="btn secondary" data-add="HOME">Buy a home to live in</button>` : ""}
        <button type="button" class="btn secondary" data-add="BUY" data-kind="RES">Buy ${retired() ? "a rental" : "residential"}</button>
        <button type="button" class="btn secondary" data-add="BUY" data-kind="COM">Buy commercial</button>
        <button type="button" class="btn secondary" data-add="SELL">Sell a property</button>
        <button type="button" class="btn secondary" data-add="SHARES">Buy shares</button>
        ${smsfOk ? `<button type="button" class="btn secondary" data-add="SMSF">SMSF purchase</button>` : ""}
        <button type="button" class="btn secondary" data-add="OFFSET">Put cash in an offset</button>
        <button type="button" class="btn secondary" data-add="PI">Switch a loan to P&amp;I</button>
      </div></div>`;
    }
    return `${exampleBanner()}
    <div class="intro"><h2>Plans</h2><p class="muted">Every plan is compared with <b>No change</b> — ${retired() ? "staying as you are" : "buying nothing new and leaving your cash in the offset"}. Set up to three plans to compare with it — buy, sell, shares or super, in the years you'd do them.</p></div>
    <div class="row">${tabs}${plans().length < 3 ? `<button type="button" class="btn quiet" data-act="add-plan">+ Add a plan</button>` : ""}</div>
    ${body}
    ${navButtons("own", "check")}`;
  }

  // ---------------------------------------------------------------- results

  const METRICS_RETIRED = [
    ["spendable", "Cash and super", (y) => y.spendable, "Savings and super — the money there is to live on."],
    ["homeEquity", "Home equity", (y) => y.homeEquity, "What the home is worth, less anything owing on it."],
    ["nw", "Net worth", (y) => y.nw, "Everything owned, less anything owed."],
    ["agePension", "Age Pension", (y) => y.agePension, "The estimated Age Pension each year (from age 67)."],
    ["leftOver", "Left over each year", (y) => y.leftOver, "Money coming in less money going out. Below zero is drawn from savings and super."],
  ];
  const METRICS = [
    ["nw", "Net worth", (y) => y.nw, "Everything you own (super included) less what you owe."],
    ["nwExSuper", "Net worth outside super", (y) => y.nwExSuper, "What you could get at before retirement."],
    ["debt", "Debt", (y) => y.debt, "Loans owing (not counting SMSF loans)."],
    ["equity", "Property equity", (y) => y.equity, "Property value less loans, with offset money counted as paid off."],
    ["investCashAfter", "Investments' cash after tax", (y) => y.investCashAfter, "Rent and dividends, less costs, loan repayments and tax effect. Below zero is what you top up each year."],
    ["householdSpare", "Household spare cash", (y) => y.householdSpare, "Pay after tax, less living costs and every repayment, plus or minus the investments."],
    ["homeRate", "Interest rate", (y) => y.homeRate, "The home loan rate (other loans move the same way)."],
  ];

  // Line chart in SVG. series: [{ name, color, values, dash?, width?, base? }].
  // opts.group links charts so they share a year cursor; opts.at puts that cursor on a year (1-based).
  function chart(id, series, H, fmt, opts = {}) {
    const narrow = window.innerWidth < 600;
    const W = narrow ? 400 : 760;
    const Ht = opts.height || (narrow ? 280 : 300);
    const pl = narrow ? 50 : 64;
    const pr = 14;
    const pt = 14;
    const pb = 34;
    const all = series.flatMap((s) => s.values);
    let lo = Math.min(0, ...all);
    let hi = Math.max(...all, 1);
    if (fmt === "rate") {
      lo = Math.max(0, Math.floor(Math.min(...all) - 0.5));
      hi = Math.ceil(Math.max(...all) + 0.5);
    }
    const span = hi - lo || 1;
    const step = niceStep(span / (narrow ? 4 : 5));
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const x = (i) => pl + (i * (W - pl - pr)) / Math.max(1, H - 1);
    const y = (v) => pt + ((hi - v) * (Ht - pt - pb)) / (hi - lo || 1);
    const label = (v) => (fmt === "rate" ? v.toFixed(1) + "%" : compact(v));
    let grid = "";
    // Below zero: money going out. A light band, so negative years stand out.
    if (lo < 0 && opts.shadeNegative)
      grid += `<rect x="${pl}" y="${y(0)}" width="${W - pl - pr}" height="${y(lo) - y(0)}" fill="var(--warn-bg)" opacity="0.7"/>
        <text x="${pl + 8}" y="${y(lo) - 8}" style="fill:var(--warn)">${esc(opts.shadeNegative)}</text>`;
    for (let v = lo; v <= hi + step / 2; v += step) {
      const zero = Math.abs(v) < step / 1e6;
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${zero ? "var(--muted)" : "var(--grid)"}" stroke-width="${zero ? 1.25 : 1}"/>`;
      grid += `<text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`;
    }
    const every = H > 20 ? 5 : H > 10 ? (narrow ? 4 : 2) : narrow ? 2 : 1;
    let ticks = "";
    for (let i = 0; i < H; i++) if ((i + 1) % every === 0 || i === 0) ticks += `<text x="${x(i)}" y="${Ht - 10}" text-anchor="middle">${i + 1}</text>`;
    const lines = series
      .map((s) => {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const last = s.values.length - 1;
        const dash = s.dash !== undefined ? s.dash : s.base ? "6 5" : "";
        const width = s.width || (s.base ? 2 : 2.5);
        return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${width}" stroke-dasharray="${dash}" stroke-linejoin="round" stroke-linecap="round"/>
          ${s.noDot ? "" : `<circle cx="${x(last)}" cy="${y(s.values[last])}" r="4" fill="${s.color}"/>`}`;
      })
      .join("");
    const at = opts.at ? Math.min(H, opts.at) - 1 : null;
    chartData[id] = { series, H, fmt, x, pl, pr, W, Ht };
    return `<div class="chart-wrap" data-chart="${id}"${opts.group ? ` data-group="${opts.group}"` : ""}${at !== null ? ` data-at="${at}"` : ""}>
      <svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(opts.label || `Chart over ${H} years`)}">
        ${grid}${ticks}
        ${lines}<line class="cursor" x1="${at !== null ? x(at) : 0}" x2="${at !== null ? x(at) : 0}" y1="${pt}" y2="${Ht - pb}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="${at !== null ? "visible" : "hidden"}"/>
        <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${Ht - pt - pb}" fill="transparent" class="hit"/>
      </svg><div class="tip" hidden></div></div>
      ${series.length > 1 && !opts.noLegend ? legend(series) : ""}`;
  }
  const chartData = {};
  // A visual key: a sample of each line, in its colour and style, beside its name.
  function legend(series) {
    return `<div class="legend">${series
      .map((s) => {
        const dash = s.dash !== undefined ? s.dash : s.base ? "6 5" : "";
        const w = Math.min(3, s.width || (s.base ? 2 : 2.5));
        return `<span class="legend-item"><svg width="30" height="12" aria-hidden="true"><line x1="3" x2="27" y1="6" y2="6" stroke="${s.color}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg>${esc(s.name)}</span>`;
      })
      .join("")}</div>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function verdictCardRetired(r, i, base) {
    const s = r.summary;
    const v = r.verdict;
    const H = r.years.length;
    const at = Math.min(20, H);
    const y = r.years[at - 1];
    const lasts = s.runsOutAge === null ? "Past 100" : `About age ${s.runsOutAge}`;
    const rows = [
      [`Home equity in ${at} years (age ${y.age})`, money(y.homeEquity)],
      [`Cash and super in ${at} years`, money(y.spendable)],
      ["Age Pension, first year", money(r.years[0].agePension)],
      ["From super, first year", money(r.years[0].superDraw)],
      ["Rent, first year", money(r.years[0].rentPaid)],
    ];
    if (r.maxHomePrice !== undefined) rows.push([`Most to spend on the home (money lasts to ${A("lastUntil")})`, r.maxHomePrice === null ? "None works" : money(r.maxHomePrice)]);
    return `<div class="card verdict" style="--c:${SERIES[i]}">
      <div class="card-head"><h3 style="display:flex;gap:8px;align-items:center"><span class="dot" style="background:${SERIES[i]}"></span>${esc(r.baseline ? `${BASE_NAME}: ${state.home && state.home.has ? "stay in your home" : "keep renting"}` : r.name)}</h3></div>
      <span class="pill ${v.level}">${v.level === "STOP" ? FLAG : ""}${esc(v.label)}</span>
      ${(v.stops || []).length ? `<div class="red-flag" role="alert"><div class="red-flag-head">${FLAG}<b>${r.baseline ? "Even without a change, this doesn't last" : "This probably won't work"}</b></div><ul>${v.stops.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
      ${(v.warnings || []).length ? `<div class="amber-flag">${v.warnings.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : ""}
      <div><div class="big">${esc(lasts)}</div><p class="small muted">How long the money (savings and super) lasts, for the younger person.</p></div>
      <dl class="kv">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>
      ${v.notes.length ? `<ul class="notes">${v.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  function verdictCard(r, i, base) {
    if (retired()) return verdictCardRetired(r, i, base);
    const s = r.summary;
    const H = r.years.length;
    const v = r.verdict;
    const extraIn = s.moneyIn - base.summary.moneyIn;
    const rows = [
      [`Net worth in ${H} years`, money(s.nwEnd)],
      ["Cash put in at purchase", money(s.upfrontCash)],
      [`Yearly top-ups over ${H} years`, money(s.topUps)],
      ["Worst year", s.worstYear.amount < 0 ? `${yearLabel(s.worstYear.year)}: ${money(-s.worstYear.amount)}` : "Never costs you"],
      ["Investments pay for themselves", s.positiveFrom ? `From year ${s.positiveFrom}` : s.worstYear.amount < 0 ? "Not within the plan" : "From the start"],
      ["Home loan paid off", s.homeLoanPaidOff ? yearLabel(s.homeLoanPaidOff) : state.home && state.home.has ? `Not within ${H} years` : "—"],
      ["Borrowing peaks at", pctText(s.peakLvr * 100, 0) + " of property value"],
      ["Interest paid, all loans", money(s.totalInterest)],
    ];
    return `<div class="card verdict" style="--c:${SERIES[i]}">
      <div class="card-head"><h3 style="display:flex;gap:8px;align-items:center"><span class="dot" style="background:${SERIES[i]}"></span>${esc(r.baseline ? `${BASE_NAME}: cash stays in the offset` : r.name)}${r.baseline ? helpButton("yardstick", "h-yard") : ""}</h3></div>${r.baseline ? helpPop("yardstick", "h-yard") : ""}
      <span class="pill ${v.level}">${v.level === "STOP" ? FLAG : ""}${esc(v.label)}</span>
      ${(v.stops || []).length ? `<div class="red-flag" role="alert"><div class="red-flag-head">${FLAG}<b>This probably won't work</b></div><ul>${v.stops.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
      ${(v.warnings || []).length ? `<div class="amber-flag">${v.warnings.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : ""}
      ${
        r.baseline
          ? `<div><div class="big">${money(s.nwEnd)}</div><p class="small muted">Net worth in ${H} years, if nothing new is bought.</p></div>`
          : `<div><div class="big">${signed(v.gain)}</div><p class="small muted">Net worth in ${H} years compared with No change${
              extraIn > 0 ? `, for ${money(extraIn)} more of your own money over the years (${money(extraIn / H)} a year)` : ""
            }.</p></div>`
      }
      <dl class="kv">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>
      ${v.notes.length ? `<ul class="notes">${v.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  function chainView(c) {
    const sources = [];
    if (c.kind === "SHARES") {
      if (c.recycled) sources.push([`Home loan paid down, then borrowed back (deductible)`, c.recycled]);
    } else if (c.mainLoan) sources.push([c.smsf ? "Loan inside the SMSF" : "Loan on the new property", c.mainLoan]);
    for (const e of c.equity) sources.push([`Borrowed against ${e.from.toLowerCase()}'s equity`, e.amount]);
    if (c.cash) sources.push(["Your savings and offset cash", c.cash]);
    if (c.fromSuper) sources.push(["Super", c.fromSuper]);
    if (c.short) sources.push(["Shortfall — not covered", c.short]);
    const uses = c.kind === "SHARES" ? [["Shares and ETFs", c.price]] : [["Price", c.price], ["Stamp duty", c.duty], ["Legal and other buying costs", c.other]];
    const borrow = c.borrow
      ? `<span class="pill ${c.borrow.result === "LIKELY" ? "YES" : c.borrow.result === "TIGHT" ? "MAYBE" : "STOP"}">${c.borrow.result === "LIKELY" ? "Loan looks likely" : c.borrow.result === "TIGHT" ? "Loan looks tight" : "Loan looks unlikely"}</span>
         <span class="small muted">${c.borrow.surplus >= 0 ? money(c.borrow.surplus) + " a year spare" : money(-c.borrow.surplus) + " a year short"} at a lender's test rate (cards and other loans included).</span>`
      : "";
    return `<div class="card" style="gap:10px">
      <h4>${yearLabel(c.year)} — ${esc(c.name)}</h4>
      <div class="chain">
        <div class="col">${sources.map(([k, v]) => `<div class="box"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join("")}</div>
        <div class="arrow" aria-hidden="true">→</div>
        <div class="col">${uses.map(([k, v]) => `<div class="box"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join("")}
          <div class="box total"><span>Total</span><b>${money(c.total)}</b></div></div>
      </div>
      <div class="row">${c.lvrAfter ? `<span class="small">Borrowing afterwards: <b>${pctText(c.lvrAfter * 100, 0)}</b> of all property value.</span>` : ""}${borrow}</div>
    </div>`;
  }

  function wentTo(y) {
    const parts = [];
    const t = y.sentTo;
    if (t.homeOffset) parts.push(`home offset ${compact(t.homeOffset)}`);
    if (t.ownOffset) parts.push(`own offsets ${compact(t.ownOffset)}`);
    if (t.otherOffset) parts.push(`other offsets ${compact(t.otherOffset)}`);
    if (t.cash) parts.push(`savings ${compact(t.cash)}`);
    if (t.payDown) parts.push(`paid off ${compact(t.payDown)}`);
    return parts.join(", ") || "—";
  }
  function takenFrom(y) {
    const parts = [];
    const d = y.drawnFrom;
    if (d.cash) parts.push(`savings ${compact(d.cash)}`);
    if (d.offsets) parts.push(`offsets ${compact(d.offsets)}`);
    if (d.super) parts.push(`super ${compact(d.super)}`);
    if (d.overdrawn) parts.push(`short ${compact(d.overdrawn)}`);
    return parts.join(", ") || "—";
  }

  function yearTable(r) {
    const cell = (n) => `<td class="num${n < 0 ? " neg" : ""}">${money(n)}</td>`;
    if (retired())
      return `<div class="table-wrap"><table>
      <thead><tr><th>Year</th><th>Age</th><th>Age Pension</th><th>From super</th><th>Interest + pay</th><th>Living costs</th><th>Rent + home costs</th><th>Left over</th><th>Taken from</th><th>Cash</th><th>Super</th><th>Home equity</th></tr></thead>
      <tbody>${r.years
        .map(
          (y) => `<tr class="${y.events.length ? "event" : ""}"><td>${y.year}${y.events.length ? `<div class="small muted">${esc(y.events.join("; "))}</div>` : ""}</td><td class="num">${y.age}</td>
          ${cell(y.agePension)}${cell(y.superDraw)}${cell(y.moneyIn - y.agePension - y.superDraw)}${cell(y.living)}${cell(y.rentPaid + y.homeCosts)}${cell(y.leftOver)}
          <td>${esc(takenFrom(y))}</td>${cell(y.cash + y.offsets)}${cell(y.superTotal)}${cell(y.homeEquity)}</tr>`
        )
        .join("")}</tbody></table></div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Year</th><th>Rate</th><th>Rent</th><th>Costs + land tax</th><th>Interest</th><th>Write-offs</th><th>Tax (− = back)</th><th>Investments after tax</th><th>Spare money went to</th><th>Money taken from</th><th>Debt</th><th>Net worth</th></tr></thead>
      <tbody>${r.years
        .map(
          (y) => `<tr class="${y.events.length ? "event" : ""}"><td>${y.year}${y.events.length ? `<div class="small muted">${esc(y.events.join("; "))}</div>` : ""}</td>
          <td class="num">${y.homeRate.toFixed(2)}%</td>${cell(y.rent)}${cell(y.costs)}${cell(y.interest)}${cell(y.writeOffs)}${cell(y.taxEffect)}${cell(y.investCashAfter)}
          <td>${esc(wentTo(y))}</td><td>${esc(takenFrom(y))}</td>${cell(y.debt)}${cell(y.nw)}</tr>`
        )
        .join("")}</tbody></table></div>`;
  }

  const GOALS = { GROWTH: "build wealth", CASHFLOW: "get more cash flow", HOMEFIRST: "pay the home off sooner", RETIRE: "retire earlier" };
  const RISKS = { CAREFUL: "careful", MIDDLE: "in the middle", ADVENTUROUS: "adventurous" };
  const FUNDING = { EQUITY: "borrowing the deposit and costs against our equity", CASH: "using our savings and offset cash first", MIX: "putting in some cash and borrowing the rest" };

  function stepWords(s) {
    if (s.type === "BUY") {
      const kind = s.kind === "COM" ? "a commercial property" : "a residential property";
      const rent = s.rentWeekly ? ` (rent about ${money(s.rentWeekly)} a week)` : "";
      const loan = s.loanType === "IO" ? `, interest only for ${s.ioYears || 5} years` : ", principal and interest";
      return `buy ${kind} for about ${money(s.price)}${rent}, ${FUNDING[s.funding] || FUNDING.EQUITY}${loan}`;
    }
    if (s.type === "SMSF") return `buy ${s.kind === "COM" ? "a commercial" : "a residential"} property in our SMSF for about ${money(s.price)}, with a loan inside the fund`;
    if (s.type === "SELL") {
      const p = state.rentals.find((r) => r.id === s.target);
      const name = p ? p.name : "the property bought earlier in this plan";
      return `sell ${name}${s.then === "OFFSET" ? " and put the money in the offset" : " and use the money to pay down our other loans"}`;
    }
    if (s.type === "SHARES") return `invest ${money(s.amount)} in shares or ETFs, ${s.funding === "RECYCLE" ? "using debt recycling from the home loan" : s.funding === "EQUITY" ? "borrowing against property equity" : "from savings and offset cash"}`;
    if (s.type === "OFFSET") return `put ${money(s.amount)} of savings into an offset account`;
    if (s.type === "PI") return "switch the loans to principal and interest";
    if (s.type === "HOME") return `buy a home to live in for about ${money(s.price)}${state.home && state.home.has ? ", after selling the current home" : ""}, paid from savings and then super`;
    return "";
  }

  function plainWordsRetired(R) {
    const lines = [];
    const two = state.people.length > 1;
    const names = state.people.map((p, i) => p.name || `Person ${i + 1}`);
    const until = A("lastUntil");
    lines.push(two ? "ABOUT US" : "ABOUT ME");
    lines.push(state.people.map((p, i) => `${names[i]} is ${p.age || "—"}, with ${money(p.super)} in super${p.salary ? ` and ${money(p.salary)} a year of other income` : ""}.`).join(" "));
    lines.push(`${two ? "We have" : "I have"} ${money(state.cash)} in savings; living costs are about ${money(state.livingMonthly)} a month${state.home && state.home.has ? `, and ${two ? "we own our" : "I own my"} home (worth about ${money(state.home.value)})` : state.rentWeekly ? `, plus rent of ${money(state.rentWeekly)} a week` : ""}.`);
    lines.push(`Super is taken as ${state.superDrawMode === "SET" ? `${money(state.superDrawYearly)} a year (at least the minimum)` : "the minimum pension each year"}. The money needs to last until age ${until}.`);
    if (state.notes) lines.push(`What ${two ? "we're" : "I'm"} trying to work out: ${state.notes}`);
    const base = R.base;
    lines.push("");
    lines.push("KEEPING THINGS AS THEY ARE");
    lines.push(`Money lasts ${base.summary.runsOutAge === null ? "past 100" : `until about age ${base.summary.runsOutAge}`}; Age Pension in the first year about ${money(base.years[0].agePension)}.`);
    for (const r of R.runs.filter((x) => !x.baseline)) {
      const sc = state.scenarios.find((x) => x.id === r.id);
      const at = Math.min(20, r.years.length);
      const y = r.years[at - 1];
      lines.push("");
      lines.push(`IDEA: ${r.name.toUpperCase()}`);
      for (const st of sc.steps.slice().sort((a, b) => a.year - b.year)) lines.push(`• Year ${st.year}: ${stepWords(st)}.`);
      lines.push(`Rough result: money lasts ${r.summary.runsOutAge === null ? "past 100" : `until about age ${r.summary.runsOutAge}`} (${r.verdict.label.toLowerCase()}).`);
      lines.push(`In year ${at} (age ${y.age}): home equity about ${money(y.homeEquity)}, cash and super about ${money(y.spendable)}. Age Pension in the first year about ${money(r.years[0].agePension)}.`);
      if (r.maxHomePrice !== undefined && r.maxHomePrice !== null) lines.push(`The most this plan could spend on the home and still have money at ${until}: about ${money(r.maxHomePrice)}.`);
      for (const t of r.verdict.stops || []) lines.push(`RED FLAG: ${t}`);
      for (const t of r.verdict.warnings || []) lines.push(`Watch: ${t}`);
      if (sc.notes) lines.push(`Questions: ${sc.notes}`);
    }
    lines.push("");
    lines.push("These are broad estimates from Blink Check (general information, not advice). Age Pension figures are estimates — Services Australia works out the real amount.");
    return lines.join("\n");
  }

  function plainWords(R) {
    if (retired()) return plainWordsRetired(R);
    const H = R.base.years.length;
    const two = state.people.length > 1;
    const lines = [];
    const names = state.people.map((p, i) => p.name || `Person ${i + 1}`);
    lines.push("ABOUT US");
    lines.push(`${two ? `${names.join(" and ")} earn ${state.people.map((p) => money(p.salary)).join(" and ")} a year` : `${names[0]} earns ${money(state.people[0].salary)} a year`} before tax; living costs are about ${money(state.livingMonthly)} a month.`);
    if (state.home && state.home.has) lines.push(`Our home is worth about ${money(state.home.value)}, with ${money(state.home.loan.balance)} owing at ${state.home.loan.rate}% and ${money(state.home.loan.offset)} in the offset.`);
    for (const r of state.rentals) lines.push(`${r.name}: ${r.kind === "COM" ? "commercial" : "residential"}, worth about ${money(r.value)}, ${money(r.loan.balance)} owing at ${r.loan.rate}% (${r.loan.type === "IO" ? "interest only" : "principal and interest"}), rent ${money(r.rentWeekly)} a week.`);
    const extras = [];
    if (state.cash) extras.push(`${money(state.cash)} in savings`);
    if (state.shares && state.shares.value) extras.push(`${money(state.shares.value)} in shares`);
    const superTotal = state.people.reduce((t, p) => t + (+p.super || 0), 0);
    if (superTotal) extras.push(`${money(superTotal)} in super${state.smsf && state.smsf.has ? " (an SMSF)" : ""}`);
    if (state.cardLimits || state.otherRepayMonthly) extras.push(`credit card limits of ${money(state.cardLimits)} and ${money(state.otherRepayMonthly)} a month of other loan repayments`);
    if (extras.length) lines.push(`We also have ${extras.join(", ")}.`);
    lines.push(`We want to ${GOALS[state.goal] || GOALS.GROWTH}, and our comfort with risk is ${RISKS[state.risk] || "in the middle"}.`);
    if (state.notes) lines.push(`What we're trying to work out: ${state.notes}`);
    for (const r of R.runs.filter((x) => !x.baseline)) {
      const sc = state.scenarios.find((x) => x.id === r.id);
      const sm = r.summary;
      lines.push("");
      lines.push(`IDEA: ${r.name.toUpperCase()}`);
      for (const st of sc.steps.slice().sort((a, b) => a.year - b.year)) lines.push(`• Year ${st.year}: ${stepWords(st)}.`);
      lines.push(`• Spare money goes ${SPARE.find((x) => x[0] === (sc.spare || "HOME_OFFSET"))[1].charAt(0).toLowerCase() + SPARE.find((x) => x[0] === (sc.spare || "HOME_OFFSET"))[1].slice(1)}.`);
      lines.push(`Rough result over ${H} years: net worth about ${signed(r.verdict.gain)} compared with leaving the cash in the offset (${r.verdict.label.toLowerCase()}).`);
      lines.push(`Our own money in: about ${money(sm.upfrontCash)} at purchase and ${money(sm.topUps)} of top-ups over the years${sm.worstYear.amount < 0 ? `; the hardest year is year ${sm.worstYear.year}, at about ${money(-sm.worstYear.amount)} (${weekly(-sm.worstYear.amount)}) after tax` : ""}.`);
      for (const c of r.chains) if (c.borrow) lines.push(`Borrowing check for ${c.name.toLowerCase()} in year ${c.year}: ${c.borrow.result === "LIKELY" ? "looks likely" : c.borrow.result === "TIGHT" ? "looks tight" : "looks unlikely"}.`);
      for (const t of r.verdict.stops || []) lines.push(`RED FLAG: ${t}`);
      for (const t of r.verdict.warnings || []) lines.push(`Watch: ${t}`);
      if (sc.notes) lines.push(`Our questions: ${sc.notes}`);
    }
    lines.push("");
    lines.push("These are broad estimates from Blink Check (general information, not advice) — the assumptions are in the file.");
    return lines.join("\n");
  }

  const runName = (r) => (r.baseline ? BASE_NAME : r.name);

  function stopBanner(runs) {
    const bad = runs.filter((r) => r.verdict && r.verdict.level === "STOP");
    if (!bad.length) return "";
    const why = retired() ? `the money doesn't last to ${A("lastUntil")}` : "probably won't work on this income";
    return `<div class="red-flag big" role="alert"><div class="red-flag-head">${FLAG}<b>${bad.length === 1 ? `"${esc(bad[0].name)}": ${why}` : `${bad.length} plans: ${why}`}</b></div>
      <p>${bad.map((r) => esc(r.name)).join("; ")} — see the red flags on ${bad.length === 1 ? "its card" : "their cards"} below. ${
        retired() ? "A cheaper home, a later purchase or lower spending might change that — each card shows the most that plan could spend on the home." : "A smaller purchase, a later year, more income or less other debt might change that."
      }</p></div>`;
  }

  // Short money for sentences: $1.71m, $310k.
  const approx = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m";
    if (a >= 1e4) return "$" + Math.round(a / 1e3) + "k";
    return money(a);
  };

  const FULL_MEASURES = [
    ["nw", "Wealth (net worth)", "solid"],
    ["debt", "Debt", "dashed"],
    ["income", "Income before tax", "dotted"],
    ["cash", "Investments' cash flow after tax", "solid"],
  ];
  const lineKey = (style) =>
    `<svg width="28" height="10" aria-hidden="true"><line x1="1" x2="27" y1="5" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"${style === "dashed" ? ' stroke-dasharray="7 5"' : style === "dotted" ? ' stroke-dasharray="1 5"' : ""}/></svg>`;

  // Facts about one plan, by year `at` (1-based).
  const FULL_MEASURES_RETIRED = [
    ["homeEquity", "Home equity", "solid"],
    ["spendable", "Cash and super", "dashed"],
    ["moneyIn", "Money coming in", "dotted"],
    ["leftOver", "Left over each year", "solid"],
  ];

  function factsAt(r, at) {
    const ys = r.years.slice(0, at);
    const y = r.years[at - 1];
    if (retired())
      return {
        homeEquity: y.homeEquity,
        spendable: y.spendable,
        moneyIn: y.moneyIn,
        agePension: y.agePension,
        moneyOut: y.moneyOut,
        leftOver: y.leftOver,
        shortYears: ys.filter((x) => x.leftOver < 0).length,
        lasts: r.summary.runsOutAge,
      };
    return {
      nw: y.nw,
      debt: y.debt,
      income: y.income,
      cash: y.investCashAfter,
      costYears: ys.filter((x) => x.investCashAfter < 0).length,
      moneyIn: ys.reduce((t, x) => t + x.upfrontCash + x.topUp, 0),
      debtFree: r.summary.debtFreeYear,
    };
  }

  function fullDiff() {
    const R = compute();
    const runs = R.runs;
    const H = R.base.years.length;
    const at = Math.min(ui.atYear || (retired() ? Math.min(20, H) : H), H);
    const mi = Math.min(ui.fullMain, runs.length - 1);
    const main = runs[mi];
    const others = runs.filter((r, i) => i !== mi && ui.fullCompare[r.id]);
    const m = factsAt(main, at);
    const yearsText = (n) => `${n} year${n === 1 ? "" : "s"}`;
    if (retired()) return fullDiffRetired(runs, main, mi, others, m, at, H);
    const sentences = others.map((o) => {
      const f = factsAt(o, at);
      const parts = [];
      const dW = f.nw - m.nw;
      parts.push(Math.abs(dW) < 1000 ? "about the same wealth" : `${approx(dW)} ${dW > 0 ? "more" : "less"} wealth`);
      const dD = f.debt - m.debt;
      parts.push(Math.abs(dD) < 1000 ? "about the same debt" : `${approx(dD)} ${dD > 0 ? "more" : "less"} debt`);
      const cy = f.costYears === m.costYears ? `in both, the investments cost you money in ${yearsText(f.costYears)}` : `its investments cost you money in ${yearsText(f.costYears)} instead of ${m.costYears}`;
      return `<li>By year ${at}, compared with <b>${esc(runName(main))}</b>, <b>${esc(runName(o))}</b> leaves you with ${parts.join(" and ")}; ${cy}.</li>`;
    });
    const rows = [
      [`Wealth (net worth) in year ${at}`, (f) => money(f.nw), (f) => f.nw - m.nw, "money"],
      [`Debt in year ${at}`, (f) => money(f.debt), (f) => f.debt - m.debt, "money"],
      [`Income before tax in year ${at}`, (f) => money(f.income), (f) => f.income - m.income, "money"],
      [`Investments' cash flow in year ${at}`, (f) => money(f.cash), (f) => f.cash - m.cash, "money"],
      [`Years the investments cost you money (1–${at})`, (f) => String(f.costYears), (f) => f.costYears - m.costYears, "years"],
      [`Your own money put in (1–${at})`, (f) => money(f.moneyIn), (f) => f.moneyIn - m.moneyIn, "money"],
      ["Debt-free", (f) => (f.debtFree ? `Year ${f.debtFree}` : `Not within ${H} years`), () => null, ""],
    ];
    const facts = others.map((o) => factsAt(o, at));
    const diffText = (d, kind) => (d === null || d === 0 || (kind === "money" && Math.abs(d) < 500) ? "" : kind === "years" ? `${Math.abs(d)} ${d > 0 ? "more" : "fewer"}` : `${approx(d)} ${d > 0 ? "more" : "less"}`);
    return `${sentences.length ? `<ul class="diff-words">${sentences.join("")}</ul>` : `<p class="small muted">Tick a plan under "Compare with" to see the differences.</p>`}
      <div class="table-wrap"><table class="diff-table"><thead><tr><th>Year ${at}</th><th><span class="dot" style="background:${SERIES[mi]}"></span> ${esc(runName(main))}</th>${others
        .map((o) => `<th><span class="dot" style="background:${SERIES[runs.indexOf(o)]}"></span> ${esc(runName(o))}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map(([label, val, diff, kind]) => `<tr><td>${esc(label)}</td><td class="num">${esc(val(m))}</td>${facts.map((f) => `<td class="num">${esc(val(f))}${diffText(diff(f), kind) ? `<div class="small muted">${esc(diffText(diff(f), kind))}</div>` : ""}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
  }

  function fullDiffRetired(runs, main, mi, others, m, at, H) {
    const lastsText = (x) => (x === null ? "past 100" : `to about age ${x}`);
    const age = main.years[at - 1].age;
    const sentences = others.map((o) => {
      const f = factsAt(o, at);
      const dE = f.homeEquity - m.homeEquity;
      const dS = f.spendable - m.spendable;
      const p1 = Math.abs(dE) < 1000 ? "about the same home equity" : `${approx(dE)} ${dE > 0 ? "more" : "less"} home equity`;
      const p2 = Math.abs(dS) < 1000 ? "about the same cash and super" : `${approx(dS)} ${dS > 0 ? "more" : "less"} cash and super`;
      return `<li>By year ${at} (age ${age}), compared with <b>${esc(runName(main))}</b>, <b>${esc(runName(o))}</b> leaves ${p1} and ${p2}; its money lasts ${lastsText(f.lasts)} instead of ${lastsText(m.lasts)}.</li>`;
    });
    const rows = [
      [`Home equity in year ${at}`, (f) => money(f.homeEquity), (f) => f.homeEquity - m.homeEquity],
      [`Cash and super in year ${at}`, (f) => money(f.spendable), (f) => f.spendable - m.spendable],
      [`Coming in, year ${at}`, (f) => money(f.moneyIn), (f) => f.moneyIn - m.moneyIn],
      [`…of which Age Pension`, (f) => money(f.agePension), (f) => f.agePension - m.agePension],
      [`Going out, year ${at}`, (f) => money(f.moneyOut), (f) => f.moneyOut - m.moneyOut],
      [`Left over, year ${at}`, (f) => money(f.leftOver), (f) => f.leftOver - m.leftOver],
      ["Money lasts", (f) => (f.lasts === null ? "Past 100" : `To about ${f.lasts}`), () => null],
    ];
    const facts = others.map((o) => factsAt(o, at));
    const diffText = (d) => (d === null || Math.abs(d) < 500 ? "" : `${approx(d)} ${d > 0 ? "more" : "less"}`);
    return `${sentences.length ? `<ul class="diff-words">${sentences.join("")}</ul>` : `<p class="small muted">Tick a plan under "Compare with" to see the differences.</p>`}
      <div class="table-wrap"><table class="diff-table"><thead><tr><th>Year ${at} (age ${age})</th><th><span class="dot" style="background:${SERIES[mi]}"></span> ${esc(runName(main))}</th>${others
        .map((o) => `<th><span class="dot" style="background:${SERIES[runs.indexOf(o)]}"></span> ${esc(runName(o))}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map(([label, val, diff]) => `<tr><td>${esc(label)}</td><td class="num">${esc(val(m))}</td>${facts.map((f) => `<td class="num">${esc(val(f))}${diffText(diff(f)) ? `<div class="small muted">${esc(diffText(diff(f)))}</div>` : ""}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
  }

  function fullCardRetired(R, runs, H, at, mi, main, shown, on) {
    const top = [];
    const bottom = [];
    for (const r of shown) {
      const i = runs.indexOf(r);
      const width = r === main ? 3 : 2;
      const nm = runName(r);
      if (on.homeEquity !== false) top.push({ name: `Home equity — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.homeEquity), width });
      if (on.spendable !== false) top.push({ name: `Cash and super — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.spendable), width, dash: "7 5", noDot: true });
      if (on.moneyIn !== false) bottom.push({ name: `Coming in — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.moneyIn), width: 2, dash: "1 5", noDot: true });
      if (on.leftOver !== false) bottom.push({ name: `Left over — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.leftOver), width });
    }
    const ageAt = main.years[at - 1].age;
    return `<div class="card">
      <div class="card-head"><h3>Home equity against cash and super</h3></div>
      <p class="small muted">One plan in full, with any others laid over it. Pick the plan, tick what to compare it with, and slide to a year. Ages are the younger person's.</p>
      <div class="field"><span class="label">Plan</span><div class="chips">${runs
        .map((r, i) => `<button type="button" class="chip" data-pick="fullMain" data-value="${i}" aria-pressed="${i === mi}"><span class="dot" style="background:${SERIES[i]};margin-right:6px"></span>${esc(runName(r))}</button>`)
        .join("")}</div></div>
      <div class="field"><span class="label">Compare with</span><div class="chips">${runs
        .map((r, i) => (i === mi ? "" : `<label class="chip legend-chip"><input type="checkbox" data-cmp="${esc(r.id)}"${ui.fullCompare[r.id] ? " checked" : ""} style="accent-color:${SERIES[i]};width:18px;height:18px"> ${esc(runName(r))}</label>`))
        .join("")}</div></div>
      <div class="field"><span class="label">Show</span><div class="chips">${FULL_MEASURES_RETIRED.map(
        ([k, label, style]) => `<label class="chip legend-chip"><input type="checkbox" data-measure="${k}"${on[k] !== false ? " checked" : ""} style="width:18px;height:18px"> ${lineKey(style)} ${esc(label)}</label>`
      ).join("")}</div></div>
      <div class="at-row"><label for="at-year">Compare at</label><input type="range" id="at-year" data-at min="1" max="${H}" value="${at}"><output id="at-label">Year ${at} · age ${ageAt}</output></div>
      ${top.length ? `<h4>What you own</h4>${chart("full-top", top, H, "money", { group: "full", at, noNote: true, label: "Home equity and cash and super over the years" })}` : ""}
      ${bottom.length ? `<h4>Money each year</h4>${chart("full-bottom", bottom, H, "money", { group: "full", at, noNote: true, shadeNegative: on.leftOver !== false ? "Below the line: drawing on savings and super" : "", label: "Money coming in and left over each year" })}` : ""}
      <p class="small muted">Coming in: Age Pension, super pension, interest and any pay. Left over: after living costs, rent and the home's running costs. Year 1 is age ${main.years[0].age}.</p>
      <div id="full-diff">${fullDiff()}</div>
    </div>`;
  }

  function fullCard(R) {
    const runs = R.runs;
    const H = R.base.years.length;
    const at = Math.min(ui.atYear || (retired() ? Math.min(20, H) : H), H);
    const mi = Math.min(ui.fullMain, runs.length - 1);
    const main = runs[mi];
    const shown = runs.filter((r, i) => i === mi || ui.fullCompare[r.id]);
    const on = ui.fullShow;
    const top = [];
    const bottom = [];
    if (retired()) return fullCardRetired(R, runs, H, at, mi, main, shown, on);
    for (const r of shown) {
      const i = runs.indexOf(r);
      const width = r === main ? 3 : 2;
      const nm = runName(r);
      if (on.nw) top.push({ name: `Wealth — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.nw), width });
      if (on.debt) top.push({ name: `Debt — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.debt), width, dash: "7 5", noDot: true });
      if (on.cash) bottom.push({ name: `Cash flow — ${nm}`, color: SERIES[i], values: r.years.map((y) => y.investCashAfter), width });
    }
    if (on.income) bottom.unshift({ name: "Income before tax", color: "var(--fg)", values: main.years.map((y) => y.income), width: 2, dash: "1 5", noDot: true });
    const wage = state.assumptions.wageGrowth;
    const wageText = wage === undefined || wage === null || wage === "" ? `rising with prices (CPI, ${A("cpi")}% a year)` : `rising ${wage}% a year`;
    return `<div class="card">
      <div class="card-head"><h3>Wealth, debt and cash flow</h3></div>
      <p class="small muted">One plan in full, with any others laid over it. Pick the plan, tick what to compare it with, and slide to a year.</p>
      <div class="field"><span class="label">Plan</span><div class="chips">${runs
        .map((r, i) => `<button type="button" class="chip" data-pick="fullMain" data-value="${i}" aria-pressed="${i === mi}"><span class="dot" style="background:${SERIES[i]};margin-right:6px"></span>${esc(runName(r))}</button>`)
        .join("")}</div></div>
      <div class="field"><span class="label">Compare with</span><div class="chips">${runs
        .map((r, i) => (i === mi ? "" : `<label class="chip legend-chip"><input type="checkbox" data-cmp="${esc(r.id)}"${ui.fullCompare[r.id] ? " checked" : ""} style="accent-color:${SERIES[i]};width:18px;height:18px"> ${esc(runName(r))}</label>`))
        .join("")}</div></div>
      <div class="field"><span class="label">Show</span><div class="chips">${FULL_MEASURES.map(
        ([k, label, style]) => `<label class="chip legend-chip"><input type="checkbox" data-measure="${k}"${on[k] ? " checked" : ""} style="width:18px;height:18px"> ${lineKey(style)} ${esc(label)}</label>`
      ).join("")}</div></div>
      <div class="at-row"><label for="at-year">Compare at</label><input type="range" id="at-year" data-at min="1" max="${H}" value="${at}"><output id="at-label">Year ${at}</output></div>
      ${on.nw || on.debt ? `<h4>What you own and owe</h4>${top.length ? chart("full-top", top, H, "money", { group: "full", at, noNote: true, label: "Wealth and debt over the years" }) : ""}` : ""}
      ${on.income || on.cash ? `<h4>Money each year</h4>${chart("full-bottom", bottom, H, "money", { group: "full", at, noNote: true, shadeNegative: on.cash ? "Below the line: costs you money" : "", label: "Income and cash flow each year" })}` : ""}
      ${on.income ? `<p class="small muted">Income before tax is the same in every plan, ${esc(wageText)}.</p>` : ""}
      <div id="full-diff">${fullDiff()}</div>
    </div>`;
  }

  function pageCheck() {
    const R = compute();
    const H = R.base.years.length;
    const runs = R.runs;
    const LIST = retired() ? METRICS_RETIRED : METRICS;
    const metric = LIST.find((m) => m[0] === ui.metric) || LIST[0];
    const series = runs
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !ui.hidden[r.id])
      .map(({ r, i }) => ({ name: r.baseline ? BASE_NAME : r.name, color: SERIES[i], base: r.baseline, values: r.years.map(metric[2]) }));
    const ci = Math.min(ui.chainPlan, runs.length - 1);
    const ti = Math.min(ui.tablePlan, runs.length - 1);
    const planChips = (key, current) =>
      `<div class="chips">${runs.map((r, i) => `<button type="button" class="chip" data-pick="${key}" data-value="${i}" aria-pressed="${i === current}"><span class="dot" style="background:${SERIES[i]};margin-right:6px"></span>${esc(r.baseline ? BASE_NAME : r.name)}</button>`).join("")}</div>`;
    const ct = runs[ci];
    const tt = runs[ti];
    const spareText = SPARE.find((x) => x[0] === (tt.spare || "HOME_OFFSET"))[1];
    return `${exampleBanner()}
    <div class="intro"><h2>Blink check</h2><p class="muted">${retired() ? `Each plan against keeping things as they are, to age 100 (${H} years). Does the money last, and what's left in the home and in the bank?` : `Each plan against leaving the cash in the offset, over ${H} years.`} Broad numbers — enough to tell whether an idea is worth researching properly.</p></div>
    <div class="note-box base-explain"><b>${BASE_NAME}</b> — ${
      retired()
        ? `you buy nothing new and stay as you are (${state.home && state.home.has ? "in your home" : "renting"}), living on super, savings and the Age Pension.`
        : "you buy nothing new; savings and every spare dollar go into the home loan offset."
    } Every plan is measured against it: a plan has to end up ahead of ${BASE_NAME} to be worth the risk.</div>
    ${stopBanner(runs)}
    <div class="verdicts">${runs.map((r, i) => verdictCard(r, i, R.base)).join("")}</div>
    ${fullCard(R)}
    <div class="card">
      <div class="card-head"><h3>Compare one measure: ${esc(metric[1].toLowerCase())}</h3></div>
      <div class="chart-controls">
        <div class="chips">${LIST.map((m) => `<button type="button" class="chip" data-metric="${m[0]}" aria-pressed="${m[0] === metric[0]}">${esc(m[1])}</button>`).join("")}</div>
        <div class="chips">${runs
          .map((r, i) => `<label class="chip legend-chip" style="display:inline-flex;align-items:center"><input type="checkbox" data-show="${r.id}"${ui.hidden[r.id] ? "" : " checked"} style="accent-color:${SERIES[i]};width:18px;height:18px"> ${esc(r.baseline ? BASE_NAME : r.name)}</label>`)
          .join("")}</div>
        <p class="small muted">${esc(metric[3])}</p>
      </div>
      ${series.length ? chart("main", series, H, metric[0] === "homeRate" ? "rate" : "money") : `<p class="note-box">Tick a plan to show it.</p>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>Where the money comes from ${helpButton("moneyChain", "h-chain")}</h3></div>${helpPop("moneyChain", "h-chain")}
      ${planChips("chainPlan", ci)}
      ${ct.chains.length ? ct.chains.map(chainView).join("") : `<p class="note-box">${ct.baseline ? "No change buys nothing." : "This plan doesn't buy anything."}</p>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>In plain words — for ${retired() ? "an adviser or accountant" : "your accountant or broker"}</h3><button type="button" class="btn secondary" data-act="copy-words">Copy the words</button></div>
      <p class="small muted">What you're thinking about, written out. Copy it into an email, or ${STANDALONE ? "save a copy of this file and send that" : "copy your figures to share them"}.</p>
      <div id="plain-words" class="note-box" style="white-space:pre-wrap;max-width:75ch">${esc(plainWords(R))}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Year by year ${helpButton("topUp", "h-topup")}</h3></div>${helpPop("topUp", "h-topup")}
      ${planChips("tablePlan", ti)}
      <p class="small muted">Spare money: ${esc(spareText.charAt(0).toLowerCase() + spareText.slice(1))}. Money that's needed comes from savings, then the offsets.</p>
      ${yearTable(tt)}
    </div>
    ${navButtons("plans", "assume")}`;
  }

  function pageAssume() {
    const R = compute();
    const H = R.base.years.length;
    const rateSeries = [{ name: "Home loan rate", color: "var(--accent)", values: R.base.years.map((y) => y.homeRate) }];
    const years = Object.keys(E.CASH_RATE);
    const pctF = (k, label, hint, help) => numField("assumptions." + k, label, { hint, help });
    return `<div class="intro"><h2>Assumptions</h2><p class="muted">Sensible starting points for Australia, not forecasts. Change any of them; No change and every plan use the same ones.</p></div>
    <div class="card">
      <h3>Interest rates</h3>
      <div class="grid wide">
        ${selectField("assumptions.rateModel", "Rates over the years", [["CYCLE", "Rise and fall like the cycle since 2000"], ["FLAT", "Stay where they are"]], { help: "rateCycle" })}
        ${A("rateModel") === "CYCLE" ? selectField("assumptions.cycleStart", "Start the cycle as at", years.map((y) => [y, y]), { kind: "num" }) : ""}
        ${A("rateModel") === "CYCLE" ? selectField("assumptions.cycleScale", "How big the swings are", [[0.5, "Half of history"], [0.75, "Three-quarters"], [1, "Same as history"], [1.25, "A quarter bigger"], [1.5, "Half again bigger"]], { kind: "num" }) : ""}
      </div>
      ${chart("rates", rateSeries, H, "rate")}
      <p class="small muted">The cycle is the RBA cash rate's ups and downs since 2000 (yearly averages), with its long fall taken out, added to today's rates. Year 1 is always today's rate; 2008's peak and the 2020 low show up when the cycle reaches them.</p>
      <div class="grid">
        ${pctF("homeRate", "Home loan rate today (%)")}
        ${pctF("invRate", "Investment loan rate today (%)")}
        ${pctF("comRate", "Commercial loan rate today (%)")}
        ${pctF("ioPremium", "Extra for interest only (%)")}
        ${pctF("lrbaPremium", "Extra for an SMSF loan (%)")}
        ${pctF("minRate", "Lowest rate allowed (%)")}
        ${pctF("savingsRate", "Savings account rate (%)")}
      </div>
    </div>
    <div class="card"><h3>Growth</h3><div class="grid">
      ${pctF("resGrowth", "Residential values (% a year)")}${pctF("comGrowth", "Commercial values (% a year)")}
      ${pctF("resRentGrowth", "Residential rents (% a year)")}${pctF("comRentGrowth", "Commercial rents (% a year)")}
      ${numField("assumptions.wageGrowth", "Pay rises (% a year)", { placeholder: `Same as prices: ${A("cpi")}%`, hint: "Leave empty to keep pay in line with prices (CPI). Australian wages have grown about 3–3.5% a year over the long run." })}${pctF("cpi", "Living costs (% a year)")}
      ${pctF("shareGrowth", "Share prices (% a year)")}${pctF("shareYield", "Dividends (% a year)")}${pctF("franking", "Franked (% of dividends)", "", "franking")}
      ${pctF("superReturn", "Super returns after fees and tax (%)")}${pctF("superGuarantee", "Employer super (% of pay)")}
    </div></div>
    <div class="card"><h3>Running a property</h3><div class="grid">
      ${pctF("resVacancyWeeks", "Residential: weeks empty a year", "", "vacancy")}${pctF("comVacancyWeeks", "Commercial: weeks empty a year")}
      ${pctF("resCostPct", "Residential running costs (% of rent)")}${pctF("comCostPct", "Commercial running costs (% of rent)")}
      ${pctF("landPctRes", "Residential land value (% of price)", "For land tax.", "landTax")}${pctF("landPctCom", "Commercial land value (% of price)")}
    </div></div>
    <div class="card"><h3>Buying and selling</h3><div class="grid">
      ${selectField("assumptions.state", "Stamp duty and land tax", [["NSW", "NSW rates"], ["OTHER", "Another state (enter duty %)"]], { help: "duty" })}
      ${A("state") === "OTHER" ? pctF("dutyPctOther", "Stamp duty (% of price)", "Land tax isn't estimated outside NSW.") : ""}
      ${moneyField("assumptions.buyCostsRes", "Residential buying costs (legal, inspections)")}
      ${pctF("buyCostsComPct", "Commercial buying costs (% of price)")}
      ${pctF("sellCostsPct", "Selling costs (% of price)")}
      ${pctF("resLvr", "Bank lends on residential (% of price)")}${pctF("comLvr", "Bank lends on commercial (% of price)")}${pctF("smsfLvr", "Bank lends in an SMSF (% of price)")}
      ${pctF("maxLvr", "Most you'd borrow against a property (% of value)", "Used when borrowing the deposit from equity.", "lvr")}
    </div></div>
    <div class="card"><h3>Tax</h3>
      ${toggle("assumptions.negativeGearing", "Rental losses reduce tax on wages (negative gearing, today's rules)", "negativeGearing")}
      <p class="small muted">Untick to see a plan if that changed: losses are then carried forward to use against later rental profit and capital gains.</p>
      <div class="grid">
        ${pctF("buildingPctRes", "Residential building cost (% of price)", "The building write-off is 2.5% of this a year.", "depreciation")}
        ${pctF("buildingPctCom", "Commercial building cost (% of price)")}
        ${pctF("fittingsPct", "New-build fittings write-off (% of price, first year)", "Falls 20% a year. Second-hand residential fittings can't be claimed.")}
      </div>
      <p class="small muted">Resident tax rates for 2026-27 (15% bracket) and from 1 July 2027 (14%), with the 2% Medicare levy. Capital gains get the 50% discount after a year. Your home is exempt.</p>
    </div>
    ${retired() ? `<div class="card"><h3>Retirement</h3><div class="grid">
      ${pctF("pensionReturn", "Super pension returns after fees (%)", "Earnings in a super pension are tax-free.", "superPension")}
      ${pctF("homeRunPct", "A bought home's running costs (% of its value a year)", "Council rates, insurance, strata and upkeep.")}
      ${moneyField("assumptions.personalAssets", "Car, contents and other personal assets", { hint: "Counted in the Age Pension assets test.", help: "agePension" })}
    </div>
    <p class="small muted">Age Pension rates and thresholds are approximate figures from September 2025, rising with prices in later years; super pension minimums are 4% under 65, rising to 14% from 95. The home is never counted in the assets test.</p></div>` : ""}
    <div class="card"><h3>The lender's test</h3><div class="grid">
      ${pctF("assessBuffer", "Test rate: actual rate plus (%)", "", "serviceability")}${pctF("resShade", "Residential rent counted (%)")}${pctF("comShade", "Commercial rent counted (%)")}
      ${pctF("cardServicing", "Card limits counted (% a month)")}${moneyField("assumptions.smsfBuffer", "Cash to keep in the SMSF after buying")}
    </div></div>
    <div class="row"><button type="button" class="btn secondary" data-act="ask" data-key="assume">Go back to the starting assumptions</button></div>
    ${confirmBox("assume", "Undo every change on this page?", "reset-assume")}
    ${navButtons("check", null)}`;
  }

  // ---------------------------------------------------------------- help

  function rebuildGuide() {
    const el = document.getElementById("rebuild-guide");
    return el ? el.textContent.replace(/<\\\/script/gi, "</script").trim() : "";
  }

  function pageHelp() {
    const words = Object.entries(HELP).sort((a, b) => a[1][0].localeCompare(b[1][0]));
    const guide = rebuildGuide();
    return `<div class="intro"><h2>Help</h2><p class="muted">How to use Blink Check, what the results mean, and the words explained.</p></div>
    <div class="card help">
      <h3>What it's for</h3>
      <p>A quick check — a "blink" — on whether the next move is worth researching properly, or whether you're better off leaving the cash in the home loan offset.
        It runs your figures forward ${horizon()} years, month by month, with interest rates rising and falling, and compares each plan with doing nothing new.</p>
      <p>It's broad estimates, not advice. A plan that looks good here is one to take to your accountant, a broker and a licensed adviser — not one to sign up for.</p>
    </div>
    <div class="card help">
      <h3>How to use it</h3>
      <ol class="steps-list">
        <li><b>You</b> — incomes, living costs, credit card limits and other loan repayments. Rough round figures are fine.</li>
        <li><b>What you own</b> — your home and its loan and offset, any rentals, savings, shares and super.</li>
        <li><b>Plans</b> — up to three plans, each a list of steps: buy residential or commercial, buy through an SMSF, sell, buy shares, move money to an offset, switch a loan to principal and interest. Give each step a year.</li>
        <li><b>Blink check</b> — each plan's verdict, the charts, where the money comes from, and a summary in plain words for your accountant or broker.</li>
        <li><b>Assumptions</b> — rates, growth, costs, tax and the lender's test. Change any of them to see what happens.</li>
      </ol>
      <p><b>Talking it in:</b> tap a box, then the microphone on your phone's keyboard, and say the amount — "six hundred and fifty thousand", "1.2 million" or "580 a week" all work.</p>
      <p><b>Saving:</b> ${STANDALONE ? "your figures are kept in this browser as you go. To keep them in the file itself, or to send it to someone, use <b>Save a copy</b> at the top — it saves a new copy of this page with the figures inside. Untick names or notes first if you'd rather leave them out. <b>Start again</b> clears the plans or everything." : "in this view, use <b>Copy my figures</b> to keep them, and <b>Load figures</b> to bring them back. For a file you can keep and send, open the Blink Check HTML file instead."}</p>
      <p><b>Privacy:</b> nothing you type leaves this device. There are no accounts, no tracking and no uploads — the only thing the page loads from the internet is its fonts.</p>
    </div>
    <div class="card help">
      <h3>What the results mean</h3>
      <dl class="kv help-kv">
        <dt>Probably not possible on this income (red flag)</dt><dd>The plan would run the household out of money in some year — pay after tax can't cover living costs, the home loan and what the investments cost, and savings and offsets are used up — or a lender would very likely refuse one of the loans. The red box says which, with the figures.</dd>
        <dt>Worth a closer look</dt><dd>The plan ends well ahead of No change (by more than $50,000 or 5% of No change's net worth, whichever is bigger), never runs out of cash, and the borrowing check doesn't say "unlikely".</dd>
        <dt>Marginal</dt><dd>Ahead, but not by enough to be worth the extra risk and effort unless it suits your goals.</dd>
        <dt>Doesn't beat leaving the cash in the offset</dt><dd>Ends behind No change.</dd>
        <dt>Amber note: spends more than it earns</dt><dd>In some years the household spends more than it earns and dips into savings and offsets, but doesn't run out within the plan.</dd>
        <dt>Retired: money doesn't last (red flag)</dt><dd>Savings and super run out before the age you picked. The card shows the age, what's coming in and going out that year, and the most that plan could spend on a home and still have money at that age.</dd>
        <dt>Retired: home equity against cash and super</dt><dd>The top chart compares what's tied up in the home with the money there is to live on; the bottom one shows money coming in (Age Pension, super pension, interest) and what's left after living costs, rent and the home's running costs. Below the line means drawing on savings and super.</dd>
        <dt>Wealth, debt and cash flow</dt><dd>Two charts for one plan, with any others laid over it. The top one is what you own and owe (wealth solid, debt dashed). The bottom one is money each year: income before tax (dotted) and what the investments put in your pocket or cost you after tax (solid) — below the line costs you money. Slide to a year to compare the plans in words and in a table.</dd>
        <dt>Net worth compared with No change</dt><dd>How much better or worse off the plan leaves you at the end, against doing nothing new.</dd>
        <dt>Cash put in at purchase</dt><dd>Your own money used for deposits, stamp duty and costs.</dd>
        <dt>Yearly top-ups</dt><dd>${esc(HELP.topUp[1])}</dd>
        <dt>Worst year</dt><dd>${esc(HELP.worstYear[1])}</dd>
        <dt>Investments pay for themselves</dt><dd>The first year the investments put money in your pocket after tax, instead of needing top-ups.</dd>
        <dt>Borrowing peaks at</dt><dd>The highest total loans as a share of total property value. Above about 80% gets hard to refinance.</dd>
        <dt>Borrowing check</dt><dd>${esc(HELP.serviceability[1])} <i>Likely</i> means $6,000 a year or more to spare under that test; <i>tight</i> means just; <i>unlikely</i> means a lender would probably say no.</dd>
        <dt>Where the money comes from</dt><dd>${esc(HELP.moneyChain[1])}</dd>
        <dt>Year by year</dt><dd>Each year's values, loans, rent, costs, tax effect, top-ups, and where spare money went or needed money came from. "Overdrawn" means savings and offsets ran out — the plan can't be carried.</dd>
      </dl>
    </div>
    <div class="card help">
      <h3>Words explained</h3>
      <dl class="kv help-kv">${words.map(([k, [t, d]]) => `<dt id="word-${k}">${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>
    </div>
    <div class="card help">
      <h3>What it doesn't cover</h3>
      <ul>
        <li>It isn't financial, tax or credit advice, and it doesn't know your full situation.</li>
        <li>Stamp duty and land tax are NSW rules. For another state, enter a duty percentage under Assumptions; land tax isn't estimated there.</li>
        <li>No lenders mortgage insurance — keep borrowing at 80% or less of a property's value.</li>
        <li>Variable rates only — no fixed-rate periods.</li>
        <li>People own things in their own names. Trusts and companies aren't modelled.</li>
        <li>Super can't be spent before retirement; it's shown in net worth but never used to pay for anything outside an SMSF.</li>
        <li>Rents, growth and rates follow the assumptions smoothly — real life is lumpier, especially for commercial vacancies.</li>
        <li>Tax uses today's resident rates and rules. Negative gearing and the capital gains discount can change — untick negative gearing under Assumptions to see a plan without it.</li>
      </ul>
    </div>
    <div class="card help">
      <h3>Rebuilding or changing Blink Check</h3>
      <p>This page is a single file with everything inside it — the working-out, the pages and a full guide to how it's built. Anyone can use it, share it, or ask their own AI assistant (such as Claude) to change or rebuild it: give the assistant this file and the rebuild guide below.</p>
      ${guide ? `<div class="row">${STANDALONE ? `<button type="button" class="btn secondary" data-act="save-guide">Save the rebuild guide</button>` : ""}
        <button type="button" class="btn secondary" data-act="show-guide">${ui.showGuide ? "Hide the rebuild guide" : "Show the rebuild guide"}</button></div>
        ${ui.showGuide ? `<pre class="guide">${esc(guide)}</pre>` : ""}` : ""}
    </div>
    ${navButtons("assume", null)}`;
  }

  // ---------------------------------------------------------------- drawing

  const RENDER = { you: pageYou, own: pageOwn, plans: pagePlans, check: pageCheck, assume: pageAssume, help: pageHelp };

  function renderTools() {
    const tools = document.getElementById("tools");
    tools.innerHTML = `
      ${STANDALONE ? `<button type="button" class="btn" data-act="save-panel">Save a copy</button>` : `<button type="button" class="btn secondary" data-act="copy">Copy my figures</button>`}
      <button type="button" class="btn secondary" data-act="paste">Load figures</button>
      <button type="button" class="btn secondary" data-act="restart-panel">Start again</button>
      ${STANDALONE ? `<button type="button" class="btn secondary" data-act="print">Print</button>` : ""}`;
    document.getElementById("tabs").innerHTML = PAGES.map(
      ([id, label], i) => `<button type="button" class="tab" role="tab" data-go="${id}" aria-selected="${ui.page === id}"><b>${i + 1}</b>${label}</button>`
    ).join("") + `<button type="button" class="tab help-tab" role="tab" data-go="help" aria-selected="${ui.page === "help"}"><b>?</b>Help</button>`;
  }

  const tick = (id, label, on = true) => `<label class="toggle" for="${id}"><input type="checkbox" id="${id}"${on ? " checked" : ""}> ${label}</label>`;

  function panel() {
    let out = "";
    if (ui.message && !ui.panel) out += `<div class="banner example"><span>${esc(ui.message)}</span><button type="button" class="btn quiet" data-act="close-panel">OK</button></div>`;
    if (STANDALONE && unsaved() && !ui.panel && !state.example)
      out += `<div class="banner warn"><span>Your latest changes are only in this browser. Save a copy to keep them in the file, or to send it on.</span><button type="button" class="btn secondary" data-act="save-panel">Save a copy</button></div>`;
    if (ui.panel === "save")
      return `<div class="card"><h3>Save a copy</h3>
        <p class="small muted">Saves a new copy of this page with your figures inside it. Open it any time to carry on, or email it to someone — they open it in their browser and see what you see. Nothing is uploaded anywhere.</p>
        <div class="grid wide">${tick("save-names", "Names")}${tick("save-figures", "What we own and earn")}${tick("save-plans", "The plans")}${tick("save-notes", "Notes")}</div>
        <p class="small muted">Untick anything you'd rather leave out of this copy — for example names, before sending it to someone.</p>
        <div class="row"><button type="button" class="btn" data-act="save-copy">Save the copy</button>
          <button type="button" class="btn secondary" data-act="save-blank">Save a blank copy</button>
          <button type="button" class="btn secondary" data-act="close-panel">Cancel</button></div></div>` + out;
    if (ui.panel === "restart")
      return `<div class="card"><h3>Start again</h3>
        <p class="small muted">To keep what's here, save a copy first. Opening a blank copy is another way to start again.</p>
        <div class="row"><button type="button" class="btn danger" data-act="clear-plans">${BIN} Clear the plans, keep my figures</button>
          <button type="button" class="btn danger" data-act="fresh">${BIN} Clear everything</button>
          <button type="button" class="btn secondary" data-act="close-panel">Cancel</button></div></div>`;
    if (ui.panel === "paste")
      return `<div class="card"><h3>Load figures</h3><p class="small muted">Paste figures copied from Blink Check. They replace what's here.</p>
        <textarea id="paste-box" aria-label="Figures to load"></textarea>
        <div class="row"><button type="button" class="btn" data-act="load-paste">Load them</button><button type="button" class="btn secondary" data-act="close-panel">Cancel</button></div>
        ${ui.message ? `<p class="small" style="color:var(--danger)">${esc(ui.message)}</p>` : ""}</div>`;
    if (ui.panel === "copied")
      return `<div class="card"><h3>Your figures</h3><p class="small muted">${esc(ui.message)}</p><textarea id="copy-box" readonly aria-label="Your figures">${esc(JSON.stringify(state))}</textarea>
        <div class="row"><button type="button" class="btn secondary" data-act="close-panel">Done</button></div></div>`;
    return out;
  }

  function render(keepFocus) {
    const active = keepFocus ? document.activeElement : null;
    const focusId = active && active.id;
    const sel = active && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    renderTools();
    for (const id of Object.keys(RENDER)) {
      const el = document.querySelector(`section[data-page="${id}"]`);
      el.hidden = id !== ui.page;
      if (id === ui.page) el.innerHTML = panel() + RENDER[id]();
      else el.innerHTML = "";
    }
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange) {
          try {
            el.setSelectionRange(sel[0], sel[1]);
          } catch (e) {
            /* not a text box */
          }
        }
      }
    }
  }

  function go(page) {
    ui.page = page;
    ui.confirm = null;
    try {
      if (location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
    } catch (e) {
      location.hash = page;
    }
    render(false);
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------- editing

  function edited() {
    state.example = false;
    state.updatedAt = Date.now();
    save();
  }

  function readInput(el) {
    const kind = el.dataset.kind;
    const path = el.dataset.path;
    if (kind === "bool") return el.checked;
    if (kind === "text") return el.value;
    if (kind === "select") return el.value;
    const raw = el.value.trim();
    if (raw === "") return path.startsWith("assumptions.") || /writeOffAmount|lvr|ioYears|cashAmount|owners/.test(path) ? undefined : 0;
    const n = E.parseAmount(raw);
    return n === null ? NaN : n;
  }

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.cmp !== undefined) {
      ui.fullCompare[el.dataset.cmp] = el.checked;
      return render(true);
    }
    if (el.dataset && el.dataset.measure !== undefined) {
      ui.fullShow[el.dataset.measure] = el.checked;
      return render(true);
    }
    if (el.dataset && el.dataset.at !== undefined) return;
    if (el.dataset && el.dataset.show !== undefined) {
      ui.hidden[el.dataset.show] = !el.checked;
      render(true);
      return;
    }
    if (!el.dataset || !el.dataset.path) return;
    const v = readInput(el);
    const err = el.parentElement.querySelector(".err");
    if (typeof v === "number" && isNaN(v)) {
      el.classList.add("bad");
      if (!err) el.insertAdjacentHTML("afterend", `<span class="err">Couldn't read that — try 650000, 650k or "six hundred and fifty thousand".</span>`);
      return;
    }
    el.classList.remove("bad");
    if (err) err.remove();
    if (v === undefined) {
      const keys = el.dataset.path.split(".");
      const parent = keys.slice(0, -1).reduce((o, k) => (o ? o[k] : undefined), state);
      if (parent) delete parent[keys[keys.length - 1]];
    } else setPath(el.dataset.path, v);
    // A second owner's share follows the first's.
    const m = /^(rentals|scenarios\.\d+\.steps)\.(\d+)\.owners\.0$/.exec(el.dataset.path);
    if (m && typeof v === "number") setPath(el.dataset.path.replace(/0$/, "1"), Math.max(0, 100 - v));
    edited();
    render(true);
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.at !== undefined) {
      // Slide to a year: move the cursors and refresh the comparison, without redrawing the page (the slider keeps working mid-drag).
      ui.atYear = Number(el.value);
      const run0 = compute().runs[0];
      document.getElementById("at-label").textContent = retired() ? `Year ${el.value} · age ${run0.years[el.value - 1].age}` : `Year ${el.value}`;
      document.querySelectorAll('.chart-wrap[data-group="full"]').forEach((w) => {
        w.dataset.at = el.value - 1;
        placeCursor(w, el.value - 1);
      });
      document.getElementById("full-diff").innerHTML = fullDiff();
      return;
    }
    if (el.dataset && el.dataset.kind === "text" && el.dataset.path) {
      setPath(el.dataset.path, el.value);
      state.example = false;
      state.updatedAt = Date.now();
      save();
    }
  });

  function newStep(type, kind) {
    const plan = state.scenarios[ui.plan];
    const year = Math.min(horizon(), 1 + (plan.steps.length ? Math.max(...plan.steps.map((s) => +s.year || 1)) : 0));
    const s = { id: uid(), type, year };
    if (type === "BUY") Object.assign(s, { kind, price: kind === "COM" ? 800000 : 700000, funding: "EQUITY", loanType: kind === "COM" ? "PI" : "IO", ioYears: 5, writeOff: "BUILDING", name: kind === "COM" ? "Commercial purchase" : "Residential purchase" });
    if (type === "SMSF") Object.assign(s, { kind: "COM", price: 600000, name: "SMSF property" });
    if (type === "SELL") Object.assign(s, { target: (propertyChoices(plan, year)[0] || [""])[0], then: "PAY_DEBT" });
    if (type === "SHARES") Object.assign(s, { amount: 50000, funding: "CASH", loanType: "IO" });
    if (type === "OFFSET") Object.assign(s, { amount: 20000, to: "home" });
    if (type === "HOME") Object.assign(s, { price: 700000, name: "Home" });
    if (type === "PI") Object.assign(s, { target: (propertyChoices(plan, 99)[0] || ["home"])[0] });
    plan.steps.push(s);
  }

  async function copyFigures() {
    const text = JSON.stringify(state);
    try {
      await navigator.clipboard.writeText(text);
      ui.panel = "copied";
      ui.message = "Copied. Paste it into a message or note to keep it, or load it on another device with “Load figures”.";
    } catch (e) {
      ui.panel = "copied";
      ui.message = "Select all of this and copy it.";
    }
    render(false);
    const box = document.getElementById("copy-box");
    if (box && ui.message.startsWith("Select")) box.select();
  }

  /** What goes in a saved copy: everything, or with some parts left out (before sending it to someone). */
  function forSaving(opts) {
    const out = JSON.parse(JSON.stringify(state));
    const b = blank();
    if (!opts.names) out.people.forEach((p, i) => (p.name = `Person ${i + 1}`));
    if (!opts.figures) {
      for (const k of ["livingMonthly", "cardLimits", "otherRepayMonthly", "otherRepayYears", "cash", "home", "rentals", "shares", "smsf"]) out[k] = b[k];
      out.people.forEach((p) => {
        p.salary = 0;
        p.super = 0;
      });
      for (const sc of out.scenarios) sc.steps = sc.steps.filter((st) => st.type !== "SELL" || !/^r/.test(st.target || ""));
    }
    if (!opts.plans) out.scenarios = b.scenarios;
    if (!opts.notes) {
      delete out.notes;
      out.scenarios.forEach((sc) => delete sc.notes);
    }
    return out;
  }

  function download(figures, filename) {
    const html = PRISTINE.replace(
      /<script id="saved-figures" type="application\/json">[\s\S]*?<\/script>/,
      `<script id="saved-figures" type="application/json">${figures === null ? "null" : JSON.stringify(figures).replace(/</g, "\\u003c")}</script>`
    );
    saveBlob(html, "text/html", filename);
  }

  function saveBlob(text, type, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function saveCopy() {
    const opts = {
      names: document.getElementById("save-names").checked,
      figures: document.getElementById("save-figures").checked,
      plans: document.getElementById("save-plans").checked,
      notes: document.getElementById("save-notes").checked,
    };
    const everything = opts.names && opts.figures && opts.plans && opts.notes;
    const figures = forSaving(opts);
    const now = Date.now();
    figures.savedAt = now;
    figures.updatedAt = now;
    figures.fileId = everything ? state.fileId || uid() : uid();
    if (everything) {
      state.fileId = figures.fileId;
      state.savedAt = now;
      state.updatedAt = now;
      save();
    }
    const who = opts.names ? state.people.map((p) => p.name).filter(Boolean).join(" and ") : "";
    const date = new Date().toISOString().slice(0, 10);
    download(figures, `Blink Check${who ? " - " + who : ""} - ${date}.html`);
    ui.panel = null;
    ui.message = everything ? "Saved. The file has everything in it — keep it, or send it on." : "Saved, with the parts you unticked left out.";
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-go]");
    if (!t) return;
    const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.help) {
      ui.openHelp[d.help] = !ui.openHelp[d.help];
      return render(true);
    }
    if (d.chip) {
      setPath(d.chip, d.kind === "num" ? Number(d.value) : d.value);
      edited();
      return render(true);
    }
    if (d.plan !== undefined) {
      ui.plan = Number(d.plan);
      ui.confirm = null;
      return render(false);
    }
    if (d.metric) {
      ui.metric = d.metric;
      return render(true);
    }
    if (d.pick) {
      ui[d.pick] = Number(d.value);
      if (d.pick === "fullMain") {
        const r = compute().runs[ui.fullMain];
        if (r) delete ui.fullCompare[r.id];
        if (!Object.values(ui.fullCompare).some(Boolean) && !r.baseline) ui.fullCompare.base = true;
      }
      return render(true);
    }
    if (d.add) {
      newStep(d.add, d.kind);
      edited();
      return render(false);
    }
    const act = d.act;
    if (!act) return;
    if (act === "ask") ui.confirm = d.key;
    else if (act === "cancel-confirm") ui.confirm = null;
    else if (act === "example-retired" || act === "example-working") {
      state = act === "example-retired" ? exampleRetired() : example();
      state.updatedAt = Date.now();
      ui.plan = 1;
      ui.fullMain = 1;
      ui.fullCompare = { base: true };
      ui.atYear = 0;
      save();
    } else if (act === "fresh") {
      const stage = state.stage;
      state = blank();
      state.stage = stage;
      state.updatedAt = Date.now();
      ui.plan = 1;
      ui.confirm = null;
      ui.panel = null;
      save();
    } else if (act === "add-person") {
      state.people.push({ id: uid(), name: "", salary: 0, super: 0 });
      for (const r of state.rentals) r.owners = [50, 50];
      edited();
    } else if (act === "remove-person") {
      state.people.splice(1);
      for (const r of state.rentals) delete r.owners;
      ui.confirm = null;
      edited();
    } else if (act === "add-rental") {
      const n = state.rentals.length + 1;
      state.rentals.push({
        id: "r" + uid(), name: d.kind === "COM" ? `Commercial ${n}` : `Rental ${n}`, kind: d.kind, value: 0, costBase: 0, rentWeekly: 0,
        costPct: d.kind === "COM" ? D.comCostPct : D.resCostPct, writeOff: "BUILDING", owners: state.people.length > 1 ? [50, 50] : undefined,
        loan: { balance: 0, rate: d.kind === "COM" ? D.comRate : D.invRate, type: "PI", ioYears: 0, yearsLeft: 25, offset: 0 },
      });
      edited();
    } else if (act === "remove-rental") {
      const i = Number(ui.confirm.split("-")[1]);
      state.rentals.splice(i, 1);
      ui.confirm = null;
      edited();
    } else if (act === "add-plan") {
      state.scenarios.push({ id: "s" + uid(), name: `Plan ${plans().length + 1}`, spare: "HOME_OFFSET", steps: [] });
      ui.plan = state.scenarios.length - 1;
      edited();
    } else if (act === "copy-plan") {
      const src = state.scenarios[ui.plan];
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = "s" + uid();
      copy.name = src.name + " (copy)";
      copy.steps.forEach((s) => (s.id = uid()));
      state.scenarios.push(copy);
      ui.plan = state.scenarios.length - 1;
      edited();
    } else if (act === "remove-plan") {
      state.scenarios.splice(ui.plan, 1);
      ui.plan = Math.max(0, Math.min(ui.plan, state.scenarios.length - 1));
      ui.confirm = null;
      edited();
    } else if (act === "remove-step") {
      const [, pi, sid] = ui.confirm.split("-");
      const plan = state.scenarios[Number(pi)];
      plan.steps = plan.steps.filter((s) => s.id !== sid);
      ui.confirm = null;
      edited();
    } else if (act === "reset-assume") {
      state.assumptions = { horizon: state.assumptions.horizon };
      ui.confirm = null;
      edited();
    } else if (act === "copy") return void copyFigures();
    else if (act === "copy-words") {
      const text = document.getElementById("plain-words").textContent;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          t.textContent = "Copied";
        })
        .catch(() => {
          const r = document.createRange();
          r.selectNodeContents(document.getElementById("plain-words"));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        });
      return;
    }
    else if (act === "paste") {
      ui.panel = "paste";
      ui.message = "";
    } else if (act === "close-panel") {
      ui.panel = null;
      ui.message = "";
    }
    else if (act === "load-paste") {
      try {
        const s = JSON.parse(document.getElementById("paste-box").value);
        if (!s || !Array.isArray(s.people) || !Array.isArray(s.scenarios)) throw new Error("x");
        state = s;
        state.updatedAt = Date.now();
        ui.panel = null;
        ui.plan = 1;
        ui.message = "";
        save();
      } catch (err) {
        ui.message = "Those aren't Blink Check figures — copy them again with “Copy my figures”.";
      }
    } else if (act === "save-panel") {
      ui.panel = "save";
      ui.message = "";
    } else if (act === "save-copy") saveCopy();
    else if (act === "save-blank") {
      download(null, "Blink Check - blank.html");
      ui.panel = null;
      ui.message = "Saved a blank copy.";
    } else if (act === "restart-panel") {
      ui.panel = "restart";
      ui.message = "";
    } else if (act === "clear-plans") {
      state.scenarios = blank().scenarios;
      ui.plan = 1;
      ui.panel = null;
      edited();
    } else if (act === "print") return window.print();
    else if (act === "save-guide") return saveBlob(rebuildGuide() + "\n", "text/markdown", "Blink Check - rebuild guide.md");
    else if (act === "show-guide") ui.showGuide = !ui.showGuide;
    render(act === "ask" || act === "cancel-confirm");
  });

  // Chart hover: the values for the year under the pointer. Linked charts move their cursors together;
  // when the pointer leaves, a chart with a chosen year puts its cursor back there.
  function placeCursor(w, i) {
    const data = chartData[w.dataset.chart];
    const c = w.querySelector(".cursor");
    if (!data || !c) return;
    if (i === null || i === undefined || i === "") return c.setAttribute("visibility", "hidden");
    c.setAttribute("x1", data.x(+i));
    c.setAttribute("x2", data.x(+i));
    c.setAttribute("visibility", "visible");
  }
  document.addEventListener("pointermove", (e) => {
    const wrap = e.target.closest && e.target.closest(".chart-wrap");
    const group = wrap && wrap.dataset.group;
    document.querySelectorAll(".chart-wrap").forEach((w) => {
      if (w === wrap || (group && w.dataset.group === group)) return;
      const tip = w.querySelector(".tip");
      if (tip) tip.hidden = true;
      placeCursor(w, w.dataset.at);
    });
    if (!wrap) return;
    const data = chartData[wrap.dataset.chart];
    const svg = wrap.querySelector("svg");
    if (!data || !svg) return;
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * data.W;
    const i = Math.max(0, Math.min(data.H - 1, Math.round(((vx - data.pl) / (data.W - data.pl - data.pr)) * (data.H - 1))));
    placeCursor(wrap, i);
    if (group) document.querySelectorAll(`.chart-wrap[data-group="${group}"]`).forEach((w) => w !== wrap && placeCursor(w, i));
    const tip = wrap.querySelector(".tip");
    const fmt = (v) => (data.fmt === "rate" ? v.toFixed(2) + "%" : money(v));
    tip.innerHTML = `<b>${yearLabel(i + 1)}</b>` + data.series.map((s) => `<div><span class="legend-chip"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span><span>${fmt(s.values[i])}</span></div>`).join("");
    tip.hidden = false;
    const left = (data.x(i) / data.W) * box.width;
    const room = box.width - tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(room, left > box.width / 2 ? left - tip.offsetWidth - 12 : left + 12)) + "px";
    tip.style.top = "8px";
  });

  // Charts are drawn for the screen width; redraw if it crosses the phone/desktop line.
  let wasNarrow = window.innerWidth < 600;
  window.addEventListener("resize", () => {
    const narrow = window.innerWidth < 600;
    if (narrow !== wasNarrow) {
      wasNarrow = narrow;
      render(true);
    }
  });

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (RENDER[h] && h !== ui.page) go(h);
  });

  const start = location.hash.slice(1);
  if (RENDER[start]) ui.page = start;
  render(false);
})();
