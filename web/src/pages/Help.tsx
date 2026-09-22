import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * The user manual, built into the app so it's always one tap away and always
 * matches the version you're running. Each section has an id so other
 * screens can link straight to the relevant part (see HelpLink).
 */

interface Section {
  id: string;
  title: string;
  /** Extra words people might search for that don't appear in the text. */
  keywords?: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Starting and stopping",
    keywords: "open launch install node close quit",
    body: (
      <>
        <p>
          Double-click <strong>Start Financial Vault</strong> in the Financial Vault folder (the <code>.command</code> file
          on a Mac, the <code>.bat</code> file on Windows). It opens in your web browser at{" "}
          <code>http://localhost:4000</code>. The first start installs everything and takes a few minutes; after that it
          starts in seconds.
        </p>
        <p>
          It runs entirely on your computer. Nothing is uploaded anywhere, and other devices on your Wi-Fi can't reach it.
        </p>
        <p>
          To stop it, close the window it's running in. On Windows that's the separate window titled "Financial Vault".
          Closing the browser tab alone leaves it running in the background, which is harmless.
        </p>
        <p>
          The only thing it needs is Node.js. If the start file says Node.js isn't installed, get the LTS version from{" "}
          <code>nodejs.org</code>, install it, and double-click the start file again.
        </p>
      </>
    ),
  },
  {
    id: "passcode",
    title: "Passcode, recovery key and locking",
    keywords: "password lock unlock forgot recovery key reset change",
    body: (
      <>
        <p>
          The first time you open Financial Vault you choose a passcode (at least 8 characters). You're then shown a{" "}
          <strong>recovery key</strong>, once only. Write it down and keep it away from this computer. If you forget your
          passcode, it's the only way back in without losing your tax file numbers.
        </p>
        <p>
          The app locks itself after 15 minutes without use. You can lock it straight away with the padlock at the top
          of every screen. Locking clears the screen and makes the app forget its encryption key until the passcode is
          entered again.
        </p>
        <h4>Forgot your passcode</h4>
        <p>
          On the lock screen, choose <strong>Forgot passcode?</strong>, enter your recovery key and set a new passcode.
          Nothing is lost.
        </p>
        <h4>Change your passcode</h4>
        <p>
          <Link to="/settings">Settings</Link> → <strong>Passcode</strong>. Your recovery key stays the same.
        </p>
        <h4>Lost both the passcode and the recovery key</h4>
        <p>
          There's deliberately no button for this, since a button on the lock screen would let anyone at your keyboard
          get in. Close the app, open a terminal in the <code>server</code> folder and run{" "}
          <code>npm run reset-passcode -- --yes</code>. Everything is kept except the encrypted items — tax file numbers
          and the Gmail connection — which you'd re-enter.
        </p>
      </>
    ),
  },
  {
    id: "how-it-fits",
    title: "How it's organised: people, entities and what they own",
    keywords: "trust company smsf super fund joint owner structure",
    body: (
      <>
        <p>Everything in Financial Vault hangs off three layers. Getting them right first makes the rest easy.</p>
        <ul>
          <li>
            <strong>People</strong> are real humans — you, your partner, your kids.
          </li>
          <li>
            <strong>Entities</strong> are what legally owns things and pays tax: you personally (an "individual"
            entity), a joint ownership, a family trust, a company, an SMSF. A person is linked to entities with a role
            such as owner, trustee, director or beneficiary.
          </li>
          <li>
            <strong>Assets and liabilities</strong> — properties, bank accounts, investments, loans, cars — each belong
            to one entity.
          </li>
        </ul>
        <p>
          So if your family trust owns a warehouse, the warehouse belongs to the <em>trust</em> entity, and you're linked
          to the trust as trustee. Totals, tax and capital gains are worked out per entity, the way the ATO sees them.
        </p>
        <p>
          <Link to="/visualization">Visualization</Link> draws this structure as a diagram.
        </p>
      </>
    ),
  },
  {
    id: "first-time",
    title: "Setting up for the first time",
    keywords: "start begin order checklist onboarding",
    body: (
      <ol>
        <li>
          Add yourself (and anyone else) under <Link to="/people">People</Link>.
        </li>
        <li>
          Add an entity for each owner under <Link to="/entities">Entities</Link> — usually one for you personally, plus
          any trust, company or SMSF — and link people to them.
        </li>
        <li>
          Add your bank accounts under <Link to="/banking">Banking</Link> and import each one's transactions from a CSV
          (see <a href="#banking">Bank accounts and transactions</a>).
        </li>
        <li>
          Add properties, loans and investment accounts.
        </li>
        <li>
          Load your paperwork in one go with <Link to="/bulk-import">Bulk import</Link>, then go through the{" "}
          <Link to="/inbox">Inbox</Link> to confirm what it worked out.
        </li>
        <li>
          Take a backup (<Link to="/settings">Settings</Link> → <strong>Download full backup</strong>).
        </li>
      </ol>
    ),
  },
  {
    id: "documents",
    title: "Documents and the Inbox",
    keywords: "upload file pdf scan confirm classify classification link archive ocr",
    body: (
      <>
        <p>
          Drop files onto the <Link to="/inbox">Inbox</Link> (PDFs, JPGs and PNGs). Financial Vault reads each one —
          including scanned documents — and proposes what it is, who it belongs to, the financial year, dates and
          amounts.
        </p>
        <p>
          Nothing is filed automatically. Each new document waits in the Inbox until you <strong>Confirm</strong> it.
          Open a document to correct anything first, then <strong>Confirm classification</strong>.
        </p>
        <p>
          Documents can be linked to the things they're about — a rates notice to a property, a payslip to a person, a
          contract note to an investment account — using <strong>Link existing document</strong> or{" "}
          <strong>Upload document</strong> on that record's page.
        </p>
        <p>
          Uploading the same file twice is detected and the copy is skipped. Tax file numbers found in a document's
          text are masked before the text is saved.
        </p>
        <h4>Archive or delete</h4>
        <p>At the bottom of a document's page:</p>
        <ul>
          <li>
            <strong>Archive</strong> keeps the file and its details but hides it from the lists and dashboard. Find it
            again with the <strong>Archived</strong> filter on <Link to="/documents">Documents</Link>.
          </li>
          <li>
            <strong>Delete permanently</strong> removes the file itself. Use it for duplicates and mistakes.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "bulk-import",
    title: "Bulk import: loading a whole folder",
    keywords: "folder many files first load statements tax returns",
    body: (
      <>
        <p>
          <Link to="/bulk-import">Bulk import</Link> is for loading years of paperwork at once. Choose a folder (or a set
          of files) and it uploads them a few at a time, showing progress. A file that can't be read fails on its own
          without stopping the rest.
        </p>
        <p>
          Afterwards, files that look alike are grouped — all the CommBank statements together, for example — so you can
          set the document type, entity or financial year for the whole group in one go. The least certain groups are
          shown first. Anything you leave as "Leave as proposed" keeps what was worked out for each file.
        </p>
        <p>
          <strong>Tip:</strong> folder names help. A file inside <code>Tax Returns/2023-24</code> is taken to be for the
          2023-24 financial year. Use full year ranges like <code>2023-24</code> or <code>FY24</code> — a bare{" "}
          <code>2023</code> could mean either of two financial years, so it's left for you to set.
        </p>
        <p>
          Re-importing a folder you've already loaded adds nothing new. An import is saved as you go, so you can close
          the page and come back to the review later under <strong>Earlier imports</strong>.
        </p>
      </>
    ),
  },
  {
    id: "email-import",
    title: "Importing from Gmail",
    keywords: "email gmail app password attachments rules",
    body: (
      <>
        <p>
          <Link to="/email-import">Email import</Link> collects attachments — bills, statements, contract notes — straight
          from Gmail. Mail is only ever read: nothing is sent, deleted, moved or marked as read.
        </p>
        <h4>Connecting</h4>
        <ol>
          <li>
            Gmail needs <strong>2-Step Verification</strong> turned on for your Google account.
          </li>
          <li>
            Go to <code>myaccount.google.com/apppasswords</code>, create an app password (name it "Financial Vault") and
            copy the 16-letter code.
          </li>
          <li>
            On Email import, enter your Gmail address and that code, then <strong>Connect mailbox</strong>.
          </li>
        </ol>
        <p>
          The app password is stored encrypted. You can cancel it at any time from the same Google page without changing
          your normal Gmail password.
        </p>
        <h4>Rules</h4>
        <p>
          A rule is a Gmail search, written just as you would in Gmail's search box — for example{" "}
          <code>from:commbank.com.au has:attachment filename:pdf</code>. A rule can also suggest a document type and
          entity for what it finds.
        </p>
        <p>
          Press <strong>Import now</strong> whenever you want to collect new mail; it never runs by itself. Anything
          already imported is skipped, so running it often is fine. New documents arrive in the Inbox for you to
          confirm.
        </p>
      </>
    ),
  },
  {
    id: "banking",
    title: "Bank accounts and transactions",
    keywords: "csv import statement transactions commbank westpac nab anz move delete account",
    body: (
      <>
        <p>
          Add each account under <Link to="/banking">Banking</Link> → <strong>New account</strong>, choosing which entity
          owns it.
        </p>
        <h4>Importing transactions from a CSV</h4>
        <ol>
          <li>In your bank's website or app, export a date range of transactions as a CSV file.</li>
          <li>
            Open the account in Financial Vault and use <strong>Import transactions from CSV</strong>.
          </li>
          <li>
            Check the columns it picked (date, description, amount, or separate money-in and money-out columns) and the
            date format against the preview. Nothing is saved until you confirm.
          </li>
        </ol>
        <p>
          Importing an overlapping date range is safe: a transaction with the same date, amount and description as one
          already there is skipped, and the preview tells you how many.
        </p>
        <p>
          CSVs are much more reliable than reading transactions out of PDF statements. Keep the PDF statements as
          evidence in Documents, and take the transactions from the CSV.
        </p>
        <h4>Editing, moving and deleting an account</h4>
        <p>
          On the account's page, <strong>Edit</strong> changes its name, bank, BSB, number, type, balance and owner.
          Changing the owner moves its transactions to the new entity too.
        </p>
        <p>
          <strong>Delete account</strong> (under Edit) removes the account <em>and all its transactions</em>, after
          telling you how many. Linked documents are kept. Since transactions come from the bank's CSV, you can always
          import them again into another account.
        </p>
      </>
    ),
  },
  {
    id: "investments",
    title: "Shares, ETFs, crypto and managed funds",
    keywords: "parcel purchase buy sell sale dividend franking drp reinvestment price refresh yahoo coingecko",
    body: (
      <>
        <p>
          This is record-keeping, not trading: nothing here buys or sells, connects to a broker, or gives advice.
        </p>
        <p>
          Create an investment account under <Link to="/investments">Investments</Link> (one per broker or platform,
          owned by the right entity). On the account's page:
        </p>
        <ul>
          <li>
            <strong>Add purchase</strong> for every buy. Each purchase is kept separately as a "parcel" with its own
            date and cost, because the tax on a later sale depends on each parcel's own date.
          </li>
          <li>
            <strong>Record a sale</strong>. Sales come out of your oldest parcels first. Before anything is saved, a
            preview shows the gain, the discount and which parcels are used.
          </li>
          <li>
            <strong>Record a dividend</strong>, with franked and unfranked amounts and the franking credit. If it was
            reinvested (a DRP), enter the units and price — that creates the new parcel so its cost isn't lost.
          </li>
        </ul>
        <h4>Prices</h4>
        <p>
          Type a price with <strong>Set price</strong> at any time. To fetch prices automatically, turn on{" "}
          <strong>Market price lookups</strong> in <Link to="/settings">Settings</Link>, then press{" "}
          <strong>Refresh prices</strong>. Shares and ETFs come from Yahoo Finance and crypto from CoinGecko. Only the
          codes you hold are sent — never amounts or anything about you — and only when you press the button. Managed
          funds and super usually need prices entered by hand.
        </p>
        <p>
          A holding with no price is valued at what you paid for it in net worth totals, and the account page says so.
        </p>
      </>
    ),
  },
  {
    id: "capital-gains",
    title: "How capital gains are worked out",
    keywords: "cgt discount 50% twelve months loss carried forward tax",
    body: (
      <>
        <p>
          <Link to="/reports">Reports</Link> → <strong>Capital gains</strong> → pick a financial year. It lists every sale
          and the result for each entity.
        </p>
        <ul>
          <li>
            <strong>Gain or loss</strong> on each parcel sold = its share of the sale proceeds (after brokerage) minus
            what it cost (including buying brokerage).
          </li>
          <li>
            <strong>The 12-month discount</strong> applies to a parcel held for more than 12 months. The day you bought
            it doesn't count, so exactly 12 months isn't enough — it needs one more day.
          </li>
          <li>
            <strong>Discount rate</strong> depends on the owner: 50% for individuals, joint owners and trusts, one-third
            for super funds and SMSFs, none for companies.
          </li>
          <li>
            <strong>Losses come off first.</strong> Within each entity, the year's losses are taken off gains before the
            discount is applied — first against gains that don't get the discount, then against ones that do. Losses
            bigger than the year's gains are shown as <strong>carried forward</strong>.
          </li>
          <li>Each entity is worked out separately: one entity's losses can't reduce another's gains.</li>
        </ul>
        <p>
          Losses carried forward from earlier years aren't included. These are calculations from your own records for
          your accountant to confirm — not tax advice.
        </p>
      </>
    ),
  },
  {
    id: "properties",
    title: "Properties",
    keywords: "residential commercial tenancy lease rent outgoings capex lvr yield wale noi",
    body: (
      <>
        <p>
          <Link to="/properties">Properties</Link> has two views: <strong>Residential</strong> and{" "}
          <strong>Commercial</strong>.
        </p>
        <p>
          <strong>Residential</strong> properties hold the purchase details, current value and owner. Attach the loan
          secured against one when you add it under Loans, and the property shows its equity and LVR.
        </p>
        <p>
          <strong>Commercial</strong> properties also track tenancies and leases (rent, reviews, expiry), outgoings,
          capital works, occupancy and yearly snapshots. From those it works out NOI, yield, WALE, LVR, cash flow after
          the loan and debt cover. A loan with no repayment amount entered is counted as interest-only, and the page says
          so. Upcoming rent reviews and lease expiries appear on the Dashboard.
        </p>
        <p>
          The <strong>Acquisition model</strong> (on the Commercial view) is a calculator for a property you're
          considering; nothing in it is saved.
        </p>
      </>
    ),
  },
  {
    id: "loans-assets",
    title: "Loans, other liabilities and other assets",
    keywords: "mortgage credit card personal loan car vehicle super superannuation equipment ownership share",
    body: (
      <>
        <p>
          <Link to="/loans">Loans</Link> holds mortgages and investment and commercial loans; choose the property that
          secures a loan so its LVR can be shown. <Link to="/liabilities">Liabilities</Link> holds credit cards, personal
          loans and anything else owed.
        </p>
        <p>
          <Link to="/assets">Assets</Link> is for everything else you own: cars, super, equipment, cash held elsewhere.
          An asset owned in shares by more than one entity can have its ownership split recorded on its page.
        </p>
      </>
    ),
  },
  {
    id: "net-worth",
    title: "Dashboard and net worth",
    keywords: "totals balance sheet snapshot compare",
    body: (
      <>
        <p>
          The <Link to="/">Dashboard</Link> and <Link to="/net-worth">Net Worth</Link> use the same calculation, so their
          totals always agree. Assets = bank balances + property values + investments (share holdings at their latest
          price, or at cost where there's no price) + super + vehicles + other assets. Liabilities = every loan and
          debt.
        </p>
        <p>
          Both can show everything together or one entity at a time. The per-entity view is a convenience, not a formal
          set of accounts.
        </p>
        <p>
          <strong>Save snapshot</strong> on Net Worth keeps a permanent record of today's figures. Later changes never
          alter a saved snapshot, and <strong>Compare two snapshots</strong> shows what changed between any two.
        </p>
      </>
    ),
  },
  {
    id: "tax",
    title: "Tax records and reports",
    keywords: "income expense deduction financial year summary debt lvr accountant",
    body: (
      <>
        <p>
          <Link to="/tax">Tax</Link> shows, for an entity and financial year, its recorded income, expenses and capital
          gains or losses, each marked as Recorded, Estimated, Needs review or Accountant confirmed. Add items with{" "}
          <strong>New record</strong>. Documents tagged as tax-relevant for that year are listed alongside.
        </p>
        <p>
          <Link to="/reports">Reports</Link> has property performance, the investment portfolio, capital gains, a tax
          summary (including the calculated gain from share sales) and a debt summary with LVRs.
        </p>
      </>
    ),
  },
  {
    id: "packs",
    title: "Document Packs: bundles for your accountant or broker",
    keywords: "zip export accountant broker bundle send",
    body: (
      <>
        <p>
          <Link to="/packs">Document Packs</Link> builds a ZIP file for one entity (and optionally one financial year).
          Tick the kinds of documents and summaries to include, or start from the <strong>Accountant Pack</strong> or{" "}
          <strong>Broker Pack</strong> preset, then <strong>Generate &amp; download</strong>.
        </p>
        <p>
          Only what you tick goes in. The summaries (assets and liabilities, tax, income) are spreadsheets built fresh
          from your records at that moment, and every pack includes an index listing each document in it.
        </p>
      </>
    ),
  },
  {
    id: "pay-tracking",
    title: "Payslips and pay tracking",
    keywords: "payslip salary wages fortnightly weekly monthly missing",
    body: (
      <>
        <p>
          On a person's page, set how often they're paid. Financial Vault then lists every pay period in the financial
          year so a missing payslip stands out:
        </p>
        <ul>
          <li>
            <strong>Logged</strong> — a payslip is attached.
          </li>
          <li>
            <strong>Non-working</strong> — you've marked it as a deliberate gap, such as unpaid leave, so it isn't
            flagged.
          </li>
          <li>
            <strong>Missing</strong> — the period has passed and nothing is recorded.
          </li>
          <li>
            <strong>Not yet due</strong> — still in the future.
          </li>
        </ul>
        <p>
          Use <strong>Upload payslip</strong> on a period, or link one you've already uploaded.
        </p>
      </>
    ),
  },
  {
    id: "portfolio-plan",
    title: "Portfolio Plan",
    keywords: "projection future purchases refinance equity growth",
    body: (
      <>
        <p>
          A <Link to="/portfolio-plans">Portfolio Plan</Link> is a saved, year-by-year projection of planned property
          purchases: growth, rent, loans, refinances and equity drawn from properties you already own (including what
          that borrowing costs). Once a planned property is actually bought, link it to the real commercial property and
          the plan shows actual figures next to the prediction.
        </p>
        <p>It's a planning tool built from your own assumptions, not a forecast or advice.</p>
      </>
    ),
  },
  {
    id: "deleting",
    title: "Deleting things, and why some deletes are refused",
    keywords: "delete remove can't be deleted refused history",
    body: (
      <>
        <p>
          Records are deleted from the bottom of their own page, and you're always asked first. Deleting can't be undone,
          so take a backup before a big clean-up.
        </p>
        <p>
          Some records hold history that's hard or impossible to rebuild, so Financial Vault won't delete them while that
          history exists. It tells you exactly what's in the way instead:
        </p>
        <ul>
          <li>
            A <strong>commercial property</strong> with tenancies, outgoings, capital works, snapshots or a secured loan.
          </li>
          <li>
            A <strong>residential property</strong> that a loan is secured against.
          </li>
          <li>
            An <strong>investment account</strong> with purchases, sales or dividends — that's your cost-base and
            capital gains record.
          </li>
          <li>
            An <strong>entity</strong> that still owns or owes anything, or has documents filed against it.
          </li>
        </ul>
        <p>
          Bank accounts are different: deleting one also deletes its transactions, because they can be imported again
          from the bank's CSV.
        </p>
        <p>Deleting a record never deletes the documents linked to it.</p>
      </>
    ),
  },
  {
    id: "backup",
    title: "Backups",
    keywords: "backup restore sync google drive dropbox onedrive copy",
    body: (
      <>
        <p>
          <Link to="/settings">Settings</Link> → <strong>Download full backup</strong> saves one ZIP file with your whole
          database and every original document. It's safe to take while you're using the app. Keep copies somewhere other
          than this computer. Tax file numbers and the Gmail connection stay encrypted inside it, so restoring needs the
          passcode (or recovery key) you had when you took it.
        </p>
        <p>
          <strong>Document storage location</strong> in Settings can point new uploads at a folder inside Google Drive,
          OneDrive or Dropbox, so documents are backed up as you go. That covers documents only — still take a full
          backup regularly for the database. Don't run Financial Vault on two computers at once from the same synced
          folder.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy and security: what's protected",
    keywords: "tfn tax file number encryption security private",
    body: (
      <>
        <ul>
          <li>Only this computer can open the app, and it needs your passcode.</li>
          <li>
            Tax file numbers and the Gmail app password are encrypted. TFNs show as <code>••• ••• 123</code>;{" "}
            <strong>Show</strong> reveals one, and each reveal is logged.
          </li>
          <li>Nothing is sent anywhere, except price lookups you've switched on and Gmail imports you run.</li>
        </ul>
        <h4>What isn't protected</h4>
        <p>
          Everything else — balances, transactions, holdings — and the original document files are stored unencrypted
          on your computer. The passcode stops people using the app; it doesn't stop someone with access to your files
          opening them directly. A scanned tax return still shows its TFN to anyone who opens that PDF. Protect the
          computer itself with a login password and disk encryption (FileVault on a Mac, BitLocker on Windows).
        </p>
      </>
    ),
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    keywords: "problem error not working slow wrong figure",
    body: (
      <>
        <h4>The browser says it can't connect</h4>
        <p>
          Financial Vault isn't running. Double-click the start file again. If its window shows an error, a copy of that
          message is the most useful thing to pass on when asking for help.
        </p>
        <h4>A document wasn't read properly</h4>
        <p>
          Poor scans and photos can defeat the text reading. The document is still stored — open it and fill in the
          details by hand. The first scanned document may take a while, because the text-reading data is set up on
          first use.
        </p>
        <h4>"This … can't be deleted because it still has …"</h4>
        <p>
          See <a href="#deleting">Deleting things</a>. The message lists what to remove or move first; nothing has been
          changed.
        </p>
        <h4>A figure looks wrong</h4>
        <p>
          Totals only know what's been entered. Check that each item belongs to the right entity, that balances and
          property values are current, and that shares have a recent price. Figures here are for your own records and
          your accountant — not tax or financial advice.
        </p>
      </>
    ),
  },
];

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object" && "props" in node) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

export function Help() {
  const location = useLocation();
  const [query, setQuery] = useState("");

  const searchable = useMemo(
    () => SECTIONS.map((s) => ({ id: s.id, text: `${s.title} ${s.keywords ?? ""} ${textOf(s.body)}`.toLowerCase() })),
    []
  );
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = SECTIONS.filter((s) => {
    const text = searchable.find((x) => x.id === s.id)!.text;
    return terms.every((t) => text.includes(t));
  });

  // Links from elsewhere in the app arrive as /help#section-id.
  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [location.hash]);

  return (
    <div className="help-page">
      <div className="page-header">
        <div>
          <h2>Help</h2>
          <p>How to use Financial Vault, in plain English.</p>
        </div>
        <button className="btn secondary no-print" onClick={() => window.print()}>
          Print this guide
        </button>
      </div>

      <div className="card no-print">
        <label htmlFor="help-search">Search the help</label>
        <input
          id="help-search"
          type="search"
          placeholder="e.g. CSV, passcode, capital gains"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query && (
          <>
            <h3>Contents</h3>
            <ol className="help-contents">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </>
        )}
        {query && visible.length === 0 && <p className="empty-state">Nothing in the help matches "{query}".</p>}
      </div>

      {visible.map((s) => (
        <section key={s.id} id={s.id} className="card help-section">
          <h3 style={{ marginTop: 0 }}>{s.title}</h3>
          {s.body}
          <p className="no-print" style={{ marginBottom: 0 }}>
            <a href="#help-search">↑ Back to contents</a>
          </p>
        </section>
      ))}
    </div>
  );
}
