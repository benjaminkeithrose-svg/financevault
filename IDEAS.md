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

---

## 8. "Worth asking your accountant" — missed deductions and unused concessions

**Why:** find tax the family is legitimately entitled to save but may be
missing, using the records already in the app.

**What it is:** a checklist of legitimate deductions, offsets and
concessions the records suggest might apply but aren't being used. Each
item says what the rule is, why the app thinks it applies, the ATO source,
and "raise this with your accountant". It's a prompt, not advice.

**What it is not:** it doesn't hunt for loopholes or schemes. Arrangements
whose main purpose is a tax benefit can be struck down under the general
anti-avoidance rule (Part IVA) with penalties — so where the records look
like one of those (e.g. a Hart-style split loan, idea 2), it flags a *risk*
for the accountant instead.

**Examples the app could check from data it already has or will have:**
- Unused concessional super cap that can be carried forward (the SMSF
  module already works this out) → a personal deductible contribution.
- Spouse super contribution offset; government co-contribution for a
  lower-income spouse.
- An investment property built after 1987 with no depreciation schedule
  attached → capital works deductions possibly unclaimed.
- Investment loan interest, borrowing costs (claimed over 5 years), and
  mixed-purpose loans not apportioned (idea 2).
- Shares or property held just under 12 months → selling a few weeks later
  may halve the taxable gain; capital losses available to offset gains.
- Sale timing: CGT falls in the year the contract is signed, not settlement.
- Prepaying up to 12 months of deductible expenses (e.g. investment loan
  interest) before 30 June.
- Private health cover vs the Medicare levy surcharge, by income.
- Rental or work expenses in bank transactions with no tax category, or
  claimed deductions with no receipt attached.
- At purchase time (Portfolio Plan): who should own a new investment —
  ownership can't be moved later without CGT and stamp duty.
- Trusts: distributions due by 30 June, with a caution about the ATO's
  rules on who really benefits (s100A — TR 2022/4).
- State: land tax thresholds and whether properties are held in a way that
  multiplies or shares them (Revenue NSW).

**Needs:** the ATO reference library (idea 3), each person's expected income,
debt allocation (idea 2), depreciation schedules.

**Refined after discussion — "go harder, legally":**
- Every item gets a risk rating so nothing is dropped just for being less
  conservative:
  - **Settled** — clearly allowed; claim it confidently with records.
  - **Arguable** — a reasonable position, but take it to the accountant with
    the reasoning and sources; consider a private binding ruling.
  - **ATO-targeted** — in an ATO taxpayer alert or outside a PCG "low-risk
    zone"; shown so the family knows where the line is.
- Where the ATO publishes risk zones (e.g. PCG 2022/2 for trust
  distributions), the app shows which zone the family's numbers fall in.
- **Private binding rulings:** for arguable positions, the app can prepare
  the facts for the accountant to ask the ATO in advance. A favourable
  ruling binds the ATO — the legal way to take a harder position with
  certainty.
- The best protection against scrutiny is the paper trail: each claim links
  to its evidence and ATO source, so it stands up if questioned.

---

## 9. Structure comparison — "who should own the next property, and why"

**Why:** the right owner is decided at purchase. Moving a property later
usually costs capital gains tax and stamp duty, so it's worth modelling
before buying. Also a record of *why* each existing property is owned the
way it is.

