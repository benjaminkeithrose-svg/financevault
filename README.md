# Financial Vault

A private, local-first personal financial management and document system for
an Australian individual/family. It is **not** a replacement for a
registered tax agent, accountant, financial adviser, bank or regulated
accounting system — it organises your own records and evidence so you can
hand them to one quickly.

See the project brief for the full design spec. This repository currently
implements **Stage 1 and Stage 2** of the staged build.

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

Tax, Reports and Document Packs still have nav entries and placeholder
screens; their data model already exists in `server/prisma/schema.prisma`
ahead of the UI.

### Commercial Property & Investment Module (Phase 1 & 2)

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
- DSCR/interest coverage, acquisition modelling, scenario modelling and a
  portfolio-level roll-up (spec Phase 3) plus lease-PDF extraction and
  alerts (Phase 4) are intentionally not built yet.

### UI styling

A `PREFERENCES.md` in this repo sets visual/interaction defaults (light
theme, card-based navigation, icon-first headers, etc.) that this build
does not yet follow — by direction, function is being prioritised over
matching those preferences until more of the app exists. A dedicated
styling pass is expected once Stage 3 lands.

## Stack

- **Server**: Node.js, TypeScript, Express, Prisma + SQLite, multer,
  tesseract.js (image OCR), pdf-parse (PDF text extraction).
- **Web**: React + TypeScript, Vite, React Router. Plain CSS (no framework
  dependency), responsive down to phone width, PWA manifest included.

## Getting started

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

Image OCR (`tesseract.js`) downloads its language data from a CDN on first
use. If that network call is unavailable, OCR fails safely: the document is
still stored, flagged `NEEDS_CONFIRMATION` with a low confidence score, and
can be classified manually. PDF text extraction does not require network
access.

## Security posture (Stage 1)

- Original documents are immutable and identified by a SHA-256 hash.
- Every import, classification change and user confirmation is written to
  an audit log.
- No external AI processing occurs unless explicitly enabled in Settings
  (off by default).
- No payment, money-movement, or bank-credential storage exists anywhere in
  this codebase.

Encryption at rest, backups, export, and stronger authentication are
planned for the security-hardening stage of the build, per the project
brief's staged approach.
