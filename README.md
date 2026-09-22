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
ownership, a multi-property Portfolio Plan, bulk folder import, CSV
transaction import, Gmail email import, a double-click local launcher and a
one-click backup, all described below.

### Backup

Settings → **Download full backup** streams a single ZIP containing the
whole database and every original uploaded document — everything needed to
restore Financial Vault elsewhere. The database is copied via SQLite's own
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
IMAP/SMTP access than a read-only scope would, and it's stored in the local
database, which isn't yet encrypted at rest (see the security posture
section). It can be revoked at `myaccount.google.com/apppasswords` at any
time without changing your Google password.

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
  Portfolio (cost base and realised gain/loss — explicitly honest that
  there's no live pricing, so unrealised gain/loss isn't shown), Tax
  Summary by financial year, and Debt Summary with LVR against whatever
  secures each loan.

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
- Search across document metadata/OCR text and entity records.
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

## Security posture (Stage 1)

- Original documents are immutable and identified by a SHA-256 hash.
- Every import, classification change and user confirmation is written to
  an audit log.
- No external AI processing occurs unless explicitly enabled in Settings
  (off by default).
- No payment, money-movement, or bank-credential storage exists anywhere in
  this codebase.
- The one credential the app can hold is a Gmail **app password**, stored
  only if you connect a mailbox for email import. It is kept in the local
  database (not yet encrypted at rest), is never sent to the browser — the
  UI is only told whether one is set — and can be revoked from your Google
  account at any time without changing your real password.

Encryption at rest, backups, export, and stronger authentication are
planned for the security-hardening stage of the build, per the project
brief's staged approach.