**Compare for a proposed purchase** (using the family's own incomes,
the property's expected rent, costs and loan):
- **Individual / joint:** negative gearing losses reduce the owner's own
  tax straight away; 50% CGT discount; main residence exemption possible;
  land tax threshold available.
- **Discretionary (family) trust:** income can go to lower-taxed family
  members each year; 50% CGT discount flows through; asset protection. But
  losses are trapped in the trust (no negative gearing against salaries);
  NSW land tax may apply without the usual threshold; s100A and family
  trust election rules.
- **Unit trust:** fixed shares (e.g. unrelated co-investors); losses also
  stay in the trust.
- **Company:** flat company rate (a passive rental company usually pays 30%,
  not the 25% base rate); no CGT discount; Division 7A if money is taken out.
- **SMSF:** 15% tax on rent, 10% on gains held over 12 months, 0% in pension
  phase; strict borrowing (LRBA) and related-party rules; commercial
  property can be leased to the family business at market rent.

**Output:** estimated tax each year and on a future sale for each option,
side by side, with the trade-offs in plain English, each rule linked to its
ATO or Revenue NSW source. Shown as modelling for the accountant, not a
decision.

**For existing properties:** a "why it's owned this way" note on each, and
a flag where the structure looks costly (e.g. a loss-making property in a
trust with nobody able to use the losses).

**Needs:** idea 3 (reference library) plus Revenue NSW land tax rules for
trusts; each person's expected income; idea 4 (profitability) for the
rent/cost/loan figures.

---

## 10. PAYG employees — deductions by occupation, salary packaging and car benefits

**Why:** most first-time investors are PAYG employees. Knowing exactly what
each person's occupation lets them claim — and what their employer lets them
package — maximises the refund. E.g. sales (with a car allowance) and
teaching.

**Per person:** occupation, employer, employment type (full-time, part-time,
casual), pay frequency (already tracked), and the benefits they get — car
allowance, novated lease, company car, fuel card, phone, laptop and so on.
Ties into the Fact Find's employment section, which isn't tracked yet.

**Occupation deduction checklist:** the ATO publishes an occupation guide
for dozens of jobs (including sales and marketing, and teachers and
education professionals), listing what can and can't be claimed. The app
would turn the relevant guide into a year-round checklist: each allowable
item, whether a receipt or record is on file, and what's still missing
before 30 June. Includes the general rules — work-from-home (fixed-rate or
actual-cost method), car (cents per km or logbook), self-education, tools
and equipment (immediate deduction under $300, otherwise depreciated).

**Car: allowance vs novated lease vs company car** — a side-by-side
calculator for the person's real numbers:
- Car allowance: taxed as income; car expenses claimed by cents per km
  (capped) or logbook.
- Novated lease: paid from pre-tax salary; fringe benefits tax applies
  (statutory or employee-contribution method). Electric cars under the
  luxury car tax threshold are currently exempt from FBT — confirm the
  current rules when building.
- Company car, fuel card: fringe benefits and their reportable amount.

**Other packaging:** salary sacrifice to super (links to the super caps),
FBT-exempt work items such as a laptop or phone used mainly for work, and
anything the employer or industry offers (e.g. some public-sector and
not-for-profit employers allow wider packaging).

**Important link to borrowing (idea 7):** deductions claimed in the tax
return don't reduce the gross salary lenders use for PAYG income. Salary
packaging does reduce it on the payslip — some lenders add some of it back,
others don't, and a novated lease is counted as a commitment. So the app
shows both results: tax saved, and the effect on borrowing capacity —
worth timing packaging around a loan application. Confirm lender treatment
with the broker.

**Scrutiny:** the ATO compares work-related claims with others in the same
occupation. Every claim links to its receipt or record and to the ATO
occupation guide, so a high claim is backed by evidence.

**To gather:** the ATO occupation guides for each person's job; the ATO
pages on car expenses, work-from-home expenses, self-education, salary
sacrifice, and FBT on cars and novated leases (including the electric car
exemption); each person's employment contract or benefits summary.

---

## 11. Turn features on or off

**Why:** not everyone needs every part of the app — SMSF, commercial
property, salary packaging, car benefits, Gmail import and so on. Hidden
features keep the menu and pages simple.

**Idea:** Settings → "Features": a switch for each module. Switched off,
it disappears from the menu, dashboard and pages, but its data is kept and
it comes back exactly as it was when switched on. Some features could also
be switched per person (e.g. car allowance only for the person who has one).

---

## 12. "Why is this claimed?" reference icon

**Why:** if the ATO or the accountant asks about a deduction, the reason and
the rule behind it need to be to hand — without cluttering everyday screens.

**Idea:** a small reference icon next to each claim (deductions, apportioned
loan interest, depreciation, car claims, ownership choices, structure
decisions). Nothing extra shows day to day; clicking the icon opens a panel
with:
- **Why it's claimed** — a short plain-English reason, written when the
  claim is made (the app suggests one from the checklist item; editable).
- **The rule** — the ATO reference (ruling code and paragraph, or guide and
  section), linked to the stored Tax reference document (idea 1) and opened
  at that page, with the date the reference was last checked as current.
- **The evidence** — the receipts, statements or logbook linked to the claim.
- **Who agreed** — an optional note from the accountant, with the date.
- **History** — when the claim or its reason changed.

**Also:** an "explain this claim" export — one PDF or ZIP with the reason,
the ATO extract and the evidence, ready to send to the accountant or the ATO
if a question is raised. And a warning if a claim's reference has since been
withdrawn or replaced.

**Depends on:** ideas 1 (Tax reference type), 3 (library), 8 and 10
(checklists), 2 (debt allocation).

**Addition — income statement (payment summary):**
- Each person's end-of-year income statement (from myGov; older years a
  PAYG payment summary) read into their year: gross salary, tax withheld,
  each allowance (e.g. car allowance) shown separately, reportable fringe
  benefits, reportable employer super contributions (salary sacrifice),
  and any lump sums.
