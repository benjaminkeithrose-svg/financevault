# Ideas stored for later

Ideas agreed in conversation but not built yet. The plan: once the ATO
reference documents are loaded, do a gap analysis, then build these in
one go. Newest at the bottom.

---

## 1. "Tax reference" document type — waiting on a yes

**Why:** ATO rulings uploaded now would be filed as "ATO Correspondence"
(Tax category) and could land in an Accountant Pack as if they were
personal letters.

**Proposal:** a new "Tax reference" type — kept out of packs, not linked to
any person or entity, with its ruling code (e.g. TR 2000/2), the financial
year it applies to, and a "check again" date each July. Do this before the
ATO documents are uploaded.

**Status:** asked, not yet answered.

---

## 2. Debt allocation for tax (loan purpose tracking)

**Why:** interest is deductible according to what the borrowed money was
*used for*, not what secures the loan. Mixed-purpose loans must be
apportioned, repayments reduce each part proportionally, redraws are new
borrowing, and some split-loan arrangements attract Part IVA (Hart's case).
Needs to be auditable.

**Stage 1 — where the money went**
- Each loan (or split) gets "used for" entries: amount, date, what it
  bought (property, shares, private), deductible or not, evidence document.
- Loan splits recorded as separate loans grouped under one facility.
- Usable equity per property: value × lender's max LVR − loans secured on it.
- Deductible-interest schedule per property per financial year, from the
  lender's annual interest statement × purpose split. Into the Accountant Pack.

**Stage 2 — redraws and mixed loans**
- "Draw equity" step on a property: amount + purpose → new split. Warns if
  it would make a single-purpose loan mixed.
- Loan statement CSV import; apply the ATO proportional method to every
  repayment and redraw.
- Flag Hart-style arrangements for the accountant; never auto-deductible.

**Stage 3** — connect Portfolio Plan equity draws to real loans.

**Waiting on from the user:** TR 2000/2, TR 95/25, TD 2012/1 and the ATO
"Interest expenses" page (as PDFs); current loan statements showing splits;
settlement statements; details of the planned equity draw and lender's max
LVR; whether any equity goes into the SMSF (related-party LRBA — PCG 2016/5);
the accountant's preferred method and format.

---

## 3. ATO reference library to load

Official source: the ATO Legal Database (ato.gov.au/law). Check each
document's status is current before saving.

| Area | Documents | Changes |
|---|---|---|
| Loans / debt allocation | TR 2000/2, TR 95/25, TD 2012/1, "Interest expenses" page | Rarely |
| Rental expenses | Rental properties guide (current year), TR 97/23 | Yearly |
| Depreciation | Guide to depreciating assets; effective life ruling (TR 2022/1 as last checked) | Yearly |
| Capital gains | Guide to CGT; Personal investors guide to CGT | Yearly |
| Super / SMSF | Key super rates and thresholds; minimum pension drawdown rates | Yearly |
| SMSF borrowing | SMSFR 2012/1, PCG 2016/5, LCR 2021/2 | Rarely |
| GST, commercial property | GSTR 2002/5 | Rarely |
| Trusts | TR 2022/4, PCG 2022/2 | Rarely |
| Personal tax | Tax rates, Medicare levy/surcharge thresholds, private health rebate | Yearly |
| Records | ATO record-keeping page | Rarely |
| State taxes (NSW) | Revenue NSW land tax and stamp duty pages | Yearly |

**To verify when loaded:** the super caps typed into
`server/src/services/superRules.ts`, especially 2026-27 ($32,500 /
$130,000 / $2.1m TBC), which were entered without checking against the ATO.

---

## 4. Property profitability (after-tax), per property

**Why:** avoid surprises at tax time — e.g. a property that looks like 4%
gross yield turns out to be 2.2% after costs, interest and tax.

**Idea (not a recommendation system):** for each property, a clear estimate of
- gross yield (rent ÷ value)
- net yield after running costs (rates, insurance, management, repairs, land tax)
- after-interest cash return, using the deductible interest from idea 2
- after-tax estimate, using each owner's share and marginal rate, and
  depreciation where a schedule exists
- side-by-side ranking of properties, and a year-on-year trend, so a drop
  is visible before tax time

Builds on: Property Performance report, bank transactions by category,
ownership shares, debt allocation (idea 2), the ATO reference figures (idea 3).

**Needs:** each owner's expected income (for their marginal rate), rental
statements or categorised transactions, depreciation schedules.

---

## 5. Suburb market data → "time to get a proper valuation" prompt

**Why:** know roughly how each property is tracking without paying for a
valuation, and get prompted when it's likely worth checking — e.g. before a
refinance or equity draw.

**Idea:**
- Import suburb-level figures (median value, and median rent if available)
  by date — from a CSV, so the app stays offline and nothing is sent out.
- Each property's value is indexed from its last real valuation by the
  suburb's movement since then: "last valued $900k in Mar 2025; suburb up
  8% since — indicative $972k".
- When the indicative value moves enough (say 10%), or the last valuation is
  old, prompt: "worth getting a proper valuation — could free up $X of
  equity for a refinance".
- Always labelled as an indicator, never replacing the recorded value
  until a real valuation is entered.

**Open questions:** where the data comes from. Free sources are limited
(e.g. NSW Valuer General land values are land-only). The good suburb data
(CoreLogic/Cotality, PropTrack, Domain, SQM Research) is mostly paid or
licence-restricted — a manual quarterly CSV download from whatever the user
has access to is the likely route. Decide before building.

---

## 6. Gap analysis

After the ATO documents are in: a fresh gap analysis across the whole
program, using them as the reference — what to add, fix or remove.

---

## 7. Borrowing capacity and equity release estimate (residential and commercial)

**Why:** know roughly what most lenders would lend — for a new loan and for
an equity release — before talking to the broker.

**What's public about how lenders work it out** (verify when building):
- APRA's prudential guidance for residential lending (APG 223) sets the
  serviceability buffer: lenders assess repayments at the actual rate plus
  a buffer, currently 3 percentage points.
- Living expenses: lenders use the higher of your declared expenses and a
  benchmark (the Household Expenditure Measure, HEM — licensed, not free,
  so the app would use declared expenses and let a benchmark be typed in).
- Income is "shaded": rent typically counted at about 70–80%, bonuses and
  overtime reduced or excluded. Each lender sets its own percentages.
- Credit cards are counted at a set percentage of the limit each month
  (about 3–3.8%), whatever the balance.
- Existing loans are assessed as principal-and-interest over the remaining
  term at the buffered rate, even if interest-only.
- APRA has also limited high debt-to-income lending (6× income and above) —
  confirm the current setting when building.
- LVR: usually 80% before lenders' mortgage insurance, higher with it.

**Residential mode:** income (shaded) − living expenses − all existing
commitments (at buffered rates) = surplus → how big a new loan that surplus
can service at the buffered rate. Show a range, not one figure.

**Commercial mode:** lenders mostly look at the property itself — interest
cover (net rent ÷ interest at a buffered rate, commonly needing about
1.5–2×) and a lower LVR (commonly 60–70%). The app already works out DSCR
and interest cover on commercial properties; this reuses it.

**Lease doc:** commercial loans assessed on the lease alone — no personal
income — so this is the commercial mode with personal servicing switched off.

**SMSF:** the fund's own rent and contributions service the loan; lower LVRs.

**Equity release:** the lower of (value × lender's max LVR − current debt)
and what servicing allows. Links to idea 2 (debt allocation) so the draw's
purpose is recorded, and to idea 5 (market data) for an indicative value.

**Every assumption visible and editable:** buffer (3%), rent shading,
card percentage, expense benchmark, max LVR, interest cover. Clearly marked
as an estimate — the broker's lender calculators have the final say.

**Builds on:** Income & Spending report, Debt Summary (limits and
repayments), property values, commercial DSCR/ICR, Fact Find.

**To gather:** APRA APG 223 (apra.gov.au); ASIC RG 209 (responsible
lending); from the broker if they'll share — the assumptions their usual
lenders use (rent shading %, card %, expense benchmark, max LVR, commercial
ICR/LVR, lease-doc criteria).
