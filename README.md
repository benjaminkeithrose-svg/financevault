# Financial Vault

A private, local-first personal financial management and document system for
an Australian individual/family. It is **not** a replacement for a
registered tax agent, accountant, financial adviser, bank or regulated
accounting system — it organises your own records and evidence so you can
hand them to one quickly.

See the project brief for the full design spec. This repository currently
implements **Stage 1 and Stage 2** of the staged build, plus the Commercial
Property module (Phase 1-4), a subsequent architecture correction, a
Visualization tab, Net Worth/Tax/Reports, Document Packs with payslip
tracking (Stage 4), a UI/UX pass against `PREFERENCES.md`, fractional/joint
ownership, a multi-property Portfolio Plan, parcel-level investment and
CGT tracking, bulk folder import, CSV transaction import, Gmail email
import, a double-click local launcher and a one-click backup, all described
below.

**Using it:** the user guide is built into the app — open the menu and choose
**Help**, or tap the **?** next to a screen's title to jump to the part about
that screen. **Print this guide** on the Help page gives a paper or PDF copy.
This README is the technical reference.

### People, family and structures

Every person is also an entity: adding a person creates their personal
(INDIVIDUAL) entity in the same step and links it, so nothing is set up
twice; renaming the person renames it (unless it was given its own name),
and it's deleted with them — which is refused while it still holds
anything. People recorded before this get one on the next start, adopting
a hand-made individual entity they were the sole owner of where one exists.
People and the trusts/companies/funds around them share one list, **People
& entities**, and the Visualization draws a person and their personal
entity as one box.

People can be linked as partners and as parent/child. When someone becomes
trustee, appointor or settlor of a trust, their partner and children not
already beneficiaries are offered in a ticked list; only those left ticked
are added.

Each person has **ID & cover** records (private health, Medicare,
licence, passport and so on) with scans attached. The numbers are
encrypted like TFNs, shown masked, and revealed only on request (audited);
the reset-passcode script clears them along with the other encrypted
fields. The Broker Pack's **ID documents** chip bundles the scans for the
people connected to an entity.

### Items, servicing and the expiry calendar

Any asset can hold **items** (sub-assets) — an air conditioner in a
rental, a washing machine at home, an outboard on a boat — each with make,
model, serial, purchase date and price, warranty expiry, documents and a
**service log** (date, work, cost, provider, next due). An item's total
cost to own is its price plus everything spent since. Items are part of
their parent's value and never counted in totals; an asset with items under
it can't be deleted.

The **expiry calendar** at the bottom of Visualization gathers ID and cover
expiries, document renewal dates, rego, warranties, services due, lease
expiries and rent reviews, and fixed-rate and loan-term ends. **Add to my
calendar** downloads an `.ics` file (all-day events, a reminder two weeks
before, stable ids so re-importing updates rather than duplicates).

### Working in the app

The menu is grouped by what things are, each with exactly one home:
**Documents** (To review — the old Inbox —, Documents, Import a folder,
Import from Gmail), **Who owns it**, **Assets** (Properties, Vehicles &
boats, Investments, Bank accounts, Super, Other assets), **Liabilities**
(Property loans, Vehicle & boat loans, Credit cards, Personal & other) and
**Plan & report**. There is no catch-all asset or liability list repeating
the others; a record's back button returns to the list it belongs on.

The menu can be pinned down the left on wide screens (remembered in the
browser). Create forms keep a draft in the browser when left half-filled
and offer **Clear** beside their main button; secret numbers are never
drafted.

**Look and feel** (bottom of the menu, or Settings) offers four colourways
— Midnight violet, Deep teal, Navy & pink, Cobalt & lilac — in a **Bold**
(square, heavy-bordered, solid header) or **Soft** (rounded, light) style.
The choice is kept per browser in `localStorage` (`fv-theme`), applied as
`data-theme` / `data-style` on `<html>` (see `web/src/theme.ts`), and also
colours the Keyhole browser-tab icon. Red stays reserved for destructive
actions and errors in every colourway.

### Shared ownership and unit trusts

Assets and loans can have several owners with percentages
(`AssetOwnership`, `LiabilityOwnership`). Create forms send `owners:
[{entityId, percent}]` (two or more, adding to 100%); the first becomes the
owner on record (`entityId`). `services/ownership.ts` `shareOf()` gives an
entity's share: listed shares as written, and the owner on record keeps
whatever isn't listed. `computeLiveBreakdown()` counts full values for the
whole family (no entity), and each record at the entity's share when one is
chosen, plus — with `lookThrough` — its share of any unit trust's net
assets (`EntityRelationship` type `UNITHOLDER` with `ownershipPercent`,
into an entity of type `UNIT_TRUST`; capped at 100%, one row per holder,
followed through nested trusts without loops). The dashboard's by-entity
table turns look-through off so its rows still add up to the family total.
`TRUST` is a family (discretionary) trust: beneficiaries, no set shares.

A new person can be linked to both parents at once; the first parent's
partner is suggested as the second.

### Self-managed super funds

An entity of type **SMSF** gets its own section at the top of its page
(`web/src/components/SmsfPanel.tsx`, `server/src/routes/smsf.ts`):

- **Members and contributions** — members are People with a MEMBER role
  (up to six). Contributions are recorded by source, which decides the cap
  (`services/superRules.ts` `CONTRIBUTION_SOURCES`; downsizer and small
  business CGT amounts count to neither). Caps are per person across all
  their funds, so contributions into other funds can be recorded too.
  Concessional carry-forward (5 years, from 2018-19, total super balance
  under $500,000 at the previous 30 June) and non-concessional bring-forward
  (thresholds from the transfer balance cap) are worked out from what's
  recorded. Caps by year are in the `RULES` table — add a row each July; a
  year past the table uses the last row and says so.