- Checked against the payslips logged in pay tracking — flags a difference.
- Feeds the deduction checklist (a car allowance on the statement prompts
  the car claim), the tax estimate, the car comparison, and borrowing
  capacity (gross income as lenders see it).
- The app already has a "PAYG Summary / Income Statement" document type;
  this reads the figures out of it (checked by the person, since the text
  read from a scan can be wrong).

---

## 13. Expected insurance and documents — what's missing, as a checklist

**Why:** the app has places for insurance and documents but doesn't say what
*should* be there. It should predict what's normal for each person and asset,
flag what's missing, and give a list to go and find.

**Expected insurance, by what's recorded:**
| Asset / person | Expected | Flag |
|---|---|---|
| Rental property (house) | Landlord insurance; building insurance | Red |
| Rental property (strata unit) | Landlord contents; strata certificate of currency on file | Red / amber |
| Home you live in | Building and contents (building required by lender if mortgaged) | Red |
| Commercial property | Building; public liability | Red |
| SMSF property | Building, in the fund's (trustee's) name | Red |
| Car, motorbike | CTP (green slip — compulsory in NSW); comprehensive | Red / amber |
| Boat, jet ski, caravan, trailer | Boat or caravan insurance | Amber |
| Each adult | Private health (Medicare levy surcharge above the income threshold); life, TPD, income protection — often inside super | Amber (suggest, not required) |

- **Red** = required or effectively required (law or lender). **Amber** =
  normal for people in your position — worth checking.
- A flag shows on the asset or person, in the asset tree, and on the
  dashboard's "Worth doing" card.
