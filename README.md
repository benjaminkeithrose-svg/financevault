# Financial Vault

A private, local-first personal financial management and document system for
an Australian individual/family. It is **not** a replacement for a
registered tax agent, accountant, financial adviser, bank or regulated
accounting system — it organises your own records and evidence so you can
hand them to one quickly.

See the project brief for the full design spec. This repository currently
implements **Stage 1** of the staged build:

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

Properties, Investments, Banking, Loans, Tax, Assets, Liabilities, Reports
and Document Packs have nav entries and placeholder screens; their data
model already exists in `server/prisma/schema.prisma` ahead of the UI.

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
