# Property investment extension: requirements for approval

Agreed in discussion on 28 September 2026, section by section. Nothing is
built until you approve this document.

## 1. What it does, in one paragraph

A new **Properties I'm considering** page (Planning group of the new
menu) shows every property you're looking at as cards in stage columns.
Each one is a normal property record marked "considering", so nothing is
ever re-entered. You add it with the address, asking price and who'd buy
it, then build it up: a three-column assessment, a due diligence
checklist, issues found, the offer, contract, finance and settlement.
Ticking "Settled" makes it an owned property that counts in your totals,
with its loan switched on. The assessment is frozen at that moment and
later compared with the real figures. Properties you pass on stay, greyed,
with your reason.

## 2. Approved features

### The list (sections 4, 18)
- Own page, "Properties I'm considering", in the Planning group.
- Stage columns: Looking, Investigating, Offer, Under contract,
  Settlement, then a greyed **Passed on** column at the end. On a phone
  the columns scroll sideways inside the board (the page itself doesn't).
- Each card: address, asking price, and expected yield and cash flow.
- A Residential / Commercial / All switch at the top.
- Bought properties leave the board and appear under Properties.
- Not on the Dashboard.

### The record (section 5)
- A considered property is a normal property record with a status.
  Buying it changes the status; nothing is copied.
- Left out of every total until bought.
- Adding one asks for: address, asking price, who'd buy it (any person,
  joint owners, a trust, a company or the SMSF). Everything else later.
- Same documents, notes and history as an owned property.
- New details on every property: suburb, kind (house, unit, townhouse,
  commercial) and title type (Torrens, strata, community). These are
  needed for the checklists and for searching later.

### Its page (section 18)
Opens as a normal property page, showing only what applies at its stage,
in this order:
1. Stage and the next step, with its button.
2. The assessment.
3. Open issues, then the checklist.
4. Details, documents and notes.

### Quick assessment (section 6)
- Three columns: expected, conservative, bad case.
- Shows yield (gross and net) and cash flow before and after tax; cash
  needed (deposit, stamp duty, costs, and open issue costs); loan, LVR and
  return on the cash put in; and "Can we borrow it?".
- Only what you enter: a figure shows once what it needs is entered.
- Commercial: also the advertised yield (typed in) beside the yield the
  leases and checked outgoings support.

### Due diligence (sections 7, 8, 9)
- Residential: the full list, picked automatically by kind and title
  type (strata checks only for strata, and so on).
- Commercial: all four groups (legal/title/planning, building, leases
  and tenants, environmental and safety).
- Nothing mandatory; "Not applicable" clears what doesn't fit.
- Add your own check to a single property.
- Development potential (subdivision, granny flat) as notes, always
  marked "not approved" until an approval document is linked.
- Each check has:
  - a status: not started, in progress, done, or not applicable;
  - a findings note and an estimated cost;
  - documents as evidence;
  - who's handling it (you, a person or an adviser);
  - a due date on the calendar;
  - checked or not checked.
- Grouped by area, each group showing "x of y done".
- Commercial leases entered or read on the existing lease screens; they
  carry over when bought.

### Issues (section 10)
- "Problem found" on a check; open problems gather in an Open issues box.
  An issue not tied to a check can be added too.
- No ratings. Open issue costs are a line in cash needed.
- Resolved issues stay, greyed, with how they were resolved.

### Buying it (section 11)
- Stages and steps:
  - Offer: offer made (amount, date), accepted.
  - Under contract: exchanged, deposit paid, cooling-off ends, finance
    approved, building and pest cleared.
  - Settlement: date booked, final inspection, funds ready, settled.
- Each step keeps the date it was ticked.
- The loan is recorded at "finance approved" but not counted until
  settlement; ticking "Settled" switches on the property and its loan.
- A Portfolio Plan's planned purchase can be linked to a considered
  property and uses its figures; the link carries on once bought.

### Passed on (section 12)
- "Pass on this one" asks for the reason in your own words, and keeps
  the date. Everything else is kept. Never shown as an investment.

### Estimate vs actual (section 13)
- The assessment is frozen as it stood at purchase.
- An "Estimate vs actual" box on the bought property's page: price and
  buying costs, then each year's rent, running costs and cash flow
  (from Profit year by year).

