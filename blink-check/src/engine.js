/*
 * Blink Check engine: given what a household owns and a plan (buy, sell,
 * shares, SMSF…), works out month by month over 10–30 years what happens to
 * its loans, offsets, cash, property, shares, super and tax — and compares
 * each plan with simply leaving the cash in the offset.
 *
 * Pure functions, no page code, so it can be tested on its own. Broad
 * numbers: general information for deciding what's worth researching, not
 * advice.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------
  // Tax (resident individual), NSW stamp duty and land tax — the same
  // figures Financial Vault uses (ATO resident rates, Revenue NSW).
  // ---------------------------------------------------------------------

  // [income from, tax at that point, rate above it]
  const BRACKETS = {
    2026: [
      [0, 0, 0],
      [18200, 0, 0.15],
      [45000, 4020, 0.3],
      [135000, 31020, 0.37],
      [190000, 51370, 0.45],
    ],
    // From 1 July 2027 the 16% rate becomes 14% (legislated).
    2027: [
      [0, 0, 0],
      [18200, 0, 0.14],
      [45000, 3752, 0.3],
      [135000, 30752, 0.37],
      [190000, 51102, 0.45],
    ],
  };
  const MEDICARE = 0.02;
  const MEDICARE_THRESHOLD = 27222;

  function bracketsFor(calendarYear) {
    return calendarYear >= 2027 ? BRACKETS[2027] : BRACKETS[2026];
  }

  /** Income tax plus Medicare levy on a resident's taxable income. */
  function individualTax(taxable, calendarYear) {
    if (!(taxable > 0)) return 0;
    const brackets = bracketsFor(calendarYear || 2026);
    let b = brackets[0];
    for (const x of brackets) if (taxable > x[0]) b = x;
    const medicare = taxable <= MEDICARE_THRESHOLD ? 0 : Math.min(taxable * MEDICARE, (taxable - MEDICARE_THRESHOLD) * 0.1);
    return b[1] + (taxable - b[0]) * b[2] + medicare;
  }

  // NSW transfer duty, 2026-27 general rates; premium duty for residential.
  const DUTY = [
    [0, 0, 1.25],
    [18000, 225, 1.5],
    [38000, 525, 1.75],
    [103000, 1662, 3.5],
    [387000, 11602, 4.5],
    [1290000, 52237, 5.5],
  ];
  const DUTY_PREMIUM = [3870000, 194137, 7];

  function nswDuty(value, residential) {
    if (!(value > 0)) return 0;
    const bands = residential ? DUTY.concat([DUTY_PREMIUM]) : DUTY;
    let band = bands[0];
    for (const b of bands) if (value > b[0]) band = b;
    return Math.max(20, Math.round(band[1] + ((value - band[0]) / 100) * band[2]));
  }

  /** NSW land tax for one owner's combined taxable land value (general threshold, frozen from 2025). */
  function nswLandTax(totalLandValue) {
    const v = Math.max(0, totalLandValue);
    if (v <= 1075000) return 0;
    if (v <= 6571000) return 100 + (v - 1075000) * 0.016;
    return 88036 + (v - 6571000) * 0.02;
  }

  // ---------------------------------------------------------------------
  // Retirement: Age Pension (Services Australia), super pension minimum
  // drawdowns and the seniors tax offset. Approximate rates as at
  // September 2025 — check them each year. Indexed with CPI in the plan.
  // ---------------------------------------------------------------------

  const AGE_PENSION = {
    pensionAge: 67,
    maxSingle: 30646, // a year: $1,178.70 a fortnight with supplements
    maxCouple: 46202, // a year, combined: $1,777.00 a fortnight
    assetsHomeowner: [321500, 481500], // [single, couple]
    assetsNonHomeowner: [579500, 739500],
    assetsTaper: 78, // $ a year less for each $1,000 over ($3 a fortnight)
    incomeFree: [5668, 9880], // $218 / $380 a fortnight
    incomeTaper: 0.5, // 50c in the dollar (single; couple combined)
    deemLow: 0.0075,
    deemHigh: 0.0275,
    deemThreshold: [64200, 106200],
  };

  /**
   * Age Pension a year (combined for a couple). eligible = how many people are pension age.
   * assets: assessable assets (not the home). financial: the deemed part (cash, offsets, super, shares).
   * otherIncome: work and net rent a year. index: CPI growth since today (1 = today's rates).
   */
  function agePension(o) {
    if (!o.eligible) return 0;
    const k = o.couple ? 1 : 0;
    const ix = o.index || 1;
    const P = AGE_PENSION;
    const max = (o.couple ? P.maxCouple : P.maxSingle) * ix;
    const threshold = (o.homeowner ? P.assetsHomeowner : P.assetsNonHomeowner)[k] * ix;
    const byAssets = max - (Math.max(0, o.assets - threshold) / 1000) * P.assetsTaper;
    const deemTop = P.deemThreshold[k] * ix;
    // Home-sale money set aside for a new home is deemed at the lower rate only.
    const deemed = Math.min(o.financial, deemTop) * P.deemLow + Math.max(0, o.financial - deemTop) * P.deemHigh + (o.lowDeemed || 0) * P.deemLow;
    const byIncome = max - Math.max(0, deemed + (o.otherIncome || 0) - P.incomeFree[k] * ix) * P.incomeTaper;
    const rate = Math.max(0, Math.min(max, byAssets, byIncome));
    return o.couple ? (rate * Math.min(2, o.eligible)) / 2 : rate;
  }

  // Minimum yearly payment from a super pension, by age (% of the balance on 1 July).
  const MIN_DRAW = [[65, 4], [75, 5], [80, 6], [85, 7], [90, 9], [95, 11], [Infinity, 14]];
  function minDrawRate(age) {
    for (const [under, pct] of MIN_DRAW) if (age < under) return pct / 100;
    return 0.14;
  }

  /** Seniors and pensioners tax offset (SAPTO), for one person of pension age. */
  function sapto(taxable, couple) {
    const [max, from] = couple ? [1602, 30994] : [2230, 34919];
    return Math.max(0, max - Math.max(0, taxable - from) * 0.125);
  }

  /** Monthly repayment on a principal-and-interest loan. */
  function pmt(annualRate, months, balance) {
    if (!(balance > 0) || !(months > 0)) return 0;
    const r = annualRate / 12;
    if (r <= 0) return balance / months;
    return (balance * r) / (1 - Math.pow(1 + r, -months));
  }

  /** Months to clear a P&I loan paying `payment`, with `offset` against it, at a fixed rate. */
  function monthsToClear(balance, offset, annualRate, payment) {
    let b = balance;
    let m = 0;
    while (b > offset && m < 1200) {
      const interest = Math.max(0, b - offset) * (annualRate / 12);
      b -= payment - interest;
      m++;
    }
    return m;
  }

  // ---------------------------------------------------------------------
  // Interest rates: the shape of the RBA cash rate cycle since 2000 (yearly
  // averages, approximate), with its long downward drift taken out, applied
  // to today's rates. Year 1 is always today's rate.
  // ---------------------------------------------------------------------

  const CASH_RATE = {
    2000: 5.85, 2001: 4.95, 2002: 4.55, 2003: 4.8, 2004: 5.25, 2005: 5.45, 2006: 5.8, 2007: 6.4, 2008: 6.75,
    2009: 3.25, 2010: 4.35, 2011: 4.7, 2012: 3.95, 2013: 2.85, 2014: 2.5, 2015: 2.15, 2016: 1.7, 2017: 1.5,
    2018: 1.5, 2019: 1.1, 2020: 0.35, 2021: 0.1, 2022: 1.35, 2023: 3.95, 2024: 4.35, 2025: 3.85,
  };
  const CYCLE_YEARS = Object.keys(CASH_RATE).map(Number);
  const CYCLE = (() => {
    const xs = CYCLE_YEARS;
    const ys = xs.map((y) => CASH_RATE[y]);
    const n = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    return ys.map((y, i) => y - (my + slope * (xs[i] - mx))); // the cycle, without the drift
  })();

  /** How much rates are above (+) or below (−) today's, for each year of the plan, in percentage points. */
  function rateShifts(a, years) {
    const out = [];
    const start = Math.max(0, CYCLE_YEARS.indexOf(Number(a.cycleStart)));
    for (let y = 0; y < years; y++) {
      if (a.rateModel !== "CYCLE") out.push(0);
      else out.push((CYCLE[(start + y) % CYCLE.length] - CYCLE[start]) * (a.cycleScale ?? 1));
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Defaults
  // ---------------------------------------------------------------------

  const DEFAULT_ASSUMPTIONS = {
    horizon: 20,
    startYear: new Date().getFullYear(),
    state: "NSW",
    dutyPctOther: 4.5, // % of price outside NSW
    rateModel: "CYCLE",
    cycleStart: 2000,
    cycleScale: 1,
    minRate: 2,
    homeRate: 5.8,
    invRate: 6.2,
    comRate: 7.2,
    ioPremium: 0.4,
    lrbaPremium: 1.2,
    savingsRate: 4,
    cpi: 2.75,
    wageGrowth: null, // % a year; null = in line with CPI (prices)
    resGrowth: 5,
    comGrowth: 3,
    resRentGrowth: 3.5,
    comRentGrowth: 3,
    resVacancyWeeks: 2,
    comVacancyWeeks: 6,
    resCostPct: 25, // of rent: rates, insurance, repairs, management
    comCostPct: 12, // of rent: what a net lease leaves the owner
    landPctRes: 55,
    landPctCom: 45,
    buyCostsRes: 4000,
    buyCostsComPct: 1.5,
    sellCostsPct: 2.5,
    maxLvr: 80, // for borrowing against equity
    resLvr: 80,
    comLvr: 70,
    smsfLvr: 70,
    shareGrowth: 4.5,
    shareYield: 3.5,
    franking: 70,
    superReturn: 6.5,
    superGuarantee: 12,
    assessBuffer: 3,
    resShade: 80,
    comShade: 75,
    smsfBuffer: 30000,
    negativeGearing: true, // rental losses reduce wage tax; off = carried forward to later rental profit and gains
    cardServicing: 3.8, // % of card limits a month that lenders count
    buildingPctRes: 40, // construction cost as % of price, for the 2.5% building write-off
    buildingPctCom: 50,
    fittingsPct: 1, // new-build fittings write-off, % of price in year 1, falling 20% a year
    // Retirement
    lastUntil: 95, // money should last until this age (the younger person's)
    pensionReturn: 6.5, // super in pension phase, after fees (earnings are tax-free)
    homeRunPct: 1, // a home bought in the plan: rates, insurance, upkeep, % of value a year
    personalAssets: 20000, // car, contents — counted in the Age Pension assets test
  };

  /** The yearly tax write-off (depreciation) for a property: none, building only, or building + fittings (new). */
  function writeOff(p, yearsHeld, a) {
    if (p.writeOffAmount !== undefined && p.writeOffAmount !== null && p.writeOffAmount !== "") return +p.writeOffAmount || 0;
    const mode = p.writeOff || "NONE";
    if (mode === "NONE") return 0;
    const price = p.writeOffBase || p.value;
    const building = (price * (p.kind === "COM" ? a.buildingPctCom : a.buildingPctRes)) / 100;
    let total = yearsHeld < 40 ? building * 0.025 : 0;
    if (mode === "NEW") total += ((price * a.fittingsPct) / 100) * Math.pow(0.8, Math.max(0, yearsHeld));
    return total;
  }

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------

  const round = (n) => Math.round(n);
  const positive = (n) => Math.max(0, n);

  /**
   * A retiree's plan is a short form rather than a list of steps:
   * { home, price, year, payFrom: "SAVINGS"|"SUPER", leftover: "BANK"|"SUPER"|"SHARES"|"OFFSET", loan, keep, downsizer, draw: "MIN"|"EARNINGS"|"SET", drawAmount }.
   * This turns it into the steps the simulation runs.
   */
  function retiredSteps(R) {
    const out = [];
    const year = R.home ? Math.max(1, +R.year || 1) : 1;
    if (R.home && +R.price > 0) out.push({ id: "home-buy", type: "HOME", year, price: +R.price, name: R.homeName || "Home", keep: R.keep, payFrom: R.payFrom, loan: R.leftover === "OFFSET" ? +R.loan || 0 : 0 });
    if (R.leftover && R.leftover !== "BANK") out.push({ id: "move", type: "MOVE", year, to: R.leftover, keep: R.keep, downsizer: !!R.downsizer });
    return out;
  }

  function simulate(plan, scenario) {
    const a = Object.assign({}, DEFAULT_ASSUMPTIONS, plan.assumptions || {});
    const retired = plan.stage === "RETIRED";
    const RP = retired && scenario.retire ? scenario.retire : null;
    const planSteps = RP ? retiredSteps(RP) : scenario.steps || [];
    const ages0 = (plan.people || []).filter((p) => p && p.name !== undefined).map((p) => +p.age || (retired ? 67 : 40));
    const youngest0 = ages0.length ? Math.min(...ages0) : retired ? 67 : 40;
    // Retired: run until the younger person is 100 (10–40 years), to see how long the money lasts.
    const H = retired ? Math.max(10, Math.min(40, 100 - youngest0 + 1)) : Math.max(5, Math.min(30, Number(a.horizon) || 20));
    const shifts = rateShifts(a, H);
    const wageGrowth = a.wageGrowth === null || a.wageGrowth === undefined || a.wageGrowth === "" ? a.cpi : +a.wageGrowth;
    const people = (plan.people || []).filter((p) => p && p.name !== undefined);
    if (!people.length) people.push({ id: "p1", name: "You", salary: 0, super: 0 });
    const nP = people.length;
    const evenOwners = people.map(() => 100 / nP);
    const ownersOf = (o) => (Array.isArray(o) && o.length === nP && o.some((x) => x > 0) ? o.map(Number) : evenOwners);

    let loanSeq = 0;
    const props = [];
    const loans = [];
    const flags = [];
    const chains = [];

    function addLoan(spec) {
      const L = Object.assign(
        { id: "L" + ++loanSeq, balance: 0, offset: 0, type: "PI", ioLeft: 0, termLeft: 360, deductible: false, smsf: false, paidOff: null, interestYear: 0, interestTotal: 0, payYear: 0 },
        spec
      );
      L.rate = L.rateToday;
      L.payment = L.type === "IO" && L.ioLeft > 0 ? 0 : pmt(L.rate / 100, L.termLeft, L.balance);
      loans.push(L);
      return L;
    }
    const active = (L) => L.balance > 0.5 && !L.paidOff;
    const mainLoanOf = (propId) => loans.find((L) => L.prop === propId && L.forProp === propId && active(L));

    // --- What's owned today ------------------------------------------------
    const home = plan.home || {};
    if (home.has && home.value > 0) {
      props.push({ id: "home", name: "Home", kind: "RES", home: true, value: +home.value, costBase: +home.value, owners: evenOwners, growth: a.resGrowth, landPct: a.landPctRes });
      if (home.loan && home.loan.balance > 0) {
        addLoan({
          name: "Home loan", prop: "home", forProp: "home", balance: +home.loan.balance, offset: +home.loan.offset || 0,
          rateToday: +home.loan.rate || a.homeRate, type: home.loan.type === "IO" ? "IO" : "PI",
          ioLeft: (home.loan.type === "IO" ? +home.loan.ioYears || 5 : 0) * 12, termLeft: (+home.loan.yearsLeft || 25) * 12,
        });
      }
    }
    (plan.rentals || []).forEach((r, i) => {
      if (!(r.value > 0)) return;
      const id = r.id || "r" + (i + 1);
      const kind = r.kind === "COM" ? "COM" : "RES";
      props.push({
        id, name: r.name || (kind === "COM" ? "Commercial property" : "Rental property"), kind, value: +r.value,
        costBase: +r.costBase || +r.value, owners: ownersOf(r.owners), rentWeekly: +r.rentWeekly || 0,
        costPct: r.costPct ?? (kind === "COM" ? a.comCostPct : a.resCostPct), writeOff: r.writeOff || "NONE", writeOffAmount: r.writeOffAmount, writeOffBase: +r.value,
        growth: kind === "COM" ? a.comGrowth : a.resGrowth, landPct: kind === "COM" ? a.landPctCom : a.landPctRes, boughtMonth: -24,
      });
      if (r.loan && r.loan.balance > 0) {
        addLoan({
          name: (r.name || "Rental") + " loan", prop: id, forProp: id, balance: +r.loan.balance, offset: +r.loan.offset || 0,
          rateToday: +r.loan.rate || (kind === "COM" ? a.comRate : a.invRate), type: r.loan.type === "IO" ? "IO" : "PI",
          ioLeft: (r.loan.type === "IO" ? +r.loan.ioYears || 5 : 0) * 12, termLeft: (+r.loan.yearsLeft || 25) * 12, deductible: true,
        });
      }
    });

    let cash = +plan.cash || 0;
    const shares = { value: +((plan.shares || {}).value) || 0, costBase: +((plan.shares || {}).costBase) || +((plan.shares || {}).value) || 0 };
    const superBal = people.map((p) => +p.super || 0);
    const living0 = (+plan.livingMonthly || 0) * 12;
    const otherRepay = (+plan.otherRepayMonthly || 0) * 12;
    const otherRepayYears = +plan.otherRepayYears || 0;
    const cardLimits = +plan.cardLimits || 0;
    const carried = people.map(() => 0); // rental losses carried forward when negative gearing is off
    const ages = people.map((p) => +p.age || (retired ? 67 : 40));
    const ageOf = (i) => ages[i] + year - 1;
    const couple = nP > 1;
    let renting = retired && !(home.has && home.value > 0);
    let rentYear = (+plan.rentWeekly || 0) * 52;
    let drawYear = people.map(() => 0); // this year's super pension payments, per person
    let pensionYear = 0; // this year's Age Pension, combined
    const superTotalNow = () => superBal.reduce((s, b) => s + b, 0);
    // Home-sale money kept to buy another home: left out of the Age Pension assets test for 24 months from the sale
    // (while renting). From the sale date and today's date, work out how many months of that are left.
    const ym = (v) => {
      const m = /^(\d{4})-(\d{1,2})/.exec(String(v || ""));
      return m ? { y: +m[1], m: +m[2] } : null;
    };
    const now = new Date();
    const today = ym(plan.today) || { y: now.getFullYear(), m: now.getMonth() + 1 };
    const sold = ym(plan.saleDate);
    const exemptMonths = !(+plan.saleExempt > 0) ? 0 : sold ? Math.max(0, 24 - ((today.y - sold.y) * 12 + (today.m - sold.m))) : +plan.saleExemptMonths || 0;
    const exemptEnd = new Date(today.y, today.m - 1 + exemptMonths, 1);
    const exemptEndLabel = exemptEnd.toLocaleString("en-AU", { month: "long", year: "numeric" });
    let exemption = null; // { month, before, after } once it has ended while still renting

    function updatePension() {
      const T = totalsNow();
      const investProps = liveProps().filter((p) => !p.home && !p.smsf);
      const assets = T.cash + T.offsets + T.superTotal + T.shares + investProps.reduce((x, p) => x + p.value, 0) + a.personalAssets;
      let financial = T.cash + T.offsets + T.superTotal + T.shares;
      const exempt = renting && month < exemptMonths ? Math.min(+plan.saleExempt || 0, Math.max(0, T.cash + T.offsets)) : 0;
      financial -= exempt;
      const netRent = investProps.reduce((x, p) => x + (p.rentNow || 0) * (1 - (p.costPct || 0) / 100), 0);
      pensionYear = agePension({
        couple,
        eligible: people.filter((p, i) => ageOf(i) >= AGE_PENSION.pensionAge).length,
        homeowner: !renting && liveProps().some((p) => p.home),
        assets: Math.max(0, assets - exempt),
        financial: Math.max(0, financial),
        lowDeemed: exempt, // deemed at the lower rate only
        otherIncome: salaries.reduce((x, v) => x + v, 0) + netRent,
        index: Math.pow(1 + a.cpi / 100, year - 1),
      });
    }
    function noteExemptionEnd(before) {
      if (exemptMonths > 0 && renting && !exemption) {
        exemption = { month: exemptMonths, label: exemptEndLabel, before: round(before), after: round(pensionYear) };
        yr.events.push("Home-sale money starts to count for the Age Pension");
      }
    }

    function takeFromSuper(amount) {
      const t = superTotalNow();
      const take = Math.min(Math.max(0, t), amount);
      if (take > 0) superBal.forEach((b, i) => (superBal[i] -= (take * b) / t));
      return take;
    }

    // --- Helpers ---------------------------------------------------------------
    const debtOn = (propId) => loans.filter((L) => L.prop === propId && active(L)).reduce((s, L) => s + L.balance, 0);
    const usableEquity = (p) => positive(p.value * (a.maxLvr / 100) - debtOn(p.id));
    const liveProps = () => props.filter((p) => !p.sold);
    const reserve = () => Math.max(20000, (living0 / 4) * Math.pow(1 + a.cpi / 100, year - 1)); // three months of living costs
    const offsetsTotal = () => loans.filter((L) => !L.smsf).reduce((s, L) => s + (active(L) ? L.offset : 0), 0);

    let month = 0;
    let year = 1;
    let yr = null; // this year's running totals

    function newYearTotals() {
      return {
        interest: 0, interestSaved: 0, rent: 0, costs: 0, landTax: 0, propCash: {}, shareCash: 0, dividends: 0, savingsInterest: 0,
        takeHome: 0, living: 0, payg: 0, homePay: 0, gains: people.map(() => 0), sentTo: { homeOffset: 0, ownOffset: 0, otherOffset: 0, cash: 0, payDown: 0 },
        drawnFrom: { cash: 0, offsets: 0, super: 0, overdrawn: 0 }, upfrontCash: 0, events: [], taxSettle: 0, smsfIncome: 0,
        agePension: 0, superDraw: 0, rentPaid: 0, homeCosts: 0,
      };
    }

    /** Where spare money goes under this scenario's rule. Returns the loan whose offset takes it, or null for cash. */
    function spareTarget(propId) {
      const rule = scenario.spare || "HOME_OFFSET";
      // A loan its offset already covers costs no interest: more money there does nothing.
      const open = loans.filter((L) => active(L) && !L.smsf && L.offset < L.balance - 0.5);
      if (rule === "CASH") return null;
      if (rule === "OWN_OFFSET" && propId) {
        const own = mainLoanOf(propId);
        if (own) return own;
      }
      if (rule === "HIGHEST_RATE") return open.sort((x, y) => y.rate - x.rate)[0] || null;
      // Home loan first; otherwise the loans that aren't tax-deductible, then the dearest.
      const homeLoan = open.find((L) => L.prop === "home" && L.forProp === "home");
      if (homeLoan) return homeLoan;
      return open.sort((x, y) => Number(x.deductible) - Number(y.deductible) || y.rate - x.rate)[0] || null;
    }

    function putAway(amount, propId) {
      if (!(amount > 0)) return;
      const L = spareTarget(propId);
      if (!L) {
        cash += amount;
        yr.sentTo.cash += amount;
        return;
      }
      L.offset += amount;
      if (L.prop === "home" && L.forProp === "home") yr.sentTo.homeOffset += amount;
      else if (propId && L.forProp === propId) yr.sentTo.ownOffset += amount;
      else yr.sentTo.otherOffset += amount;
    }

    /** Takes money from savings, then offsets (home first). Returns how much couldn't be found. */
    function draw(amount, opts) {
      let need = amount;
      const fromCash = Math.min(positive(cash), need);
      cash -= fromCash;
      need -= fromCash;
      yr.drawnFrom.cash += fromCash;
      const order = loans
        .filter((L) => !L.smsf && L.offset > 0)
        .sort((x, y) => Number(y.prop === "home") - Number(x.prop === "home") || x.rate - y.rate);
      for (const L of order) {
        if (need <= 0) break;
        const take = Math.min(L.offset, need);
        L.offset -= take;
        need -= take;
        yr.drawnFrom.offsets += take;
      }
      if (need > 0 && retired) {
        const take = takeFromSuper(need);
        need -= take;
        yr.drawnFrom.super += take;
      }
      if (need > 0 && !(opts && opts.noOverdraw)) {
        cash -= need;
        yr.drawnFrom.overdrawn += need;
      }
      return need;
    }

    function clearLoan(L, why) {
      if (L.offset > 0) {
        const left = L.offset - L.balance;
        L.offset = 0;
        L.balance = 0;
        L.paidOff = { year, why };
        if (left > 0) putAway(left, L.forProp);
      } else {
        L.balance = 0;
        L.paidOff = { year, why };
      }
      yr.events.push(`${L.name} paid off`);
    }

    function repriceLoan(L) {
      L.rate = Math.max(a.minRate, L.rateToday + (shifts[year - 1] || 0));
      if (!(L.type === "IO" && L.ioLeft > 0)) L.payment = pmt(L.rate / 100, Math.max(1, L.termLeft), L.balance);
    }

    function totalsNow() {
      const live = liveProps();
      const value = live.filter((p) => !p.smsf).reduce((s, p) => s + p.value, 0);
      const debt = loans.filter((L) => !L.smsf && active(L)).reduce((s, L) => s + L.balance, 0);
      const offsets = offsetsTotal();
      const smsfProp = live.filter((p) => p.smsf).reduce((s, p) => s + p.value, 0);
      const smsfDebt = loans.filter((L) => L.smsf && active(L)).reduce((s, L) => s + L.balance, 0);
      const superTotal = superBal.reduce((s, b) => s + b, 0) + smsfProp - smsfDebt;
      // Money that can be spent: savings and offsets, plus super once retired.
      const liquid = cash + offsets + (retired ? superBal.reduce((s, b) => s + b, 0) : 0);
      const homes = live.filter((p) => p.home);
      const homeValue = homes.reduce((s, p) => s + p.value, 0);
      const homeDebt = loans.filter((L) => !L.smsf && active(L) && homes.some((p) => p.id === L.prop)).reduce((s, L) => s + L.balance - Math.min(L.offset, L.balance), 0);
      const nwExSuper = value + shares.value + cash + offsets - debt;
      return { value, debt, offsets, cash, liquid, shares: shares.value, superTotal, nwExSuper, nw: nwExSuper + superTotal, equity: value - debt + offsets, homeValue, homeEquity: homeValue - homeDebt };
    }

    // Borrowing check, as a lender might: rates plus a buffer, rents shaded, every loan at P&I.
    function borrowingCheck(salaries) {
      const live = liveProps().filter((p) => !p.home && !p.smsf);
      const gross = people.map((p, i) => salaries[i]);
      for (const p of live) {
        const rent = (p.rentNow ?? p.rentWeekly * 52) * ((p.kind === "COM" ? a.comShade : a.resShade) / 100);
        p.owners.forEach((o, i) => (gross[i] += (rent * o) / 100));
      }
      const net = gross.reduce((s, g) => s + g - individualTax(g, a.startYear + year - 1), 0);
      const commitments = loans
        .filter((L) => active(L) && !L.smsf)
        .reduce((s, L) => s + pmt((L.rate + a.assessBuffer) / 100, Math.max(12, L.type === "IO" ? L.termLeft - L.ioLeft : L.termLeft), L.balance) * 12, 0);
      const living = living0 * Math.pow(1 + a.cpi / 100, year - 1);
      const others = (year <= otherRepayYears ? otherRepay : 0) + cardLimits * (a.cardServicing / 100) * 12;
      const surplus = net - commitments - living - others;
      return { surplus: round(surplus), income: round(salaries.reduce((x, v) => x + v, 0)), result: surplus >= 6000 ? "LIKELY" : surplus >= 0 ? "TIGHT" : "UNLIKELY" };
    }

    // --- Plan steps ----------------------------------------------------------------
    function stepBuy(s, salaries) {
      const kind = s.kind === "COM" ? "COM" : "RES";
      const smsf = s.type === "SMSF";
      const price = +s.price || 0;
      if (!(price > 0)) return;
      const duty = a.state === "NSW" ? nswDuty(price, kind === "RES") : round((price * a.dutyPctOther) / 100);
      const other = kind === "RES" ? a.buyCostsRes : round((price * a.buyCostsComPct) / 100);
      const total = price + duty + other;
      const lvr = (+s.lvr || (smsf ? a.smsfLvr : kind === "COM" ? a.comLvr : a.resLvr)) / 100;
      const id = s.id;
      const owners = smsf ? evenOwners : ownersOf(s.owners);
      const rentWeekly = +s.rentWeekly || (price * ((kind === "COM" ? 6.5 : 4) / 100)) / 52;
      props.push({
        id, name: s.name || (smsf ? "SMSF property" : kind === "COM" ? "Commercial purchase" : "Residential purchase"), kind, smsf,
        value: price, costBase: total, owners, rentWeekly, costPct: s.costPct ?? (kind === "COM" ? a.comCostPct : a.resCostPct),
        writeOff: s.writeOff || (kind === "COM" ? "BUILDING" : "BUILDING"), writeOffAmount: s.writeOffAmount, writeOffBase: price, growth: s.growth ?? (kind === "COM" ? a.comGrowth : a.resGrowth),
        landPct: kind === "COM" ? a.landPctCom : a.landPctRes, boughtMonth: month,
      });
      const baseRate = smsf ? a.invRate + a.lrbaPremium : kind === "COM" ? a.comRate : a.invRate;
      const loanType = smsf ? "PI" : s.loanType === "IO" ? "IO" : "PI";
      const rateToday = baseRate + (loanType === "IO" ? a.ioPremium : 0);
      const term = (smsf ? 20 : +s.loanYears || 30) * 12;
      const io = loanType === "IO" ? (+s.ioYears || 5) * 12 : 0;
      const mainAmount = round(price * lvr);
      const main = addLoan({ name: (s.name || "Purchase") + " loan", prop: id, forProp: id, balance: mainAmount, rateToday, type: loanType, ioLeft: io, termLeft: term, deductible: !smsf, smsf });
      repriceLoan(main);
      let rest = total - mainAmount;
      const chain = { id, year, name: props[props.length - 1].name, kind, smsf, price, duty, other, total, mainLoan: mainAmount, equity: [], cash: 0, fromSuper: 0, short: 0 };

      if (smsf) {
        const superTotal = superBal.reduce((x, b) => x + b, 0);
        chain.fromSuper = rest;
        if (superTotal - rest < a.smsfBuffer) flags.push({ year, text: `Super would be left with less than $${a.smsfBuffer.toLocaleString("en-AU")} after the SMSF purchase in year ${year}.` });
        superBal.forEach((b, i) => (superBal[i] -= superTotal > 0 ? (rest * b) / superTotal : rest / nP));
        chains.push(chain);
        return;
      }

      const fromEquity = (amount) => {
        let need = amount;
        const sources = liveProps()
          .filter((p) => !p.smsf && p.id !== id)
          .sort((x, y) => Number(y.home) - Number(x.home) || usableEquity(y) - usableEquity(x));
        for (const p of sources) {
          if (need <= 0) break;
          const take = Math.min(usableEquity(p), need);
          if (take < 1000) continue;
          const L = addLoan({ name: `Equity from ${p.name.toLowerCase()} for ${chain.name.toLowerCase()}`, prop: p.id, forProp: id, balance: round(take), rateToday, type: loanType, ioLeft: io, termLeft: term, deductible: true });
          repriceLoan(L);
          chain.equity.push({ from: p.name, amount: round(take) });
          need -= take;
        }
        return need;
      };
      const fromCash = (amount) => {
        const before = cash + offsetsTotal();
        const take = Math.min(amount, positive(before));
        if (take > 0) draw(take);
        chain.cash += round(take);
        yr.upfrontCash += take;
        return amount - take;
      };

      if (s.funding === "CASH") rest = fromEquity(fromCash(rest));
      else if (s.funding === "MIX") rest = fromEquity(fromCash(Math.min(rest, +s.cashAmount || 0)) + (rest - Math.min(rest, +s.cashAmount || 0)));
      else rest = fromCash(fromEquity(rest));
      if (rest > 1) {
        chain.short = round(rest);
        draw(rest);
        flags.push({ year, text: `Not enough equity or cash for ${chain.name.toLowerCase()} in year ${year} — about $${round(rest).toLocaleString("en-AU")} short.` });
      }
      const debt = loans.filter((L) => !L.smsf && active(L)).reduce((x, L) => x + L.balance, 0);
      const value = liveProps().filter((p) => !p.smsf).reduce((x, p) => x + p.value, 0);
      chain.lvrAfter = value > 0 ? debt / value : 0;
      chain.borrow = borrowingCheck(salaries);
      chains.push(chain);
      yr.events.push(`Buy ${chain.name.toLowerCase()}`);
    }

    function stepSell(s) {
      const p = props.find((x) => x.id === s.target && !x.sold);
      if (!p) return;
      const price = p.value;
      const costs = (price * a.sellCostsPct) / 100;
      let proceeds = price - costs;
      for (const L of loans.filter((x) => x.prop === p.id && active(x))) {
        proceeds -= L.balance - L.offset;
        L.balance = 0;
        L.offset = 0;
        L.paidOff = { year, why: "sold" };
      }
      // Loans that paid for it but are secured on other property: clear them too, or they stop being deductible.
      for (const L of loans.filter((x) => x.forProp === p.id && x.prop !== p.id && active(x))) {
        if (s.then !== "OFFSET" && proceeds > 0) {
          const pay = Math.min(proceeds, L.balance);
          L.balance -= pay;
          proceeds -= pay;
          yr.sentTo.payDown += pay;
          if (L.balance <= 0.5) clearLoan(L, "sale");
        }
        if (active(L)) L.deductible = false;
      }
      if (!p.home && !p.smsf) {
        const gain = price - costs - p.costBase;
        const held = month - (p.boughtMonth ?? -24);
        const taxable = gain > 0 ? (held >= 12 ? gain / 2 : gain) : 0;
        p.owners.forEach((o, i) => (yr.gains[i] += (taxable * o) / 100));
      }
      p.sold = true;
      p.soldYear = year;
      yr.events.push(`Sell ${p.name.toLowerCase()}`);
      if (p.smsf) {
        const t = superBal.reduce((x, b) => x + b, 0);
        superBal.forEach((b, i) => (superBal[i] += t > 0 ? (proceeds * b) / t : proceeds / nP));
        return;
      }
      if (proceeds < 0) {
        draw(-proceeds);
        flags.push({ year, text: `Selling ${p.name.toLowerCase()} in year ${year} wouldn't clear its loans — about $${round(-proceeds).toLocaleString("en-AU")} short.` });
        return;
      }
      if (s.then === "OFFSET") {
        putAway(proceeds, null);
        return;
      }
      // Pay down what's left: the loans that aren't tax-deductible first, then the dearest.
      const order = loans.filter((L) => active(L) && !L.smsf).sort((x, y) => Number(x.deductible) - Number(y.deductible) || y.rate - x.rate);
      for (const L of order) {
        if (proceeds <= 0) break;
        const pay = Math.min(proceeds, L.balance - L.offset);
        if (pay <= 0) continue;
        L.balance -= pay;
        proceeds -= pay;
        yr.sentTo.payDown += pay;
        if (L.balance - L.offset <= 0.5) clearLoan(L, "sale");
        else repriceLoan(L);
      }
      if (proceeds > 0) putAway(proceeds, null);
    }

    function stepShares(s) {
      const amount = +s.amount || 0;
      if (!(amount > 0)) return;
      const chain = { id: s.id, year, name: "Shares / ETFs", kind: "SHARES", price: amount, duty: 0, other: 0, total: amount, mainLoan: 0, equity: [], cash: 0, short: 0 };
      const loanType = s.loanType === "PI" ? "PI" : "IO";
      const homeProp = props.find((p) => p.home && !p.sold);
      const homeLoan = loans.find((L) => L.prop === "home" && L.forProp === "home" && active(L));
      if (s.funding === "RECYCLE" && homeLoan && homeProp) {
        // Pay the home loan down with the cash, then borrow the same back as a separate, tax-deductible split to buy the shares.
        const take = Math.min(amount, positive(cash + offsetsTotal()), homeLoan.balance);
        draw(take);
        homeLoan.balance -= take;
        repriceLoan(homeLoan);
        const L = addLoan({ name: "Investment split (debt recycling)", prop: "home", forProp: "SHARES", balance: take, rateToday: a.invRate + (loanType === "IO" ? a.ioPremium : 0), type: loanType, ioLeft: loanType === "IO" ? 5 * 12 : 0, termLeft: 30 * 12, deductible: true });
        repriceLoan(L);
        chain.recycled = round(take);
        chain.cash = 0;
        shares.value += take;
        shares.costBase += take;
        if (take < amount) chain.short = round(amount - take);
      } else if (s.funding === "EQUITY") {
        let need = amount;
        const sources = liveProps().filter((p) => !p.smsf).sort((x, y) => usableEquity(y) - usableEquity(x));
        for (const p of sources) {
          if (need <= 0) break;
          const take = Math.min(usableEquity(p), need);
          if (take < 1000) continue;
          const L = addLoan({ name: `Share loan against ${p.name.toLowerCase()}`, prop: p.id, forProp: "SHARES", balance: round(take), rateToday: a.invRate + (loanType === "IO" ? a.ioPremium : 0), type: loanType, ioLeft: loanType === "IO" ? 5 * 12 : 0, termLeft: 30 * 12, deductible: true });
          repriceLoan(L);
          chain.equity.push({ from: p.name, amount: round(take) });
          need -= take;
        }
        if (need > 0) {
          chain.cash = round(need);
          draw(need);
          yr.upfrontCash += need;
        }
        shares.value += amount;
        shares.costBase += amount;
      } else {
        draw(amount);
        chain.cash = round(amount);
        yr.upfrontCash += amount;
        shares.value += amount;
        shares.costBase += amount;
      }
      chains.push(chain);
      yr.events.push("Buy shares");
    }

    /** Buy a home to live in: sells the current home first (if any), then pays from savings above the cash to keep, then super (retired), then the rest of savings. */
    function stepHome(s) {
      const price = +s.price || 0;
      if (!(price > 0)) return;
      const cur = props.find((p) => p.home && !p.sold);
      if (cur) {
        let proceeds = cur.value * (1 - a.sellCostsPct / 100);
        for (const L of loans.filter((x) => x.prop === cur.id && active(x))) {
          proceeds -= L.balance - L.offset;
          L.balance = 0;
          L.offset = 0;
          L.paidOff = { year, why: "sold" };
        }
        cur.sold = true;
        cur.soldYear = year;
        if (proceeds >= 0) cash += proceeds;
        else draw(-proceeds);
        yr.events.push(`Sell ${cur.name.toLowerCase()}`);
      }
      const duty = a.state === "NSW" ? nswDuty(price, true) : round((price * a.dutyPctOther) / 100);
      const other = a.buyCostsRes;
      const total = price + duty + other;
      const name = s.name || "New home";
      // The new home takes the id "home", so its loan is treated as the home loan everywhere.
      props.push({ id: "home", name, kind: "RES", home: true, bought: true, value: price, costBase: total, owners: evenOwners, growth: s.growth ?? a.resGrowth, landPct: a.landPctRes, boughtMonth: month });
      renting = false;
      const keep = s.keep !== undefined && s.keep !== null && s.keep !== "" ? +s.keep : reserve();
      const chain = { id: s.id, year, name, kind: "HOME", price, duty, other, total, mainLoan: 0, equity: [], cash: 0, fromSuper: 0, short: 0 };
      let need = total;
      if (+s.loan > 0) {
        // Part of the price borrowed against the new home (savings can then sit in its offset).
        const amount = Math.min(+s.loan, price * (a.resLvr / 100));
        const L = addLoan({ name: "Home loan", prop: "home", forProp: "home", balance: round(amount), rateToday: a.homeRate, type: "PI", termLeft: 25 * 12 });
        repriceLoan(L);
        chain.mainLoan = round(amount);
        need -= amount;
      }
      const fromSuperFirst = retired && s.payFrom === "SUPER";
      if (fromSuperFirst) {
        const t = takeFromSuper(need);
        chain.fromSuper = round(t);
        need -= t;
      }
      const first = Math.min(need, positive(cash + offsetsTotal() - keep));
      if (first > 0) draw(first);
      need -= first;
      chain.cash += first;
      if (need > 0 && retired && !fromSuperFirst) {
        const t = takeFromSuper(need);
        chain.fromSuper = round(t);
        need -= t;
      }
      const last = Math.min(need, positive(cash + offsetsTotal()));
      if (last > 0) draw(last);
      need -= last;
      chain.cash = round(chain.cash + last);
      if (need > 1) {
        chain.short = round(need);
        draw(need);
        flags.push({ year, text: `Not enough savings${retired ? " and super" : ""} to buy ${name.toLowerCase()} in year ${year} — about $${round(need).toLocaleString("en-AU")} short.` });
      }
      chains.push(chain);
      yr.events.push(`Buy ${name.toLowerCase()}`);
    }

    /** Retiree: move savings above the cash to keep into super, shares or the home loan's offset. */
    function stepMove(s) {
      const keep = s.keep !== undefined && s.keep !== null && s.keep !== "" ? +s.keep : reserve();
      const spare = positive(cash + offsetsTotal() - keep);
      if (s.to === "OFFSET") {
        const L = loans.find((x) => x.prop === "home" && x.forProp === "home" && active(x));
        // Up to the loan balance: money beyond that would earn nothing in the offset, so it stays in the bank.
        const amount = Math.min(positive(cash - keep), L ? L.balance : 0);
        if (!L || !(amount > 0)) return;
        cash -= amount;
        L.offset += amount;
        yr.events.push(`${money(amount)} into the home loan offset`);
        return;
      }
      if (!(spare > 0)) return;
      if (s.to === "SHARES") {
        draw(spare);
        shares.value += spare;
        shares.costBase += spare;
        yr.events.push(`${money(spare)} into shares`);
        return;
      }
      if (s.to === "SUPER") {
        // Contribution limits: non-concessional up to $360,000 each under 75 (three years brought forward);
        // a downsizer contribution of up to $300,000 each at any age from 55, within 90 days of selling a home.
        const room = people.map((p, i) => (ageOf(i) < 75 ? 360000 : 0) + (s.downsizer ? 300000 : 0));
        const totalRoom = room.reduce((x, r) => x + r, 0);
        const amount = Math.min(spare, totalRoom);
        if (amount > 0) {
          draw(amount);
          room.forEach((r, i) => (superBal[i] += (amount * r) / totalRoom));
          yr.events.push(`${money(amount)} into super`);
        }
        if (amount < spare - 1)
          flags.push({ year, text: `Only ${money(amount)} of the ${money(spare)} could go into super (contribution limits${totalRoom === 0 ? " — from 75, new contributions generally aren't allowed except a downsizer contribution" : ""}); the rest stays in the bank.` });
      }
    }

    function applySteps(salaries) {
      for (const s of planSteps.filter((x) => +x.year === year)) {
        if (s.type === "BUY" || s.type === "SMSF") stepBuy(s, salaries);
        else if (s.type === "HOME") stepHome(s);
        else if (s.type === "MOVE") stepMove(s);
        else if (s.type === "SELL") stepSell(s);
        else if (s.type === "SHARES") stepShares(s);
        else if (s.type === "OFFSET") {
          const amount = Math.min(+s.amount || 0, positive(cash));
          const L = s.to === "home" ? loans.find((x) => x.prop === "home" && x.forProp === "home" && active(x)) : mainLoanOf(s.to);
          if (L && amount > 0) {
            cash -= amount;
            L.offset += amount;
            yr.events.push(`Move $${round(amount).toLocaleString("en-AU")} into an offset`);
          }
        } else if (s.type === "PI") {
          for (const L of loans.filter((x) => (x.forProp === s.target || x.prop === s.target) && active(x) && x.type === "IO")) {
            L.ioLeft = 0;
            L.type = "PI";
            L.payment = pmt(L.rate / 100, Math.max(1, L.termLeft), L.balance);
          }
          yr.events.push("Switch to principal and interest");
        }
      }
    }

    // --- Month by month ---------------------------------------------------------------
    const years = [];
    let salaries = people.map((p) => +p.salary || 0);
    let payg = salaries.map((s) => individualTax(s, a.startYear));
    let minLiquid = Infinity;
    let runsOut = null;

    for (month = 0; month < H * 12; month++) {
      if (month % 12 === 0) {
        year = month / 12 + 1;
        yr = newYearTotals();
        if (year > 1) {
          salaries = salaries.map((s) => s * (1 + wageGrowth / 100));
          for (const p of props) {
            if (p.rentNow !== undefined) p.rentNow *= 1 + (p.kind === "COM" ? a.comRentGrowth : a.resRentGrowth) / 100;
          }
        }
        payg = salaries.map((s) => individualTax(s, a.startYear + year - 1));
        for (const L of loans.filter(active)) repriceLoan(L);
        applySteps(salaries);
        for (const p of props) if (p.rentNow === undefined && !p.home) p.rentNow = (p.rentWeekly || 0) * 52;
        if (year > 1) rentYear *= 1 + a.resRentGrowth / 100;
        if (retired) {
          // Super pension: at least the minimum for each person's age, or the set amount if that's more.
          // How much super pays: the minimum for each age, its expected earnings, or a set amount — never less than the minimum.
          const mode = (RP && RP.draw) || plan.superDrawMode || "MIN";
          const set = mode === "SET" ? +((RP ? RP.drawAmount : plan.superDrawYearly) || 0) : 0;
          const t = superTotalNow();
          drawYear = superBal.map((b, i) => {
            const min = b * minDrawRate(ageOf(i));
            const want = mode === "EARNINGS" ? (b * a.pensionReturn) / 100 : mode === "SET" ? (t > 0 ? (set * b) / t : 0) : 0;
            return Math.min(b, Math.max(min, want));
          });
          // Age Pension, from this year's assets and income.
          const before = pensionYear;
          updatePension();
          if (month === exemptMonths) noteExemptionEnd(before);
        }
        // Land tax this year: each person's share of the taxable land they hold (NSW; not the home or SMSF).
        const landTax = {};
        if (a.state === "NSW") {
          const perPerson = people.map(() => []);
          for (const p of liveProps().filter((x) => !x.home && !x.smsf)) p.owners.forEach((o, i) => perPerson[i].push({ id: p.id, v: (p.value * p.landPct * o) / 10000 }));
          perPerson.forEach((parts) => {
            const total = parts.reduce((s, x) => s + x.v, 0);
            const tax = nswLandTax(total);
            parts.forEach((x) => (landTax[x.id] = (landTax[x.id] || 0) + (total > 0 ? (tax * x.v) / total : 0)));
          });
        }
        yr.landTaxBy = landTax;
      }

      if (retired && month === exemptMonths && month % 12 !== 0) {
        const before = pensionYear;
        updatePension();
        noteExemptionEnd(before);
      }
      const living = (living0 / 12) * Math.pow(1 + a.cpi / 100, year - 1);
      let salaryPart = 0;
      people.forEach((p, i) => {
        const gross = salaries[i] / 12;
        const takeHome = gross - payg[i] / 12;
        salaryPart += takeHome;
        yr.takeHome += takeHome;
        yr.payg += payg[i] / 12;
        superBal[i] += gross * (a.superGuarantee / 100) * 0.85;
      });
      salaryPart -= living;
      yr.living += living;
      if (year <= otherRepayYears && otherRepay > 0) {
        salaryPart -= otherRepay / 12;
        yr.living += otherRepay / 12;
      }

      // Growth.
      for (const p of liveProps()) p.value *= Math.pow(1 + p.growth / 100, 1 / 12);
      shares.value *= Math.pow(1 + a.shareGrowth / 100, 1 / 12);
      superBal.forEach((b, i) => (superBal[i] = b * Math.pow(1 + (retired ? a.pensionReturn : a.superReturn) / 100, 1 / 12)));
      if (retired) {
        // Super pension payments and the Age Pension come in; rent and a bought home's running costs go out.
        drawYear.forEach((d, i) => {
          const pay = Math.min(Math.max(0, superBal[i]), d / 12);
          superBal[i] -= pay;
          salaryPart += pay;
          yr.superDraw += pay;
        });
        salaryPart += pensionYear / 12;
        yr.agePension += pensionYear / 12;
        if (renting) {
          salaryPart -= rentYear / 12;
          yr.rentPaid += rentYear / 12;
        }
        for (const p of liveProps().filter((x) => x.home && x.bought)) {
          const c = (p.value * a.homeRunPct) / 100 / 12;
          salaryPart -= c;
          yr.homeCosts += c;
        }
      }

      // Rents and running costs.
      const parts = {};
      for (const p of liveProps().filter((x) => !x.home)) {
        const vacancy = (p.kind === "COM" ? a.comVacancyWeeks : a.resVacancyWeeks) / 52;
        const rent = (p.rentNow * (1 - vacancy)) / 12;
        const costs = (p.rentNow * p.costPct) / 100 / 12 + (yr.landTaxBy[p.id] || 0) / 12;
        if (p.smsf) {
          const t = superBal.reduce((x, b) => x + b, 0);
          superBal.forEach((b, i) => (superBal[i] += ((rent - costs) * (t > 0 ? b / t : 1 / nP))));
          yr.smsfIncome += rent - costs;
          continue;
        }
        parts[p.id] = rent - costs;
        yr.rent += rent;
        yr.costs += costs;
        yr.landTax += (yr.landTaxBy[p.id] || 0) / 12;
      }

      // Loans.
      let sharePart = 0;
      for (const L of loans.filter(active)) {
        const eff = positive(L.balance - L.offset);
        const interest = (eff * L.rate) / 100 / 12;
        yr.interestSaved += (Math.min(L.offset, L.balance) * L.rate) / 100 / 12;
        let pay;
        if (L.type === "IO" && L.ioLeft > 0) {
          pay = interest;
          L.ioLeft--;
          if (L.ioLeft === 0) {
            L.type = "PI";
            L.payment = pmt(L.rate / 100, Math.max(1, L.termLeft - 1), L.balance);
          }
        } else {
          pay = Math.min(L.payment, L.balance + interest);
          L.balance -= pay - interest;
        }
        L.termLeft = Math.max(1, L.termLeft - 1);
        L.interestYear += interest;
        L.interestTotal += interest;
        L.payYear += pay;
        yr.interest += L.smsf ? 0 : interest;
        if (L.smsf) {
          yr.smsfIncome -= interest;
          const t = superBal.reduce((x, b) => x + b, 0);
          superBal.forEach((b, i) => (superBal[i] -= pay * (t > 0 ? b / t : 1 / nP)));
        } else if (L.forProp === "SHARES") sharePart -= pay;
        else if (L.prop === "home" && L.forProp === "home") {
          salaryPart -= pay;
          yr.homePay += pay;
        } else parts[L.forProp] = (parts[L.forProp] || 0) - pay;
        // Covered by its offset: pay it off with the offset only if a cash reserve is left; otherwise keep
        // the money in the offset (no interest is charged) so it's still there when it's needed.
        if (L.balance - L.offset <= 0.5 && !(L.type === "IO" && L.ioLeft > 0) && !retired && cash + offsetsTotal() - L.balance >= reserve()) clearLoan(L, "offset");
        else if (L.balance <= 0.5) clearLoan(L, "repaid");
      }
      // Loans for a property that's been sold, still running: the household pays them.
      for (const k of Object.keys(parts)) if (!props.find((p) => p.id === k && !p.sold)) {
        salaryPart += parts[k];
        delete parts[k];
      }

      const dividends = (shares.value * a.shareYield) / 100 / 12;
      sharePart += dividends;
      yr.dividends += dividends;
      const interestOnCash = (positive(cash) * a.savingsRate) / 100 / 12;
      salaryPart += interestOnCash;
      yr.savingsInterest += interestOnCash;

      for (const k of Object.keys(parts)) yr.propCash[k] = (yr.propCash[k] || 0) + parts[k];
      yr.shareCash += sharePart;

      // Spare money goes where the scenario says; missing money comes from savings, then offsets.
      const items = Object.keys(parts).map((k) => ({ prop: k, v: parts[k] }));
      items.push({ prop: null, v: salaryPart + sharePart });
      const net = items.reduce((s, x) => s + x.v, 0);
      if (net >= 0) {
        const pos = items.reduce((s, x) => s + positive(x.v), 0);
        for (const x of items) if (x.v > 0) putAway((x.v * net) / pos, x.prop);
      } else draw(-net);

      // Year end: tax, super tax, the year's record.
      if (month % 12 === 11) {
        const calYear = a.startYear + year - 1;
        const taxable = people.map((p, i) => salaries[i]);
        const taxableExInvest = people.map((p, i) => salaries[i]);
        const savingsShare = yr.savingsInterest / nP;
        const eligibleNow = people.map((p, i) => ageOf(i) >= AGE_PENSION.pensionAge);
        const nEligible = eligibleNow.filter(Boolean).length;
        people.forEach((p, i) => {
          // Super pensions are tax-free from 60; the Age Pension is taxable.
          const ap = nEligible && eligibleNow[i] ? yr.agePension / nEligible : 0;
          taxable[i] += savingsShare + ap;
          taxableExInvest[i] += savingsShare + ap;
        });
        const taxOf = (t, i) => {
          const tax = individualTax(t, calYear);
          return retired && eligibleNow[i] ? Math.max(0, tax - sapto(t, couple)) : tax;
        };
        const invest = people.map(() => 0);
        let writeOffs = 0;
        for (const p of props.filter((x) => !x.home && !x.smsf)) {
          if (yr.propCash[p.id] === undefined) continue;
          // Tax uses interest rather than repayments, and takes off the write-off.
          const principal = loans.filter((L) => L.forProp === p.id && !L.smsf).reduce((s, L) => s + (L.payYear - L.interestYear), 0);
          const yearsHeld = Math.max(0, Math.floor((month - (p.boughtMonth ?? -24)) / 12));
          const dep = p.sold && (p.soldYear ?? 0) < year ? 0 : writeOff(p, yearsHeld, a);
          writeOffs += dep;
          const result = yr.propCash[p.id] + principal - dep;
          p.owners.forEach((o, i) => (invest[i] += (result * o) / 100));
        }
        const sharePrincipal = loans.filter((L) => L.forProp === "SHARES").reduce((s, L) => s + (L.payYear - L.interestYear), 0);
        const frankRate = a.franking / 100;
        const grossUp = yr.dividends * frankRate * (30 / 70);
        people.forEach((p, i) => {
          invest[i] += (yr.shareCash + sharePrincipal + grossUp) / nP;
          let result = invest[i] + yr.gains[i];
          if (!a.negativeGearing) {
            // Losses only count against later investment income and gains.
            if (result < 0) {
              carried[i] += -result;
              result = 0;
            } else {
              const use = Math.min(carried[i], result);
              carried[i] -= use;
              result -= use;
            }
          }
          taxable[i] += result;
        });
        yr.writeOffs = writeOffs;
        const tax = taxable.map((t, i) => taxOf(t, i));
        const credits = grossUp;
        const totalTax = tax.reduce((s, t) => s + t, 0) - credits;
        const taxEx = taxableExInvest.reduce((s, t, i) => s + taxOf(t, i), 0);
        const settle = yr.payg - totalTax; // refund (+) or bill (−)
        yr.taxSettle = settle;
        if (settle >= 0) putAway(settle, null);
        else draw(-settle);
        if (yr.smsfIncome > 0) {
          const t = superBal.reduce((x, b) => x + b, 0);
          superBal.forEach((b, i) => (superBal[i] -= yr.smsfIncome * 0.15 * (t > 0 ? b / t : 1 / nP)));
        }

        const T = totalsNow();
        minLiquid = Math.min(minLiquid, T.liquid);
        if (T.liquid < -1 && runsOut === null) runsOut = year;
        const investCashBefore = Object.values(yr.propCash).reduce((s, v) => s + v, 0) + yr.shareCash;
        const taxEffect = totalTax - taxEx; // extra tax because of the investments (negative = saves tax)
        const investCashAfter = investCashBefore - taxEffect;
        const homeLoan = loans.find((L) => L.prop === "home" && L.forProp === "home");
        years.push({
          year,
          calYear,
          rateShift: shifts[year - 1] || 0,
          homeRate: homeLoan ? homeLoan.rate : (a.homeRate + (shifts[year - 1] || 0)),
          value: round(T.value),
          debt: round(T.debt),
          offsets: round(T.offsets),
          cash: round(T.cash),
          liquid: round(T.liquid),
          shares: round(T.shares),
          superTotal: round(T.superTotal),
          equity: round(T.equity),
          nw: round(T.nw),
          nwExSuper: round(T.nwExSuper),
          income: round(salaries.reduce((s, x) => s + x, 0)),
          takeHome: round(yr.takeHome),
          homeLoanPay: round(yr.homePay),
          age: youngest0 + year - 1,
          agePension: round(yr.agePension),
          superDraw: round(yr.superDraw),
          rentPaid: round(yr.rentPaid),
          homeCosts: round(yr.homeCosts),
          homeValue: round(T.homeValue),
          homeEquity: round(T.homeEquity),
          spendable: round(T.liquid),
          // Retired view: what comes in (pay after tax, pensions, interest) and what goes out (living, rent, home, home loan).
          moneyIn: round(yr.takeHome + yr.agePension + yr.superDraw + yr.savingsInterest),
          moneyOut: round(yr.living + yr.rentPaid + yr.homeCosts + yr.homePay),
          leftOver: round(yr.takeHome + yr.agePension + yr.superDraw + yr.savingsInterest - yr.living - yr.rentPaid - yr.homeCosts - yr.homePay + investCashBefore + settle),
          living: round(yr.living),
          interest: round(yr.interest),
          interestSaved: round(yr.interestSaved),
          rent: round(yr.rent),
          costs: round(yr.costs),
          landTax: round(yr.landTax),
          taxEffect: round(taxEffect),
          writeOffs: round(yr.writeOffs || 0),
          investCashBefore: round(investCashBefore),
          investCashAfter: round(investCashAfter),
          topUp: round(positive(-investCashAfter)),
          upfrontCash: round(yr.upfrontCash),
          householdSpare: round(yr.takeHome - yr.living - yr.homePay - yr.rentPaid - yr.homeCosts + yr.agePension + yr.superDraw + investCashBefore + yr.savingsInterest + settle),
          sentTo: Object.fromEntries(Object.entries(yr.sentTo).map(([k, v]) => [k, round(v)])),
          drawnFrom: Object.fromEntries(Object.entries(yr.drawnFrom).map(([k, v]) => [k, round(v)])),
          props: props
            .filter((p) => !p.home && !p.smsf && (yr.propCash[p.id] !== undefined))
            .map((p) => ({ id: p.id, name: p.name, value: round(p.sold ? 0 : p.value), debt: round(loans.filter((L) => L.forProp === p.id && active(L)).reduce((s, L) => s + L.balance, 0)), cash: round(yr.propCash[p.id] || 0), sold: !!p.sold })),
          events: yr.events,
        });
        for (const L of loans) {
          L.interestYear = 0;
          L.payYear = 0;
        }
      }
    }

    // --- Summary ------------------------------------------------------------------------
    const last = years[years.length - 1];
    const homeLoan = loans.find((L) => L.prop === "home" && L.forProp === "home");
    const totalInterest = round(loans.reduce((s, L) => s + (L.smsf ? 0 : L.interestTotal), 0));
    const upfront = years.reduce((s, y) => s + y.upfrontCash, 0);
    const topUps = years.reduce((s, y) => s + y.topUp, 0);
    const worst = years.reduce((w, y) => (y.investCashAfter < w.amount ? { year: y.year, amount: y.investCashAfter } : w), { year: 0, amount: 0 });
    const firstPositive = years.find((y, i) => y.investCashAfter >= 0 && years.slice(i).every((z) => z.investCashAfter >= 0) && years.slice(0, i).some((z) => z.investCashAfter < 0));
    const peakDebt = years.reduce((m, y) => Math.max(m, y.debt), 0);
    const peakLvr = years.reduce((m, y) => Math.max(m, y.value > 0 ? y.debt / y.value : 0), 0);
    const debtFree = years.find((y) => y.debt <= 0.5);
    return {
      id: scenario.id,
      name: scenario.name,
      baseline: !!scenario.baseline,
      spare: scenario.spare || "HOME_OFFSET",
      years,
      chains,
      flags,
      summary: {
        nwEnd: last.nw,
        nwExSuperEnd: last.nwExSuper,
        debtEnd: last.debt,
        valueEnd: last.value,
        peakDebt,
        peakLvr,
        totalInterest,
        upfrontCash: round(upfront),
        topUps: round(topUps),
        moneyIn: round(upfront + topUps),
        worstYear: worst,
        positiveFrom: firstPositive ? firstPositive.year : null,
        homeLoanPaidOff: homeLoan && homeLoan.paidOff ? homeLoan.paidOff.year : null,
        debtFreeYear: debtFree ? debtFree.year : null,
        minLiquid: round(minLiquid),
        runsOut,
        runsOutAge: runsOut ? youngest0 + runsOut - 1 : null,
        exemptMonths,
        exemptEndLabel,
        exemption,
        retired,
        startAge: youngest0,
      },
    };
  }

  // ---------------------------------------------------------------------
  // Comparing plans
  // ---------------------------------------------------------------------

  const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-AU");

  /** Retired households: does the money last, and what's left at year 20? */
  function retiredVerdict(r, base, plan) {
    const a = Object.assign({}, DEFAULT_ASSUMPTIONS, plan.assumptions || {});
    const s = r.summary;
    const H = r.years.length;
    const until = +a.lastUntil || 95;
    const at = Math.min(20, H);
    const y = r.years[at - 1];
    const notes = [];
    const stops = [];
    const warnings = [];
    if (s.runsOutAge !== null && s.runsOutAge <= until) {
      const w = r.years[s.runsOut - 1];
      stops.push(
        `Money runs out at about age ${s.runsOutAge} — before ${until}. That year about ${money(w.moneyIn)} comes in (Age Pension ${money(w.agePension)}, super ${money(w.superDraw)}, interest and pay), ` +
          `against about ${money(w.moneyOut)} going out (living costs${w.rentPaid ? ", rent" : ""}${w.homeCosts ? ", the home's running costs" : ""}${w.homeLoanPay ? ", the home loan" : ""}), and savings and super are used up.`
      );
      if (w.homeEquity > 100000)
        stops.push(`The home would be worth about ${money(w.homeEquity)} then. Selling it, or borrowing against it (for example the government's Home Equity Access Scheme), is a fallback — not a plan.`);
    } else if (s.runsOutAge !== null) {
      warnings.push(`Money lasts until about age ${s.runsOutAge} — past ${until}, but not much past it.`);
    }
    for (const c of r.chains) if (c.short > 0) stops.push(`About ${money(c.short)} short of the price and costs for ${c.name.toLowerCase()} in year ${c.year}.`);
    if (r.maxHomePrice !== undefined) {
      if (r.maxHomePrice === null) notes.push(`Even a very cheap home wouldn't make the money last to ${until} on these figures.`);
      else notes.push(`The most this plan could spend on the home and still have money at ${until}: about ${money(r.maxHomePrice)} (plus stamp duty and costs).`);
    }
    notes.push(`In year ${at} (age ${y.age}): home equity about ${money(y.homeEquity)}; cash and super about ${money(y.spendable)}.`);
    const ap1 = r.years[0].agePension;
    const apBase = base.years[0].agePension;
    if (!r.baseline && Math.abs(ap1 - apBase) > 500) notes.push(`Age Pension in year 1: about ${money(ap1)} a year, compared with ${money(apBase)} with no change.`);
    else if (ap1 > 0) notes.push(`Age Pension in year 1: about ${money(ap1)} a year.`);
    if (s.exemption)
      notes.unshift(
        `${s.exemption.label} — 24 months after the sale — the home-sale money starts to count for the Age Pension. Still renting then, the pension drops from about ${money(s.exemption.before)} to ${money(s.exemption.after)} a year.`
      );
    else if (s.exemptMonths > 0 && !r.baseline && r.chains.some((c) => c.kind === "HOME" && (c.year - 1) * 12 < s.exemptMonths))
      notes.push(`Buying before ${s.exemptEndLabel} means the home-sale money goes into the home before the 24 months are up.`);
    // A big drop in the Age Pension for another reason.
    for (let k = 1; k < r.years.length && !s.exemption; k++) {
      const prev = r.years[k - 1].agePension;
      const now = r.years[k].agePension;
      if (prev > 5000 && now < prev * 0.5) {
        notes.push(
          `The Age Pension drops from about ${money(prev)} to ${money(now)} a year in year ${k + 1}${plan.saleExempt && r.years[k].rentPaid > 0 ? ` — the home-sale money starts to count in the assets test once ${plan.saleExemptMonths || 24} months have passed` : ""}.`
        );
        break;
      }
    }
    for (const f of r.flags) notes.push(f.text);
    if (r.baseline) return { level: "BASE", label: "What every plan is measured against", stops, warnings, notes: ["Nothing new is bought; money stays in savings and super.", ...notes] };
    const gain = s.nwEnd - base.summary.nwEnd;
    let level;
    let label;
    if (stops.length) {
      level = "STOP";
      label = "Money doesn't last";
    } else if (warnings.length) {
      level = "MAYBE";
      label = `Lasts to ${until}, only just`;
    } else {
      level = "YES";
      label = s.runsOutAge === null ? "Money lasts past 100" : `Money lasts to about ${s.runsOutAge}`;
    }
    return { level, label, gain: round(gain), notes, stops, warnings, horizon: H };
  }

  function verdictFor(r, base, plan) {
    if (plan.stage === "RETIRED") return retiredVerdict(r, base, plan);
    const notes = [];
    const s = r.summary;
    const risk = plan.risk || "MIDDLE";
    const goal = plan.goal || "GROWTH";
    if (r.baseline) return { level: "BASE", label: "What every plan is measured against", stops: [], warnings: [], notes: ["Cash stays in the offset and spare money keeps going in; nothing new is bought."] };
    const gain = s.nwEnd - base.summary.nwEnd;
    const H = r.years.length;
    for (const c of r.chains) {
      if (c.borrow && c.borrow.result === "TIGHT") notes.push(`Borrowing for ${c.name.toLowerCase()} in year ${c.year} looks tight at a lender's test rate.`);
      if (c.short > 0) notes.push(`About ${money(c.short)} short of the deposit and costs for ${c.name.toLowerCase()} in year ${c.year}.`);
    }
    if (s.worstYear.amount < 0) notes.push(`The worst year is year ${s.worstYear.year}: the investments need ${money(-s.worstYear.amount)} from you (${money(-s.worstYear.amount / 52)} a week) after tax.`);
    if (s.positiveFrom) notes.push(`The investments pay for themselves from year ${s.positiveFrom}.`);
    if (s.peakLvr > 0.8) notes.push(`Borrowing peaks at ${Math.round(s.peakLvr * 100)}% of what the property is worth — little room if prices fall.`);
    if (risk === "CAREFUL" && (s.peakLvr > 0.65 || r.chains.some((c) => c.kind === "COM"))) notes.push("More risk than a careful profile usually takes on (high borrowing, or a commercial vacancy risk).");
    if (r.chains.some((c) => c.kind === "COM")) notes.push("Commercial property can sit empty for 6–12 months between tenants — keep a cash buffer.");
    if (goal === "CASHFLOW" && s.worstYear.amount < 0 && !s.positiveFrom) notes.push("Costs money every year over the plan — doesn't fit a cash-flow goal.");
    for (const f of r.flags) notes.push(f.text);

    // Red flags: the plan probably can't be done on this income.
    const stops = [];
    if (s.runsOut) {
      const y = r.years[s.runsOut - 1];
      stops.push(
        `Runs out of money in year ${s.runsOut}. That year the household earns about ${money(y.income)} before tax (${money(y.takeHome)} after tax). ` +
          `The investments ${y.investCashAfter < 0 ? `cost ${money(-y.investCashAfter)} after tax` : `bring in ${money(y.investCashAfter)} after tax`}, ` +
          `on top of ${money(y.homeLoanPay)} of home loan repayments and ${money(y.living)} of living costs — and savings and offsets are used up.`
      );
    }
    for (const c of r.chains) {
      if (c.borrow && c.borrow.result === "UNLIKELY")
        stops.push(
          `A lender would very likely say no to the loan for ${c.name.toLowerCase()} in year ${c.year}. On an income of about ${money(c.borrow.income)} before tax, ` +
            `at their test rate (about 3% above the real rate, counting only part of the rent and your card limits), the budget is about ${money(-c.borrow.surplus)} a year short.`
        );
    }
    const short = r.years.filter((y) => y.householdSpare < 0);
    const warnings = [];
    if (!s.runsOut && short.length) {
      const worst = short.reduce((w, y) => (y.householdSpare < w.householdSpare ? y : w));
      warnings.push(
        `In ${short.length} of the ${H} years the household spends more than it earns — at worst year ${worst.year}, about ${money(-worst.householdSpare)} short, paid from savings and offsets.`
      );
    }

    let level;
    let label;
    if (stops.length) {
      level = "STOP";
      label = "Probably not possible on this income";
    } else if (s.runsOut) {
      level = "NO";
      label = `Runs out of spare cash in year ${s.runsOut}`;
      notes.unshift("Savings and offsets would be used up — it would need more income, a smaller purchase or a later year.");
    } else if (gain > Math.max(50000, Math.abs(base.summary.nwEnd) * 0.05)) {
      level = r.chains.some((c) => c.borrow && c.borrow.result === "UNLIKELY") ? "MAYBE" : "YES";
      label = level === "YES" ? "Worth a closer look" : "Worth a look — if the loan is approved";
    } else if (gain > 0) {
      level = "MAYBE";
      label = "Marginal";
    } else {
      level = "NO";
      label = "Doesn't beat leaving the cash in the offset";
    }
    return { level, label, gain: round(gain), perDollar: s.moneyIn > 0 ? gain / s.moneyIn : null, notes, stops, warnings, horizon: H };
  }

  /** Retired: the highest price for a plan's home purchase that still leaves money at the target age (to $5,000), or null. */
  function maxHomePrice(plan, scenario) {
    const R = plan.stage === "RETIRED" && scenario.retire;
    const step = R ? (R.home && +R.price > 0 ? R : null) : (scenario.steps || []).find((x) => x.type === "HOME");
    if (!step) return undefined;
    const until = +Object.assign({}, DEFAULT_ASSUMPTIONS, plan.assumptions || {}).lastUntil || 95;
    const lasts = (price) => {
      const sc = R
        ? Object.assign({}, scenario, { retire: Object.assign({}, R, { price }) })
        : Object.assign({}, scenario, { steps: scenario.steps.map((x) => (x === step ? Object.assign({}, x, { price }) : x)) });
      const r = simulate(plan, sc);
      return (r.summary.runsOutAge === null || r.summary.runsOutAge > until) && !r.chains.some((c) => c.short > 0);
    };
    let lo = 0;
    let hi = Math.max(3000000, (+step.price || 0) * 3);
    if (!lasts(50000)) return null;
    lo = 50000;
    if (lasts(hi)) return hi;
    for (let k = 0; k < 18 && hi - lo > 5000; k++) {
      const mid = (lo + hi) / 2;
      if (lasts(mid)) lo = mid;
      else hi = mid;
    }
    return Math.floor(lo / 5000) * 5000;
  }

  function runAll(plan) {
    const scenarios = plan.scenarios || [];
    const base = scenarios.find((s) => s.baseline) || { id: "base", name: plan.stage === "RETIRED" ? "Keep things as they are" : "Cash stays in the offset", baseline: true, steps: [] };
    const baseRun = simulate(plan, base);
    const runs = scenarios.map((s) => (s === base ? baseRun : simulate(plan, s)));
    if (!scenarios.includes(base)) runs.unshift(baseRun);
    if (plan.stage === "RETIRED") scenarios.forEach((s, i) => {
      const m = maxHomePrice(plan, s);
      if (m !== undefined) runs[scenarios.includes(base) ? i : i + 1].maxHomePrice = m;
    });
    for (const r of runs) r.verdict = verdictFor(r, baseRun, plan);
    return { runs, base: baseRun, shifts: rateShifts(Object.assign({}, DEFAULT_ASSUMPTIONS, plan.assumptions || {}), baseRun.years.length) };
  }

  // ---------------------------------------------------------------------
  // Reading numbers as people say or type them: "$650k", "1.2m", "four hundred and twenty thousand"
  // ---------------------------------------------------------------------

  const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, a: 1 };
  const SCALE = { hundred: 100, thousand: 1000, grand: 1000, k: 1000, million: 1e6, mil: 1e6, m: 1e6 };

  function parseAmount(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    let t = String(input).toLowerCase().trim().replace(/[$,]/g, "").replace(/\s+dollars?$/, "").replace(/\s*per\s*cent|\s*percent|%/g, "");
    if (!t) return null;
    const short = /^(-?\d*\.?\d+)\s*(k|m|mil|million|thousand|grand)?$/.exec(t);
    if (short) return Number(short[1]) * (short[2] ? SCALE[short[2]] : 1);
    // Words, possibly mixed with digits: "four hundred and twenty thousand", "1.5 million", "point five".
    const words = t.replace(/-/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean);
    let total = 0;
    let current = 0;
    let decimal = null;
    let seen = false;
    for (const w of words) {
      if (w === "point") {
        decimal = "";
        continue;
      }
      if (decimal !== null) {
        if (SMALL[w] !== undefined && SMALL[w] < 10) {
          decimal += String(SMALL[w]);
          continue;
        }
        if (/^\d+$/.test(w)) {
          decimal += w;
          continue;
        }
        current += Number("0." + (decimal || "0"));
        decimal = null;
      }
      if (/^\d*\.?\d+$/.test(w)) {
        current += Number(w);
        seen = true;
      } else if (SMALL[w] !== undefined) {
        current += SMALL[w];
        seen = true;
      } else if (w === "hundred") {
        current = (current || 1) * 100;
        seen = true;
      } else if (SCALE[w]) {
        total += (current || 1) * SCALE[w];
        current = 0;
        seen = true;
      } else return null;
    }
    if (decimal !== null) current += Number("0." + (decimal || "0"));
    return seen ? total + current : null;
  }

  const api = { retiredSteps, agePension, minDrawRate, sapto, maxHomePrice, AGE_PENSION, writeOff, simulate, runAll, rateShifts, individualTax, nswDuty, nswLandTax, pmt, monthsToClear, parseAmount, DEFAULT_ASSUMPTIONS, CASH_RATE };
  root.BlinkEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