- Each expectation can be dismissed with a reason ("covered by the strata
  policy", "held in super", "not needed") — kept on record, and it stops
  flagging.
- Needs a "CTP / green slip" kind added to insurance (currently only a
  general motor kind).

**Expected documents, by financial year:** the same idea for paperwork —
e.g. for each rental: rental statements, council and water rates, land tax
notice, insurance schedule, loan interest statement, depreciation schedule;
for each person: income statement, private health tax statement, super
statements; for each trust: deed, distribution minutes by 30 June. It ticks
itself off when a document of that type is linked.

**Printable checklist:** one list of everything expected but missing —
insurance and documents — grouped by person and asset, to print, save as
PDF, or take to the broker or accountant. Items tick off as they're added.

---

## 14. Shorter side menu — without adding clicks

**Done already:** Asset tree and Visualization merged into one entry
("Asset tree & diagram") with tabs; the menu opens the last-used tab.

**Options still to decide (menu has 26 items):**
| Option | Items saved | Extra clicks |
|---|---|---|
| A. Loans on one page — property loans, vehicle loans, credit cards and personal debts as sections of a single "Loans & cards" page | 3 | None (scroll instead) |
| B. Professional advisers as a section at the bottom of People & entities | 1 | None |
| C. Hide switched-off features (idea 11) — e.g. Gmail import, Portfolio Plan, Super | Varies | None |
| D. "Import a folder" and "Import from Gmail" as buttons at the top of Documents | 2 | One, only when importing |

Suggested: A, B and C; D optional.

---

## 15. Rebranding pass

**Why:** make the app look finished and its own — a stronger logo, more
colour choice.

**Today:** four colour themes (Midnight violet, Deep teal, Navy & pink,
Cobalt & lilac) × two styles (Bold, Soft), picked from the theme menu; the
keyhole logo sits small in the header and on the lock screen.

**Ideas:**
- **Logo:** redesign and make it more prominent — larger in the header,
  a proper lock/setup screen with the logo as the centrepiece, the browser
  tab icon, the Mac/Windows launcher icons, and on generated reports and
  Document Packs (cover page / letterhead). Offer two or three logo
  directions to choose from before building.
- **More colours:** add more themes (e.g. forest green, charcoal & gold,
  ocean blue, warm terracotta, plain greyscale), plus a dark mode for each.
  Possibly a "pick your own accent colour" option, with a contrast check so
  text always stays readable.
- **Name and wording:** check "Financial Vault" still fits now the app is
  mainly an asset management system — decide whether to keep it or rename.
- **Consistency sweep:** one accent colour, red only for delete and errors,
  touch targets ≥ 40px (PREFERENCES.md) — re-checked across every page in
  every theme, on desktop and phone.

---

## 16. Easier updates — drop the new version in, no moving folders

**Why:** today an update means renaming folders, unzipping and running the
copy script (START HERE.txt). It should be as simple as dropping in the
new download.

**Idea:**
- **Data lives in its own folder**, separate from the program (e.g.
  Documents/Financial Vault Data) — records, documents and settings. This
  was gap item 17, skipped earlier; it's what makes a simple update
  possible, because the program files can then be replaced without touching
  the data. Existing data is moved there once, automatically, on the first
  start after the change.
- **Updates folder:** drop the new ZIP (as downloaded, not unzipped) into an
  "Updates" folder inside Financial Vault. Next time it starts, it:
  1. checks the ZIP is a genuine, newer Financial Vault version;
  2. takes a full backup automatically;
  3. replaces the program files (never the data);
  4. installs and updates the database layout;
  5. keeps the previous version so it can be put back with one click;
  6. deletes the ZIP and shows "Updated to version X — here's what's new".
- **Chosen: from inside the app.** Settings → "Install an update" →
  choose the ZIP → same steps, then it restarts itself. (The Updates folder
  above can stay as a fallback for when the app won't start, but the in-app
  button is the main way.)
- If anything fails, it puts the previous version back and says so —
  records are never at risk.
- Works offline — no update server, nothing downloaded automatically.

---

## 17. Desktop icon, and its own window

**Why:** start Financial Vault from a desktop icon like any other program,
and have it open in its own window — not as another tab in a browser that's
already full of other things. Today it's a double-click on a script in the
program folder, a black terminal window that has to stay open, and a new
browser tab.

**Step 1 — quick win (no new libraries):**
- Create a **desktop icon** (Windows shortcut / Mac app icon) with the
  Financial Vault logo (ties to idea 15), made by the launcher the first
  time it runs.
- Open in an **app window**: Chrome and Edge can open a site in its own
  window with no tabs or address bar ("app mode"). Edge is on every Windows
  PC. On a Mac, use Chrome or Edge if installed, otherwise Safari's "Add to
  Dock". The window has the logo and title "Financial Vault" and shows up
  on its own in the taskbar / Dock.
- Hide or minimise the terminal window that runs the server.
- Closing the Financial Vault window stops it (or asks), instead of having
  to close the terminal.

**Step 2 — a proper desktop program (optional, later):**
- Package it as a real Mac/Windows app (e.g. with Electron — would need a
  new library, flagged per PREFERENCES.md). Own window, icon, installer,
  and Node.js built in — so a new computer doesn't need Node.js installed
  first, and there's no terminal window at all.
- Fits naturally with in-app updates (idea 16).
- Trade-off: a bigger download (~100–150MB).