### Packs (section 15)
- Four separate buttons: broker, accountant, solicitor/conveyancer,
  due diligence summary.
- Each a ZIP: a PDF summary plus the chosen documents, like Document
  Packs. Each says it prepares you for advice, not replaces it.

### History (section 17)
- No extra change list. The frozen assessment and passed-on records can
  be corrected, with the original value and date of change kept and
  shown.

## 3. Rejected
- What-if rows; agent's figures side by side (section 6).
- Saving your own check templates (section 9).
- A separate risk register; likelihood and severity ratings (section 10).
- A link to "Who should own it?" (section 11).
- Recording later sale prices or rents (section 12).
- Assessment versions at each stage; a portfolio-wide comparison; a
  summary of how far off estimates tend to be (section 13).
- One combined pack with tickable sections; Word format (section 15).
- A change history list (section 17).
- A Dashboard box (section 18).

## 4. Deferred (later versions)
- Searching past properties: filters by price and yield, suburb and
  type; compared against bought and passed-on. No online property data,
  no AI matching (section 14).
- For owned homes and rentals: repairs log on the property page, dated
  improvements list, value history, tenancy history (section 16).

## 5. Existing parts reused (not rebuilt)
- Property pages (residential and commercial), with boxes shown by stage.
- Stamp duty and buying costs (Portfolio Plan).
- After-tax profit, land tax and tax (Property Profit report).
- "Can we borrow it?" and usable equity.
- Commercial yield and cash-flow figures (Acquisition Model).
- The What's missing checklist system (for due diligence checks).
- Leases and lease reading (commercial).
- Document links, the calendar and reminders, people and advisers.
- Portfolio Plan's "bought" link.
- Document Packs and the printout with your logo.
- Profit year by year (for actual figures).

## 6. Existing parts that change, and why
- **Every total** must leave out considered and passed-on properties, and
  loans not yet counted. That covers net worth, the dashboard, tax,
  reports, borrowing, land tax, profit years, capital gains, What's
  missing, the tree and diagram, the readable folder copy, packs, Fact
  Find and monthly snapshots. It's done the same way sold properties are
  left out today, through one shared rule, with a test for each total.
- **Properties page:** shows owned properties only.
- **Loans:** a "not counted yet" state, used only for approved loans on a
  property not yet settled.
- **Portfolio Plan:** a planned purchase can link to a considered
  property as well as a bought one.
- **Acquisition Model:** its calculations shared with the commercial
  assessment, so there's one set of formulas.
- **What's missing:** its checklist system gains the extra check details
  (findings, cost, who, due date, checked), used by due diligence. The
  What's missing list itself looks the same.

## 7. Genuinely new
- The considering board and "Add a property I'm considering".
- Stage and step records.
- The due diligence lists (residential by kind and title type;
  commercial four groups) and each property's checks and issues.
- The three-column assessment, its frozen copy and corrections.
- The Estimate vs actual box.
- The four packs.

## 8. Your existing data
- Every existing property and loan is marked owned and counted, so
  nothing you have changes.
- The installed program already backs up the whole vault before any
  update, and restores it if the update fails.
- Database changes only add; nothing is renamed or removed.

## 9. Main risk
A considered property or not-yet-counted loan slipping into a total
somewhere. Guarded by the one shared rule and a test for every total,
plus a browser check of each page with a considered property present.

## 10. Proposed order (each step a release you can use)
0. The menu reorganisation and Getting started card (already agreed, on
   hold), so the Planning group exists.
1. Foundation: status, suburb, kind and title type; every total leaves
   considered properties out (with tests); the board; adding one;
   passing on.
2. The quick assessment (three columns).
3. Due diligence checks and issues.
4. Offer to settlement: steps, loan at approval, "Settled", Portfolio
   Plan link.
5. Frozen assessment and Estimate vs actual.
6. The four packs.

This is a large build: about as much as everything since 1.9.0 put
together.

## 11. To confirm
- Three columns: "expected" uses the property's own boxes (rent, running
  costs, loan rate). Conservative and bad case each have their own rent,
  vacancy, costs and interest rate, and show once filled in.
- Order: menu first (step 0), then steps 1–6.