- **Pensions** — account-based and transition to retirement, with the
  minimum by age (halved 2019-20 to 2022-23), first-year pro-rating (none
  when started in June), rounding to $10, the 10% TTR maximum, payments,
  the transfer balance cap check and an estimate of the tax-free (ECPI) share.
- **Property with an LRBA** — liability type `LRBA_LOAN` owed by the fund,
  secured on the fund's property, with `holdingTrustEntityId` pointing at a
  `HOLDING_TRUST` entity. Counted with property loans in Net Worth. Rent
  cover uses `Property.weeklyRent` or a commercial property's active leases.
- **Trustee and compliance** — `SmsfDetails` (trustee type/company,
  auditor, who lodges, latest return lodged, strategy review). Annual
  return (15 May via agent, 31 Oct self-lodged, 28 Feb first year, or an
  entered date), auditor appointment 45 days before, strategy review, ASIC
  company review and pension dates (minimum by 30 June, TBAR) feed the
  expiry calendar (`services/smsf.ts`).

Super history blocks deleting a person or fund rather than being deleted
with them.

### Vehicles, boats and borrowing

**Vehicles & boats** (menu → Assets) records cars, motorcycles, boats, jet
skis, caravans, campervans and trailers with year, make, model, rego and
expiry, and VIN or hull ID. A **vehicle / boat loan** (or a personal loan)
can be linked to the vehicle it paid for; the vehicle's page then shows
what's owing, the monthly repayment and equity, and a vehicle can't be
deleted while a loan is linked. Vehicle loans are their own line in Net
Worth.

Credit cards carry a **credit limit**, and every loan a repayment amount
and frequency. **Reports → Debt Summary** is laid out for a loan
application: total debt, total credit card limits (lenders assess cards on
the limit, not the balance) and total monthly repayments, with a warning
for any card without a limit or loan without a repayment so the totals
aren't silently short. The Broker Pack's assets and liabilities statement
carries the same limits, monthly repayments and security.

### Deleting records

Every record type can be deleted from the bottom of its own page, always
after a confirmation. Deletes never quietly take history with them: a
commercial property with tenancies, outgoings, capital works, snapshots or a
secured loan; a residential property with a secured loan; an investment
account with purchases, sales or dividends; and an entity that still owns
anything are all refused with a message naming what's in the way. Bank
accounts are the exception — deleting one deletes its transactions too,
after a warning with the count, because transactions come from the bank's
CSV and can be imported again. Moving an account to another entity moves its
transactions with it. Documents offer **Archive** (kept, hidden from the
everyday lists) or **Delete permanently** (record and stored file removed).
Deleting a record removes document links pointing at it but never the
documents themselves.

### Backup

Settings → **Download full backup** streams a single ZIP containing the
whole database and every original uploaded document (still encrypted) —
everything needed to restore Financial Vault elsewhere. On a fresh copy
with no passcode set, the first screen's **Restore from this backup** loads
one (`POST /api/vault/restore`, `services/restore.ts`): it checks the file
is a Financial Vault backup, sets the empty database aside, brings the
backup's database up to the current version with `prisma migrate deploy`,
unpacks the documents into the storage folder and relinks them, and puts
everything back if any step fails. It refuses when a vault already exists,
so it can't overwrite records. The dashboard reminds you when the last
backup is more than 30 days old. The database is copied via SQLite's own
`VACUUM INTO`, so a backup taken while the app is in use is always a
consistent point-in-time copy, never a half-written file. Nothing is
uploaded anywhere; the file goes straight to your browser's downloads.

Settings → **Document storage location** lets you point new uploads at a
folder inside a Google Drive/OneDrive/Dropbox sync folder instead of the
app's default storage folder, so every new document is backed up
automatically as you go, on top of the one-off ZIP above. Only documents
uploaded from that point on move to the new location — anything already
stored stays exactly where it is, since its recorded path is what's used to
find it (nothing is bulk-moved on save). The setting is validated up front:
the path must be absolute, and the app confirms it can create/write to that
folder before accepting it. This does **not** relocate the database file
itself — that's fixed at process start via `server/.env`'s `DATABASE_URL`
and needs a manual edit plus restart to move, which the Settings page's own
text explains. If you use the app from two computers sharing a synced
folder, avoid running it on both at once — the SQLite database itself
isn't safe to sync live, only the documents folder is.

### Insurance, estate papers and reports for lenders

- **Insurance** (`routes/insurance.ts`, `/insurance` in the menu): each
  policy hangs off what it covers — an asset, or a person for life/TPD/
  trauma/income cover (optionally held in super) — with insurer, encrypted
  policy number, cover, premium and renewal date. Renewals go into the
  expiry calendar; policies appear in the asset tree.
