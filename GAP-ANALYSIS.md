# Gap analysis — September 2026

Financial Vault checked against the official documents now saved in
`reference/sources` (37 of them; see `reference/SOURCES.md`), and the
ideas list (`IDEAS.md`) checked for what can now be built.

These are organising aids, not tax advice. Anything that changes a tax
figure still goes past your accountant.

---

## Part A — Is the app right today?

### Checked and correct

| What the app does | Checked against | Result |
|---|---|---|
| Super contribution caps by year (2026-27: $32,500 / $130,000) | Key super rates and thresholds | Match |
| Transfer balance cap history ($1.6m → $2.1m from 1 July 2026) | Key super rates and thresholds | Match |
| Bring-forward limits ($1.84m / $1.97m for 2026-27) | Key super rates and thresholds | Match |
| Carry-forward of unused concessional cap (5 years, balance under $500,000) | Key super rates and thresholds | Match |
| Pension minimum percentages by age (4% to 14%, halved 2019-20 to 2022-23) | Key super rates and thresholds, table 11 | Match |
| CGT discount: half for people and trusts, a third for super funds, none for companies | CGT personal investors guide | Match |
| CGT 12-month rule (the day bought doesn't count) | CGT personal investors guide | Match |
| Losses come off gains before the discount | CGT personal investors guide | Match |
| Main residence exemption only for people, not trusts or companies | Rental expenses section | Match |

### Needs fixing

**A1. Property sale gain is too low when building write-offs were claimed.**
When a rental property is sold, the capital works deductions you claimed
over the years (the 2.5% a year building write-off) must be taken off
the property's cost before working out the gain. The app doesn't do
this, so it under-states the gain.
- Source: Rental expenses section, "Cost base adjustments for capital works".
- Fix: a "capital works deductions claimed" figure on each property
  (from the depreciation schedule or tax returns), taken off the cost on
  sale, with a note explaining it.

**A2. SMSF borrowing to buy residential property is no longer allowed for new loans.**
From 10 August 2026, a new SMSF limited recourse borrowing arrangement
(LRBA) can only buy business real property. Loans set up before then
aren't affected. The app lets you add an LRBA against any property
without a word.
- Source: new super legislation page; SMSFR 2012/1 is under review because of it.
- Fix: record whether the property is business real property and when
  the LRBA started. Show a warning if a residential property has an LRBA
  started on or after 10 August 2026. Update Help.

**A3. Extra tax on super balances over $3 million (Division 296) isn't flagged.**
From 1 July 2026, earnings on the part of a balance over $3 million are
taxed another 15%, and over $10 million another 10%.
- Source: new super legislation page.
- Fix: on the SMSF page, flag any member whose total super balance is
  over, or within 10% of, $3 million, with a link to the ATO page. No
  calculation of the tax itself; the fund's administrator does that.

**A4. Portfolio plans leave out buying costs.**
The plan works out the deposit from the purchase price alone. Transfer
(stamp) duty on a $1.35m NSW purchase is about $55,500, plus legal
costs. The cash needed for each purchase is under-stated.
- Source: NSW "How to calculate transfer duty" (general rates to $3.87m).
- Fix: add NSW transfer duty (worked out from the saved rate table) and
  an "other buying costs" figure to each planned property. Include them
  in the cash needed.
- Note for commercial property: the sale of a tenanted commercial
  property is usually GST-free as a "going concern" (GSTR 2002/5). If
  it isn't, 10% GST is added. A tick box would cover that.

**A5 (small). Payday super.**
From 1 July 2026, employers must pay super with each pay. The payslip
tracking could show a tick for "super paid this pay" so a missed
payment stands out.
- Source: new super legislation page.

**A6 (wording). Trust distribution ruling under review.**
TR 2022/4 (section 100A, trust distributions) is being reviewed after
the High Court's Bendel decision in June 2026. Any structure or trust
feature (idea 9) should say so until the ATO updates it.

---

## Part B — The ideas list: what can be built now

| # | Idea | Documents | Ready? |
|---|---|---|---|
| 1 | "Tax reference" document type | none needed | Waiting on your yes |
| 2 | Debt allocation (loan purpose tracking) | TR 2000/2, TR 95/25, TD 2012/1, rental interest pages — **all saved** | **Ready to build.** Your loan statements are needed to fill it in, not to build it |
| 3 | ATO reference library | done as the link pack and saved sources | Done (the in-app part is idea 18) |
| 4 | After-tax profit per property | Rental expenses, tax rates, NSW land tax, PCG 2026/2 link — **saved** | **Ready** (depreciation figures come from your schedules) |
| 5 | Suburb market data → valuation prompt | needs a data source decision (most are paid) | Needs a decision |
| 6 | Gap analysis | — | This document |
| 7 | Borrowing capacity and equity release | APG 223 (3% buffer), APRA settings, DTI limit — **saved**. ASIC RG 209 missing but not needed for an estimate | **Ready** |
| 8 | "Worth asking your accountant" checklist | Rental expenses, work-related deductions, CGT personal investors guide, rulings — **mostly saved**. Full CGT guide missing | **Ready** (property CGT items firm up with the full CGT guide) |
| 9 | Structure comparison | Tax rates, NSW land tax for trusts, PCG 2022/2, TR 2022/4 (under review) — **saved** | **Ready**, with the review caveat |
| 10 | PAYG deductions, car and salary packaging | Work-related deductions, car expenses, self-education, working as an employee, income statements, FBT rates — **saved**. Missing: your occupation guides, FBT on cars, FBT electric cars | **Mostly ready.** Car vs novated lease waits for the two FBT documents |
| 11 | Turn features on or off | none needed | Ready |
| 12 | "Why is this claimed?" reference icon | the saved sources are the references | Ready |
| 13 | Expected insurance and documents checklist | none needed | Ready (your message cut off at "printed or…"; assuming "printed or saved as PDF") |
| 14 | Shorter side menu | none needed | Waiting on your choice of A–D |
| 15 | Rebranding | none needed | Ready |
| 16 | In-app updates | none needed | Ready |
| 17 | Desktop icon and own window | none needed | Ready |
| 18 | Reference library that updates itself | link pack is ready | Ready |

---

## Part C — Suggested build order

Each batch is tested and committed before the next starts.

1. **Fixes first:** A1–A6 above. Wrong figures matter more than new features.
2. **Loans and tax trail:** debt allocation (2), "why is this claimed?"
   icon (12), and the tax reference document type (1) if you say yes.
3. **Property numbers:** after-tax profit per property (4) with NSW land
   tax, and borrowing capacity and equity release (7).
4. **Tax opportunities:** PAYG deductions and salary packaging (10),
   the accountant checklist (8), and structure comparison (9).
5. **Tidy-up:** feature switches (11), shorter menu (14), expected
   documents checklist (13), rebranding (15).
6. **Delivery:** desktop icon and own window (17), in-app updates (16),
   self-updating reference library (18).

Idea 5 (suburb data) waits until a data source is chosen.

## Still wanted from you

- A yes or no on the "Tax reference" document type (idea 1).
- Your menu choice, A–D (idea 14).
- For idea 2: loan statements, settlement statements and equity draw details.
- For idea 10: the ATO occupation guides for your jobs, "FBT on cars" and
  "FBT electric cars exemption" (links in `reference/SOURCES.md`).