- **Wills and estate papers** (`routes/estate.ts`, on each person's page):
  will, powers of attorney, guardianship, advance care directive, and super
  death benefit nominations. A lapsing binding nomination defaults to
  lapsing three years after signing; lapse and review dates go into the
  calendar.
- **Joint bank and investment accounts** take owners with percentages like
  properties and loans, and count by share in each owner's figures and in
  the Broker Pack statement (which now shows each line's share and full
  amount).
- **Offset accounts**: a bank account of type Offset names the loan it
  offsets; the loan page and Debt Summary show the balance interest is
  charged on and roughly the interest saved.
- **Income & Spending** (Reports, `services/cashflow.ts`): money in and out
  by month over the last 3/6/12 whole months from bank transactions, by
  category, with monthly averages from the first month on record.
  Transfers between your own accounts (an out matched by the same amount
  into another account within three days) are left out.
- **Selling**: marking an asset sold keeps it on record, drops it from
  totals from the sale date, and works out the capital gain per owner for
  property and similar assets (cost base = purchase + buying costs +
  improvements + selling costs; main residence exemption for people only).
- **Worth doing** on the dashboard: a getting-started checklist, the backup
  reminder, and values not updated for a year. A net worth snapshot is
  saved automatically once a month.
- **Personal & contact details, and a Fact Find pack**: each person's page
  has phone, email, current/previous address, marital status and next of
  kin (`routes/people.ts`); mother's maiden name is kept encrypted like a
  TFN, since it's a security-question answer, not an address. A family-wide
  **Professional advisers** list (`routes/advisers.ts`, `/advisers`) keeps
  the accountant, solicitor, real estate agent and financial adviser in one
  place. Document Packs' **Fact Find** summary
  (`factFindCsv` in `routes/documentPacks.ts`) is laid out with the broad
  sections every Australian broker's fact find asks for — personal/family/
  ID/employment/assets/liabilities/insurance/advisers, filled in from your
  own records — leaving blank what's a one-off answer for that application
  (loan purpose, the responsible-lending questions) or isn't tracked
  (employer details, a forward expense estimate). It never includes an
  encrypted number; tick the ID documents chip for scans instead.

### Investments, shares, ETFs and crypto

Record-keeping and valuation for shares, ETFs, managed funds, crypto and
super — explicitly **not** a trading platform. Nothing here places orders,
connects to a broker, streams quotes, or suggests what to buy or sell.

**Parcels, because Australian CGT is parcel-level.** Every purchase is its
own parcel with its own date and cost base. The 50% CGT discount depends on
how long *that* parcel was held, so one sale can be part discounted and part
not — which the app shows you per parcel rather than as a single blended
number. Sales draw from the oldest parcels first, and a preview shows the
gain, the discount and which parcels it would come from **before** anything
is recorded, because that choice has real tax consequences.

The discount rate follows the owning entity: half for individuals, joint
owners and trusts, a third for super funds and SMSFs, none for companies.
Losses are never discounted. The twelve-month test excludes the day of
acquisition, so exactly twelve months does not qualify.

**Dividends carry their franking.** Franked and unfranked amounts and the
franking credit are recorded separately, since that is the point of the
record for an Australian investor. A dividend reinvestment creates the
parcel it actually bought, at the reinvestment price — otherwise the cost
base of those units quietly disappears.

**Prices.** Settings → **Market price lookups** (off by default) lets the app
fetch prices from Yahoo Finance for shares and ETFs and CoinGecko for
crypto, neither of which needs an account or API key. A lookup discloses
only *which codes you hold* — never quantities, values, accounts or anything
identifying you — and prices refresh only when you press the button; nothing
polls in the background. Entering prices by hand is a first-class path, and
the normal one for managed funds and super where no free feed exists.
Prices are kept as dated history, so a net worth snapshot keeps the price it
was actually taken with. Where no price is known, market value is shown as
unknown rather than falling back to cost, which would read as a zero gain.

**Reports → Capital Gains** gives a per-financial-year summary: every
disposal with its proceeds, cost base, gain or loss and whether the discount
applies, then a per-entity net capital gain, plus dividend income and
franking credits — the figures an accountant asks for. Netting is done per
entity (one taxpayer's losses can't offset another's gains), with the year's
losses applied *before* the discount — against non-discountable gains first,
the order that leaves the most gain eligible — and any excess shown as a loss
carried forward. Losses carried in from earlier years aren't included. The
Tax Summary report shows the same calculated gain per entity. As everywhere
else in this app, these are calculations from your own records for your
accountant to confirm, not tax advice.

### Bulk import

`/bulk-import` is for loading a whole folder at once — a first-time load of
years of accumulated paperwork.

- Files upload a few at a time with live progress, and a file that can't be
  read fails on its own rather than abandoning the rest of the run.
- Afterwards the imported documents are **grouped by what they look like**
  (proposed type plus source folder) rather than listed individually, so a
  run of bank statements is one decision instead of fifty. Least confident
  groups sort first. Setting a type, entity or financial year applies to
  every file in the group; anything left blank keeps whatever the
  classifier proposed per document.
- Picking a folder keeps its structure as a signal, because it reflects
  filing you did deliberately: a file under `Tax Returns/2023-24` takes
  that financial year directly, which is more reliable than inferring it
  from a date on the page. Only explicit year ranges (`2023-24`, `FY24`)
  are read — a bare `2023` is ambiguous between two financial years, so
  it's left for you to set rather than guessed.
- Duplicates are detected by content hash, so re-importing a folder you've
  already loaded adds nothing.
- Batches are saved and have their own URL, so closing the page mid-review
  doesn't lose a large import.

### Importing bank transactions from CSV

On a bank account's page, **Import transactions from CSV** loads a date
range exported from your bank's website. This is deliberately preferred
over reading transactions out of PDF statements, which is unreliable —
statements are best kept as evidence, with the transaction data coming from
the CSV export.

Australian bank exports have no common format: CommBank ships no header row
and writes credits as `+1234.56`, Westpac splits money in and out across
two columns, NAB carries both a transaction *type* and *details* column.
Rather than maintain a guessed profile per bank — which mis-imports
silently the moment a bank changes its export — the file is inspected, the
columns and date format are proposed, and you confirm them against a
preview before anything is written. Accounting-style negatives `(25.50)`,
two-digit years and `14 Mar 2024` style dates are all handled.

Re-importing an overlapping range is safe: a transaction matching one
already stored on the same account by date, amount and description is
skipped, and the preview says how many that will be before you commit.

### Email import (Gmail)

Financial documents mostly arrive by email, so `/email-import` pulls them
straight out of Gmail as attachments instead of needing them saved and
re-uploaded by hand.

- **Rules are ordinary Gmail searches.** A rule is just a name plus a query
  in Gmail's own search syntax — `from:commbank.com.au has:attachment
  filename:pdf` — passed through IMAP's `X-GM-RAW` extension, so anything
  that works in Gmail's search box works here. A rule can also propose a
  document type and entity, applied only where the classifier couldn't
  work it out from the document itself; it never overrides what was read
  out of the document, and never marks anything confirmed.
- **Imports run only when asked.** Nothing polls Gmail in the background.
  You press "Import now" and it runs, which also means nothing can quietly
  fill the Inbox while you aren't looking.
- **Attachments go through the same pipeline as a manual upload** — the
  same content hashing, de-duplication, OCR, classification and audit
  logging — so an imported document is indistinguishable from a dragged-in
  one apart from being marked `GMAIL` as its source. New documents land in
  the Inbox awaiting confirmation; nothing is filed automatically.
- **Nothing is ever imported twice.** Every attachment seen is recorded by
  message ID and filename, so re-running an import repeatedly is safe. The
  history table shows each one and what happened to it (imported, already
  had it, or skipped as not a document / too large).
- **Mail is only ever read.** Mailboxes are opened read-only — nothing is
  sent, deleted, moved or even marked as read.

**Connection uses a Gmail app password, not OAuth.** This is a deliberate
tradeoff. OAuth's `gmail.readonly` is a *restricted* scope: an unverified
personal app has to stay in Google's "Testing" publishing status, where
refresh tokens expire every 7 days — meaning a weekly re-consent through a
Google Cloud project you'd have to create yourself. An app password is one
paste and keeps working. The honest cost: an app password grants broader
IMAP/SMTP access than a read-only scope would. It's stored encrypted, under
a key that only exists while the app is unlocked (see Security), and it can
be revoked at `myaccount.google.com/apppasswords` at any time without
changing your Google password.

### Portfolio Plan

A saved, multi-property purchase plan — built from a portfolio-compounding
illustration (a real estate agency's "$100k passive income" style plan) plus
three of its accompanying single-property calculators (a cashflow-by-
financing-scenario comparison, a debt paydown projection, and a cash-on-cash
ROI calculator). Unlike the Acquisition Model / Scenario Comparison
calculators (deliberately ephemeral — nothing persisted), a Portfolio Plan's
assumptions and planned properties are saved so you can follow a purchase
from inception through to trending it against what actually happened.

- **Assumptions**: interest rate, rental/capital growth rate (this model
  uses one rate for both, matching the source illustration), cap rate
  (derives a property's starting rent when you don't enter one), default
  refinance target LVR, default deposit %, an annual cash contribution, and
  how many years to project.
- **Properties**: add as many planned properties as you like, each with its
  own purchase year, price and starting LVR. A property's value and rent
  both grow at the plan's rate every year; its loan is interest-only and
  held flat until you add a **refinance** for it at a chosen year, at which
  point the loan resets to the target LVR against the property's value at
  that point — released equity becomes visible as that property's
  "redeployment capacity" (its accumulated cashflow plus what refinancing
  now would release). Nothing about when to refinance or buy next is
  auto-decided — the plan surfaces the numbers, you make the call, exactly
  like the source illustration.
- **Actual vs predicted**: once a planned property is actually purchased,
  link it to its real Commercial Property record. From that year on, the
  projection table shows the real numbers from that property's saved
  annual snapshots right next to the prediction — a genuine trend of
  planned-vs-actual, not a guess.
- The whole year-by-year table is computed live from the saved assumptions
  every time you view it, never persisted itself, so changing an assumption
  is reflected immediately rather than needing a recalculation step.
- **Funding cost**: portfolio-compounding illustrations like the source
  material tend to make equity pulled out for a deposit look like money
  that just appeared — the ongoing cost of servicing it disappears. A
  planned property can now have a **funding source**: equity drawn from a
  REAL property you already own (elsewhere in the system, not this plan),
  at an explicit amount and rate. From that year on, the projection charges
  that draw's interest cost against the funded property's own cashflow —
  shown as "Funding cost" and "Net after funding" alongside the ordinary
  figures — and reports the year it actually becomes positively geared
  once that cost is included, not just when its own rent covers its own
  loan. The source property's current value/debt/LVR is shown live as a
  headroom check. (Refinancing a property that's already *in* the plan is
  unaffected — its cost was always captured correctly via its own higher
  loan balance after the refinance, so this only covers the previously
  invisible case: drawing on an existing, otherwise-untouched asset.)

### UI/UX styling pass

The app was rebuilt visually against `PREFERENCES.md` now that enough of it
exists to make that worthwhile. This was a presentation-only pass — no
schema, API or business-logic changes.

- **Light theme**: pale background, white cards with a 3px accent stripe
  down the left edge and a faint shadow, one accent colour for actions,
  uppercase grey section headings, 40px+ touch targets, 16px inputs (so
  phones don't zoom in).
- **Navigation**: the permanent sidebar and always-visible search bar are
  gone. A header now shows a back chevron (goes up one level in the app's
  structure, not through browser history) and a home icon, plus a search
  icon that opens full-screen search and a menu icon that opens a
  full-screen list of every section — hand-rolled SVG icons, no icon
  library added.
- **Lists → cards**: the top-level record lists (Documents, Inbox, People,
  Entities, Assets, Liabilities/Loans, Properties, Commercial Properties,
  Investments, Banking) are now tap-to-open cards carrying just a name and
  one or two identifying details, with a value/status badge on the right.
  A new `/assets/:id` detail page was added so every asset card has
  somewhere to go. Dense ledger-style data inside a detail page (tenancy
  outgoings, transactions, pay-period tracking) was deliberately kept as
  tables — that's data comparison, not a list of records to tap into.
- **Chips and segmented controls**: multi/single-select option sets
  (document status filters, commercial property type selection, Document
  Pack chips) use pill-shaped chips; the two-option Residential/Commercial
  toggle uses a segmented control.
- **Not changed in this pass**: the no-Save-button/Done-and-discard-drafts
  entry-screen behaviour from `PREFERENCES.md` is a real behavioural
  change, not a visual one — "Add"/"Create"/"Save" buttons still work as
  explicit actions, just restyled. A future pass could take this on
  separately.

### Document Packs and pay tracking

- **Pay tracking** (on a Person's detail page): set a pay frequency
  (weekly/fortnightly/monthly) and the app generates the expected pay
  periods for a chosen financial year. Each period is Logged (a payslip
  document attached, amount optional), Non-working (explicitly marked as
  an intentional gap — e.g. a casual employee's week off — so it's never
  flagged as missing), Missing (expected, past, nothing recorded — a
  genuine gap to chase up) or Not yet due (in the future, never flagged
  early). A period can be logged by uploading a new file or linking an
  already-uploaded one.
- **Document Packs** (`/packs`): builds a ZIP for a chosen entity (and
  optionally a financial year) from chips you tick yourself — nothing is
  bundled automatically, so a pack only ever contains what you chose.
  Document chips mirror the existing document type catalogue (Tax,
  Property, Investment, Personal, Finance, Trust/Company, Commercial
  Property) plus an Income chip covering payslips/PAYG summaries, whether
  uploaded directly or logged against a tracked pay period. Generated
  summary chips (Assets & Liabilities Statement, Tax Summary, Income
  Summary) are CSVs built live from current records, never from uploaded
  documents, so they're always current. A chip with nothing behind it
  can't be selected. "Broker Pack" and "Accountant Pack" presets pre-tick
  a sensible starting set — every chip stays editable afterwards. The ZIP
  always includes a `document_index.csv` listing every original document
  bundled (name, type, entity, date, financial year, source).

### Net Worth, Tax and Reports

- **Net Worth** (`/net-worth`): a live balance-sheet breakdown (cash,
  property, shares/investments, super, vehicles, other assets; mortgages,
  credit cards, personal loans, other liabilities), viewable consolidated
  or per-entity. "Save snapshot" writes an immutable point-in-time record
  — later changes to your assets/liabilities never rewrite a snapshot
  already saved — and any two snapshots can be compared side by side.
- **Tax** (`/tax`): pick an entity and a financial year to see its income,
  expenses and capital gains/losses, each with a status
  (Recorded/Estimated/Needs review/Accountant confirmed — never presented
  as a final figure), plus the documents already tagged tax-relevant for
  that entity and year.
- **Reports** (`/reports`): Property Performance (residential — equity,
  gross rent, expenses, net cash flow, estimated yield), Investment
  Portfolio (cost base, market value at the latest recorded price,
  unrealised gain where every holding is priced, realised gain/loss and
  franking), Capital Gains, Tax Summary by financial year (including the
  calculated share-sale gain per entity), and Debt Summary with LVR against
  whatever secures each loan.
- The Dashboard, Net Worth and each entity's balance sheet share one
  calculation, so their totals always agree: bank balances, property,
  tracked holdings (at the latest price, or cost where unpriced), manually
  entered investments, super, vehicles and other assets, less every
  liability.

### Visualization

A `/visualization` page renders the whole ownership structure as a
flowchart — People at the top, Entities below them, Assets/Accounts below
that, and Liabilities at the bottom, connected by the same relationships
already recorded elsewhere in the app (person-entity roles, entity
ownership, loan security). Every node is clickable and opens its real
detail page — the diagram is a navigation surface, not a static picture.
It's a custom lightweight SVG layout (no charting/graph library added) fed
by a new `GET /api/graph` endpoint.

Settings → Landing page lets you promote it to be what opens at `/`
instead of the Dashboard, without changing any routes — exactly the "push
it to the front later" behaviour asked for.

### Architecture correction: People vs. Entities vs. Assets

An early version of the schema let an `Entity` have `entityType` values of
`PROPERTY`, `BANK_ACCOUNT` and `INVESTMENT_ACCOUNT` — conflating the
ownership layer with the things being owned. This has been corrected:

- `Entity` is now strictly a legal/ownership vehicle: `INDIVIDUAL`, `JOINT`,
  `TRUST`, `COMPANY`, `PARTNERSHIP`, `SUPER_FUND`, `SMSF` or `OTHER`.
  Properties, bank accounts and investment accounts are Assets/Accounts
  that belong *to* an entity, never entity types themselves.
- A new **Person** model represents the human, separate from the Entity
  they act through — a Person never owns an Asset directly. Instead a
  `PersonEntityRelationship` records their role (trustee, director,
  shareholder, beneficiary, settlor, member, individual owner, joint
  owner, guarantor, borrower, appointor, accountant, tax agent).
- Every Entity now has a computed **financial position** (total assets,
  total liabilities, net assets, broken down by asset type) calculated
  only from what that entity directly owns — a trust's balance sheet is
  never conflated with the personal net worth of its trustee or
  beneficiaries.
- The Dashboard's "All entities" view now also shows a **consolidated,
  by-entity breakdown** — explicitly labelled as a user-level convenience
  view, not a formal accounting consolidation, with each asset counted
  under exactly one entity.
- **Fractional/joint ownership**: the `AssetOwnership` table now has a UI —
  an "Ownership split" panel on Asset, Property and Commercial Property
  detail pages lets you record splits (e.g. 50/50 between two entities) on
  top of the asset's primary owning entity, which is never changed by
  adding a split. If recorded splits don't total 100%, it's flagged as an
  informational note, not blocked — the figures are recorded as entered.
- The nav now visually groups People / Entities / Assets / Liabilities
  rather than flattening everything into one list.

### Stage 1

- Relational data model (entities, documents, financial years, tax
  categories, assets, liabilities, accounts, transactions) designed so later
  stages (properties, investments, loans, tax, packs, Gmail) plug in without
  schema rework.
- Document upload with SHA-256 integrity hashing, OCR (PDF text extraction +
  image OCR), and a local heuristic classifier that proposes document type,
  entity, financial year, amount and renewal date for user confirmation.
- Entity graph with generic, non-hard-coded relationships (owns, trustee of,
  beneficiary of, director of, etc).
- Search across document metadata/OCR text and entity records. OCR text
  can be wrong (especially for a photographed rather than scanned page), so
  each document has a **Turn off** button (`textExtractionEnabled` on
  `Document`) that stops its extracted text being searched or shown, without
  touching the file or deleting the text — turning it back on brings it
  back as it was. Search (`routes/search.ts`, `routes/documents.ts`) and
  the commercial property lease-term suggester both honour it.
- Dashboard with document review queues, upcoming renewals, a financial
  snapshot and a tax summary labelled Recorded/Estimated/Needs review (never
  presented as definitive tax advice).
- Full audit log of imports, classification changes and confirmations.
- Settings page with an explicit, off-by-default "Allow external AI
  processing" toggle — classification runs entirely on-device today.

### Stage 2

- **Properties**: purchase/settlement details, ownership %, current value;
  creating one also creates its underlying Asset row so it appears in the
  asset register automatically. Income/expenses/capital are derived from
  documents linked to the property, grouped by tax category — no separate
  ledger to keep in sync.
- **Loans/Liabilities**: a single liability register; the Loans nav shows
  home/investment loans, Liabilities shows everything (credit cards,
  personal loans included). A loan can name a property as security, which
  then shows up on that property's Financing panel.
- **Investments**: investment accounts with a holdings register (quantity,
  cost base, disposal, brokerage) and a realised gain/loss roll-up. No
  market pricing or advice — record-keeping only, per the brief.
- **Banking**: bank accounts with manual transaction entry; each
  transaction is auto-assigned a financial year from its date.
- **Assets**: a generic register for vehicles, equipment, super and other
  assets not covered by Properties/Investments. Property-backed assets
  appear here too, read-only, linking back to their property.
- Every module detail page has a shared document-linking panel: upload a
  new file or link an existing one, so a document never needs duplicating
  across a property, a loan and a tax record.

Tax and Reports were built out in a later stage (see below); Document
Packs has also since been built (see "Document Packs and pay tracking"
above).

### Commercial Property & Investment Module (Phase 1-3)

Commercial property is a distinct asset class from residential — it isn't
squeezed into the residential Property UI. Reachable via a Residential /
Commercial toggle on the Properties page.

- **CommercialProperty**: multi-classification (e.g. "Industrial /
  Warehouse"), characteristics (NLA/GLA/site area, zoning, construction,
  car spaces), valuation, all backed by its own Asset row like residential
  Property is.
- **Tenancy/Lease**: tenant details, lease term, rent, outgoings
  arrangement (gross/net/triple-net/gross+recoveries), incentives, bank
  guarantee/bond, review mechanism — with a **Rent Review** history per
  tenancy.
- **Outgoings**: every record carries gross expense, recoverable flag and
  recovered amount, so the net landlord cost is never conflated with the
  full gross expense.
- **Capital expenditure**: kept separate from operating outgoings, with its
  own tax-treatment status (Confirmed/Proposed/Needs review) — the system
  never decides deductibility.
- **Occupancy snapshots**: historical vacancy record, stored point-in-time
  rather than only ever showing today's figure.
- **Annual snapshots**: an explicit, immutable per-financial-year record
  (value/debt/equity/NOI/yields/LVR). A "Generate & save from current
  figures" action pre-fills it from the live calculation, but saving never
  gets silently overwritten by later changes — a loan added afterwards
  changes the live metrics, not the saved snapshot.
- **Live metrics** (computed on read, formula shown alongside every
  figure): NOI, gross/net yield, cap rate (toggle current valuation vs
  purchase price as the basis), LVR/equity across all loans secured
  against the property, occupancy/vacancy, tenant concentration (% of rent
  and % of NLA per tenant), and WALE by both lease-count and rent-weighted
  methodology, clearly labelled. None of this is investment advice.
- Loans can now secure either a residential or a commercial property, with
  commercial-specific fields (interest-only vs P&I, repayment frequency,
  loan/establishment/valuation fees).
- **Phase 3, now built**:
  - **DSCR and Interest Coverage Ratio** tiles on the property page,
    labelled as analytical ratios, never a lending-approval prediction.
  - **Acquisition Model** (`/commercial-properties/acquisition-model`): a
    standalone calculator — purchase costs, financing, income and
    expenses in, total acquisition cost/LVR/NOI/yields/DSCR/interest
    coverage/break-even occupancy out. Not persisted (projected figures,
    never mixed with actual records) and can optionally pre-fill its
    income/occupancy from an existing property as a starting point.
  - **Scenario analysis** on each property's page: add named scenarios
    that override rent growth/vacancy/interest rate and see NOI, interest
    expense, cash flow and net yield recomputed against the current base
    case — figures only, no likely/unlikely labelling.
  - **Portfolio view** on the Commercial Properties list (once you have
    more than one): total value/debt/equity, weighted LVR, portfolio NOI
    and net yield, weighted occupancy and WALE, total rent/interest/cash
    flow — properties are listed with their own metrics, never ranked or
    scored against each other.
- **Phase 4, now built**:
  - **Lease term extraction**: on a tenancy with a "Lease" or "Lease
    Amendment" document linked, an **Extract from lease document** button
    runs a heuristic pass over that document's OCR text for annual rent,
    lease commencement/expiry dates and review mechanism (CPI/market/fixed
    percentage/hybrid), each proposed with a confidence rating that's never
    higher than "Medium" — this is a proposal, not an automatic update.
    Every extracted field has its own **Apply** button so you accept them
    one at a time (or not at all), matching the rest of the app's
    propose-don't-auto-apply pattern for anything derived from a document.
  - **Upcoming lease events** on the Dashboard: active tenancies with a
    lease expiry in the next 180 days or a rent review due in the next 90
    are listed with a direct link back to the property, so renewals and
    reviews don't get missed by only ever looking at a property's own page.

### UI styling

A `PREFERENCES.md` in this repo sets visual/interaction defaults (light
theme, card-based navigation, icon-first headers, etc.). These were
deliberately not followed while the app was function-first through Stage 3
— see "UI/UX styling pass" above for the pass that brought the build in
line with them.

## Stack

- **Server**: Node.js, TypeScript, Express, Prisma + SQLite, multer,
  tesseract.js (image OCR), pdf-parse (PDF text extraction).
- **Web**: React + TypeScript, Vite, React Router. Plain CSS (no framework
  dependency), responsive down to phone width, PWA manifest included.

## Getting started

### Running it as a regular app (no terminal needed after setup)

The same steps, and how to update without losing anything, are in
**`START HERE.txt`** in this folder.

1. If you don't already have Node.js, go to https://nodejs.org and install
   the LTS version — this is a one-time step.
2. Double-click **`Start Financial Vault.command`** (Mac) or
   **`Start Financial Vault.bat`** (Windows) in this folder.

The first time, it installs everything and sets up the database — this can
take a few minutes. Every time after that, it starts in a few seconds and
opens the app in your browser at `http://localhost:4000` automatically.
Everything runs on your own machine; nothing is uploaded anywhere. To stop
the app, close the window it's running in (on Windows, that's the separate
window titled "Financial Vault" that opens — closing the first small window
is fine and doesn't stop it).

### Updating to a new version (keeps your data)

Plain-English steps are in **`START HERE.txt`** and in the app under
Help → *Updating to a new version*. In short: take a backup in Settings,
rename the old folder to `financevault-old`, unzip the new version in its
place, run **`Copy My Data From Old Version`** (`.command` / `.bat`) from
the new folder and drag the old folder in, then start as usual.

What that copies, and why it's safe:

- `server/prisma/dev.db*` (the database), `server/storage/` (uploaded
  documents) and `server/.env`. The old folder is only read. If the new
  folder had already been started, its empty database is renamed to
  `dev.db.before-copy-<time>`, never deleted.
- The launcher runs `prisma migrate deploy`, which only adds to the
  database's structure; it doesn't reset or drop data.
- Documents record where their file was stored. On start-up,
  `relinkMovedDocuments()` (`server/src/services/paths.ts`) points any
  document whose file is missing at the copy of the same file in this
  folder's storage, so nothing depends on the old folder afterwards.
- A document storage location set in Settings (e.g. a synced folder) is
  outside the program folder and is used as-is.

Never unzip a new version over the top of the old folder on a Mac: Finder
replaces whole folders, which would take `server/prisma/dev.db` and
`server/storage/` with them.

### For development (two dev servers, hot reload)

```bash
# Server
cd server
cp .env.example .env
npm install
npm run prisma:migrate   # creates prisma/dev.db and applies the schema
npm run prisma:seed      # seeds Australian financial years + tax categories
npm run dev               # http://localhost:4000

# Web (in a second terminal)
cd web
npm install
npm run dev               # http://localhost:5173 (proxies /api to :4000)
```

Uploaded documents are stored under `server/storage/documents/`, named by
their content hash. Originals are never overwritten; re-uploading an
identical file is detected as a duplicate.

### Tests

```bash
npm test
```

Runs the server test suite (Vitest) against a throwaway database and
storage folder — it never touches your real records. It covers the parts
where a mistake would be quiet and costly: CGT arithmetic (parcel
allocation, the 12-month boundary, discount rates by entity, losses),
bank CSV parsing for each major bank's layout, document classification and
financial-year detection, TFN validation and redaction, encryption and the
full passcode/recovery lifecycle, and the HTTP security boundary (loopback
host, cross-origin refusal, the lock gate, TFNs never appearing in responses
or the audit log, and uploaded files that can't run as the app). The web
interface itself has no automated tests yet.

### Notes on OCR

Text is pulled out of a PDF in three escalating steps, cheapest first:
`pdf-parse` reads the embedded text layer; failing that, MuPDF has a second
go at it (it reads some PDFs `pdf-parse` can't); and only if there's no
usable text layer at all — i.e. the PDF is a scan — is each page rendered to
an image and OCR'd. Rendering is done by MuPDF's WebAssembly build, so
there's no extra software to install beyond Node.js.

Page OCR is capped at the first 10 pages of a document. Those carry the
identifying details and the figures that matter for classification, and
going further would make a bulk import of long scanned statements
unreasonably slow.

OCR language data (~11MB) is downloaded once on first use and cached in
`server/storage/tessdata/`, after which OCR works with no network access at
all. To set it up fully offline, put `eng.traineddata.gz` in that folder by
hand and nothing is ever downloaded. If the data can't be fetched, the
first document to need OCR waits up to 90 seconds, then every later one
skips OCR immediately rather than repeating the wait — documents are still
stored and flagged for manual classification, just without extracted text.

## Security

### What's protected

- **Only this computer can reach the app.** The server listens on loopback
  (127.0.0.1 and ::1) only, so other devices on the same Wi-Fi can't connect.
  It also refuses requests addressed to any other hostname, which defeats
  DNS rebinding — a trick where a website points its own domain at your
  computer to reach local apps through your browser.
- **Other websites can't read or change anything.** There is no CORS, so a
  page you visit while the app is running can't read its responses, and
  changes coming from another origin are refused. (Earlier versions answered
  `Access-Control-Allow-Origin: *`, which let any website read the whole
  database — fixed.)
- **A passcode opens the app.** Set on first launch, minimum 8 characters.
  Sessions use an `HttpOnly`, `SameSite=Strict` cookie that page scripts
  can't read and other sites can't send. After 15 minutes without use the
  app locks itself: the screen is cleared, and the server forgets the
  encryption key. Repeated wrong guesses are throttled.
- **Tax file numbers, ID numbers, bank account numbers, insurance policy
  numbers and the Gmail app password are encrypted at rest**
  with AES-256-GCM. The key is random, and is stored only in wrapped form —
  encrypted under a key derived from your passcode with scrypt, which is
  deliberately slow to make guessing expensive. So a copy of the database —
  from a synced folder, a backup ZIP, or a lost laptop's drive — holds those
  values only as ciphertext. Encryption is enforced in the database layer on
  every write, so no part of the app can store them in the clear. Any
  plaintext values from before the passcode existed are encrypted when you
  first set it.
- **Tax file numbers stay out of everything else.** The app shows only the
  last three digits (`••• ••• 782`); **Show** fetches the full number on
  request and each reveal is recorded in the audit log. TFNs are checked
  against the ATO's check-digit scheme when entered, so a mistyped digit is
  caught rather than stored. They're left out of every other API response
  by default, the audit log records *that* a TFN changed but never its
  value, and TFNs read out of uploaded documents are masked before the text
  is stored. Existing document text and audit entries from before this are
  cleaned once, on the first start after updating. A nine-digit number is
  only treated as a TFN if it passes the check digit **and** is printed in
  TFN grouping or labelled as one on the same line — about one in eleven
  random numbers pass the check digit alone, so invoice and reference
  numbers are left alone.
- **Document files are encrypted at rest** with the same key (AES-256-GCM,
  whole file, a `FVAULT` marker at the start). Everything that reads a
  file's contents goes through `services/documentFiles.ts`: viewing,
  Document Packs (which get ordinary decrypted copies, since they're for
  sending on). Backups copy the files still sealed. Files from before this
  version, or saved while locked by a background import, are sealed in the
  background after the next unlock; unsealed files still read normally
  until then.
- **Uploaded files can't run as the app.** Only PDFs and ordinary images are
  shown inline; anything else (HTML, SVG, …) is downloaded instead, so a
  malicious file posing as a statement can't run scripts with the app's
  access. The app also can't be framed by other sites.
- Original documents are immutable and identified by a SHA-256 hash; every
  import, classification change, confirmation, unlock, failed unlock and
  lock is written to the audit log; no external AI processing happens; and
  there is no payment,
  money-movement or bank-credential storage anywhere in this codebase.

### What isn't — read this

- **Everything else in the database is not encrypted**: names, balances,
  transactions, holdings, document details and the text read out of
  documents for searching (with TFNs masked). The passcode stops people
  *using the app*; it does not stop someone with access to your files
  reading the database directly. A document downloaded from the app or put
  in a pack is an ordinary unencrypted copy. Encrypting the whole
  database needs SQLCipher, a native build that would break the "install
  Node.js and double-click" setup, so the most sensitive fields are
  protected individually instead.
- Anyone who can use your computer while the app is unlocked can see what
  you can see. Malware on the computer is out of scope — it could read the
  key from memory or capture your passcode as you type it.
- If your data folder is synced to the cloud, whoever can access that cloud
  account can read everything except the encrypted fields and document
  files.

### Passcode and recovery

When you set your passcode you're shown a **recovery key** once. Write it
down somewhere away from this computer: if you forget your passcode, **Forgot
passcode?** on the lock screen lets you set a new one with it, and nothing is
lost. You can change your passcode any time in Settings; the recovery key
stays the same.

If you've lost both, close the app and run this from the `server` folder:

```bash
npm run reset-passcode          # shows what would be cleared, changes nothing
npm run reset-passcode -- --yes # actually does it
```

The encrypted fields — tax file numbers, ID, account and policy numbers and
the Gmail app password — can't be recovered without the passcode or
recovery key, so they're cleared (you'd re-enter them, and reconnect
Gmail). **Encrypted document files can't be opened again either**: their
records and searchable text are kept, but the files are lost, and the
script says how many before doing anything. Keep the recovery key safe.
Everything else is kept. This is
deliberately a command rather than a button on the lock screen: a button
there would let anyone at the keyboard bypass the lock, whereas running a
command needs access to the app's files, which already gives access to the
unencrypted data.

A backup ZIP keeps the encrypted fields encrypted, so restoring one needs
the passcode (or recovery key) that was current when it was taken.
