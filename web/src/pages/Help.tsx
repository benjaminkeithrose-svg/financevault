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
        <h4>Getting around</h4>
        <p>
          The ☰ button opens the menu. On a computer screen, <strong>Pin to side</strong> in that menu keeps it down the
          left-hand side while you work; <strong>Unpin</strong> puts it away again.
        </p>
        <p>
          If you leave a form half-filled, what you've typed is kept as a draft on this computer and is there when you come
          back. <strong>Clear</strong> beside the form's main button empties it and throws the draft away. Card and ID
          numbers are never kept in drafts.
        </p>
      </>
    ),
  },
  {
    id: "updating",
    title: "Updating to a new version without losing anything",
    keywords: "update upgrade new version install download keep data database move copy old folder",
    body: (
      <>
        <p>
          Your records and documents live inside your current <strong>financevault</strong> folder. A new download starts
          empty, so your data is copied across into it. Nothing in the old folder is changed or deleted.
        </p>
        <ol>
          <li>
            Open <Link to="/settings">Settings</Link> and click <strong>Download full backup</strong>. Keep the file — it's
            your safety net.
          </li>
          <li>Close Financial Vault (close the window it's running in).</li>
          <li>
            Rename your current folder from <strong>financevault</strong> to <strong>financevault-old</strong>.
          </li>
          <li>Unzip the new download.</li>
          <li>Move the new financevault folder to where the old one was.</li>
          <li>
            Open the <strong>new</strong> folder and double-click <strong>Copy My Data From Old Version</strong> (.command on
            a Mac, .bat on Windows).
          </li>
          <li>When it asks, drag the financevault-old folder into that window, then press Enter.</li>
          <li>Wait for "Done", then press Enter to close that window.</li>
          <li>
            In the new folder, double-click <strong>Start Financial Vault</strong>. The first start after an update takes a
            few minutes while it updates your records to the new layout — it never removes them.
          </li>
          <li>Unlock with your usual passcode and check your people, properties and documents are all there.</li>
          <li>After a week or two of everything looking right, delete the financevault-old folder.</li>
        </ol>
        <p>
          If something doesn't look right, don't delete anything: close Financial Vault and start the old folder's{" "}
          <strong>Start Financial Vault</strong> instead. It still has everything exactly as it was.
        </p>
        <p>
          The same steps are in the <strong>START HERE</strong> file in the financevault folder. Documents kept in a synced
          folder (Settings → Document storage location) stay where they are and need nothing extra.
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
          passcode, it's the only way back in without losing your documents and tax file numbers.
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
          <code>npm run reset-passcode</code> first: it lists what would be lost and changes nothing. Then{" "}
          <code>npm run reset-passcode -- --yes</code> does it. The encrypted numbers (tax file, ID, account and policy
          numbers) and the Gmail connection are cleared, to be re-entered. <strong>Your document files can't be opened
          again</strong> — their details stay, but the files are lost. This is why the recovery key matters.
        </p>
      </>
    ),
  },
  {
    id: "asset-tree",
    title: "The asset tree: how everything fits together",
    keywords: "tree outline hierarchy structure people entities assets items sub-assets what we own navigate",
    body: (
      <>
        <p>
          Financial Vault is built around one tree. <strong>People</strong> are at the top. Under each person are the{" "}
          <strong>structures</strong> they own things through — their own name, a family trust, a company, an SMSF. Under
          each structure are its <strong>assets</strong>, and under an asset are its <strong>items</strong> (the air
          conditioner in a house, the outboard on a boat). The loans secured on an asset, its insurance, its documents and
          its servicing all hang off that asset.
        </p>
        <p>
          <Link to="/tree">Asset tree &amp; diagram</Link> (in the menu, under Dashboard) shows it two ways: the <strong>Asset tree</strong> tab as an outline, and the <strong>Diagram</strong> tab as a chart. The menu opens whichever tab you used last. Tap the arrow beside
          anything to open it; tap its name to go to its page. <strong>Open everything</strong> unfolds the whole tree and{" "}
          <strong>Fold up</strong> closes it; what you leave open is remembered on this computer.
        </p>
        <ul>
          <li>A person's figure is what's theirs: their own things, plus their share of anything shared or of a unit trust.</li>
          <li>A structure's figure is its own balance sheet.</li>
          <li>A trust with two trustees appears under both of them — it's the same trust, not a copy.</li>
          <li>An item's figure is what it cost; its value is already part of the asset it sits under.</li>
          <li>Loans not secured on a particular asset are under <strong>Other debts</strong>; sold assets under <strong>Sold</strong>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "worth-doing",
    title: "“Worth doing” on the dashboard",
    keywords: "checklist getting started reminders backup reminder stale values out of date valuation nudges monthly snapshot",
    body: (
      <>
        <p>The dashboard's <strong>Worth doing</strong> card lists a few things to keep your records useful. Each one goes away once it's done.</p>
        <ul>
          <li>
            <strong>Getting started</strong> — the first steps: add your people and link their family, any trusts or
            companies, your assets, loans and documents, and take a first backup. <strong>Hide this list</strong> puts it away for good.
          </li>
          <li>
            <strong>Backup</strong> — shown when there's never been a full backup, or the last one was over 30 days ago.
          </li>
          <li>
            <strong>Values not checked for a year</strong> — anything whose value hasn't been updated in over twelve
            months. Open it and change the value, or tap <strong>Still right</strong> if it hasn't changed.
          </li>
        </ul>
        <p>
          Once a month the app also saves the family's net worth to <Link to="/net-worth">Net Worth</Link> by itself, so the
          history builds up without you having to remember.
        </p>
      </>
    ),
  },
  {
    id: "how-it-fits",
    title: "How it's organised: people, entities and what they own",
    keywords: "trust company smsf super fund joint owner structure personal entity family partner child",
    body: (
      <>
        <p>Everything in Financial Vault hangs off three layers.</p>
        <ul>
          <li>
            <strong>People</strong> — you, your partner, your kids. Every person is automatically also their own{" "}
            <strong>personal entity</strong>, for anything held in their own name, so nobody is set up twice.
          </li>
          <li>
            <strong>Trusts, companies and super funds</strong> — the structures around people. A person is linked to them
            with a role such as trustee, director, appointor, beneficiary or member.
          </li>
          <li>
            <strong>Assets and liabilities</strong> — properties, bank accounts, investments, vehicles, loans — each belong
            to one person's personal entity or to one structure.
          </li>
        </ul>
        <p>
          All of them are in one list: <Link to="/people">People &amp; entities</Link>. Open a person to see what they
          hold in their own name, their family, their ID, and the structures they're part of.
        </p>
        <p>
          Totals, tax and capital gains are worked out per entity, the way the ATO sees them.{" "}
          The <Link to="/visualization">Diagram</Link> tab of Asset tree &amp; diagram draws it all as a chart.
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
          Add yourself and your family under <Link to="/people">People &amp; entities</Link> → <strong>New</strong> →{" "}
          <strong>Person</strong>. Use the Family option to say who's whose partner or child as you go.
        </li>
        <li>
          Add each trust, company or SMSF (<strong>New</strong> → <strong>Trust, company or fund</strong>), then open a
          person and give them their role in it. See <a href="#family-trust">Family and the family trust</a>.
        </li>
        <li>
          Add your bank accounts under <Link to="/banking">Bank accounts</Link> and import each one's transactions from a CSV
          (see <a href="#banking">Bank accounts and transactions</a>).
        </li>
        <li>
          Add properties, loans and investment accounts.
        </li>
        <li>
          Load your paperwork in one go with <Link to="/bulk-import">Import a folder</Link>, then go through{" "}
          <Link to="/inbox">To review</Link> to confirm what it worked out.
        </li>
        <li>
          Take a backup (<Link to="/settings">Settings</Link> → <strong>Download full backup</strong>).
        </li>
      </ol>
    ),
  },
  {
    id: "family-trust",
    title: "Family and the family trust",
    keywords: "partner spouse wife husband child children parent beneficiary trustee appointor settlor",
    body: (
      <>
        <p>
          On a person's page, <strong>Family</strong> links them to their partner, children and parents. You can also do
          it while adding someone new.
        </p>
        <p>
          A child has two parents, so both can be picked at once: choose <strong>is a child of</strong> (or{" "}
          <strong>Parent</strong> on the Family panel) and the first parent, then the other parent in <strong>and</strong>.
          If the first parent has a partner recorded, they're filled in for you — change it if that's not right. Adding a{" "}
          <strong>Child</strong> from a parent's page offers to make them their partner's child too.
        </p>
        <p>
          When a parent is made <strong>trustee</strong>, <strong>appointor</strong> or <strong>settlor</strong> of a
          trust, Financial Vault shows their partner and children in a list, all ticked. Untick anyone who shouldn't be
          in it, then confirm, and the rest are added as <strong>beneficiaries</strong>. Nobody is added without that
          confirmation, and anyone already a beneficiary isn't offered again.
        </p>
      </>
    ),
  },
  {
    id: "shared-ownership",
    title: "Shared ownership and unit trusts",
    keywords: "joint shared co-owner split percent 50/50 tenants in common unit trust unitholder units share discretionary family trust",
    body: (
      <>
        <p>
          <strong>Owned by more than one person.</strong> When adding a property, vehicle, other asset, loan, bank account or
          investment account, choose the
          first owner under <strong>Owned by</strong> (or <strong>Owed by</strong>), then <strong>+ Add another owner</strong>.
          The shares start out even — 50/50, or 25% each for four — and can be changed; they must add up to 100%. Owners can
          be people or entities in any mix. Something already recorded can be split later in <strong>Who owns it</strong>{" "}
          (or <strong>Who owes it</strong>) on its page.
        </p>
        <p>
          <strong>Which figures show what.</strong> The dashboard and Net Worth open on the <strong>whole family</strong>,
          where each thing counts once, at full value. Choose one person or entity in the list at the top to see just
          their share: a 50/50 house counts half its value and half its loan for each owner. Their page shows the same.
        </p>
        <p>
          <strong>Two kinds of trust.</strong> A <strong>family (discretionary) trust</strong> has beneficiaries, and the
          trustee decides each year who receives what — nobody owns a set part, so its value stays with the trust. A{" "}
          <strong>unit trust</strong> is split into units: add it under People & entities as a <em>Unit trust</em>, then on
          its page add each <strong>unitholder</strong> — a person, or another entity such as a family trust — with the
          share of units they hold. Four people who aren't related can each hold 25%. Each holder's share of the trust's net
          assets counts in their own figures; the family total still counts the trust's assets once. The Diagram
          shows each holder's line to the trust with their share.
        </p>
      </>
    ),
  },
  {
    id: "personal-details",
    title: "Personal & contact details, and professional advisers",
    keywords: "phone email address marital status next of kin mother's maiden name accountant solicitor real estate agent financial adviser fact find broker",
    body: (
      <>
        <p>
          On a person's page, <strong>Personal & contact details</strong> records phone, email, current and previous
          address, marital status, and next of kin — the things a broker's fact find always asks for. <strong>Mother's
          maiden name</strong> is kept separately, encrypted like a tax file number, since it's a security-question
          answer rather than an address.
        </p>
        <p>
          <Link to="/advisers">Professional advisers</Link> (at the foot of the People & entities page) keeps your
          accountant, solicitor, real estate agent and financial adviser in one place — add each once, and they're
          pulled straight into the Fact Find document pack below.
        </p>
      </>
    ),
  },
  {
    id: "id-cover",
    title: "ID and cover: licence, Medicare, passport, health insurance",
    keywords: "drivers licence medicare passport private health insurance identity id documents broker",
    body: (
      <>
        <p>
          On a person's page, <strong>ID &amp; cover</strong> → <strong>Add</strong> records private health insurance, a
          Medicare card, driver's licence, passport and similar. Enter the number and expiry date, save, then tap the
          record to attach the scan.
        </p>
        <p>
          Numbers are stored encrypted, like tax file numbers, and shown with only the last three digits.{" "}
          <strong>Show</strong> reveals the full number, and each reveal is recorded in the audit log.
        </p>
        <p>
          When a broker asks for ID, <Link to="/packs">Document Packs</Link> has an <strong>ID documents</strong> option
          (ticked in the Broker Pack) that adds the scans for the people connected to that entity. Expiry dates appear
          in the expiry calendar.
        </p>
      </>
    ),
  },
  {
    id: "insurance",
    title: "Insurance: every policy and what it covers",
    keywords: "insurance policy building contents landlord strata car boat life tpd trauma income protection premium renewal insurer",
    body: (
      <>
        <p>
          Each policy hangs off what it covers. On a property, vehicle or other asset, <strong>Insurance</strong> →{" "}
          <strong>Add a policy</strong> records building, landlord, car or boat cover. On a person's page,{" "}
          <strong>Life &amp; income cover</strong> records life, TPD, trauma and income protection — tick{" "}
          <strong>Held through a super fund</strong> when it is. <Link to="/insurance">Insurance</Link> in the menu lists
          every policy in one place, soonest renewal first, and can add one for anything.
        </p>
        <p>
          Open a policy to attach its schedule and certificates, or to change it. The policy number is stored encrypted
          and shown with only its last three digits; <strong>Show</strong> reveals it and is recorded in the audit log.
        </p>
        <p>
          Renewal dates go into the expiry calendar, and each policy appears in the asset tree under what it covers.
        </p>
      </>
    ),
  },
  {
    id: "estate",
    title: "Wills, powers of attorney and super nominations",
    keywords: "will estate power of attorney enduring guardianship advance care directive binding death benefit nomination bdbn lapsing reversionary executor solicitor",
    body: (
      <>
        <p>
          On a person's page, <strong>Will &amp; estate papers</strong> → <strong>Add</strong> records their will, powers
          of attorney, guardianship, advance care directive and super death benefit nominations: when each was signed,
          where the original is kept, and when to look at it again. Tap one to attach a scan.
        </p>
        <p>
          <strong>Lapsing nominations.</strong> A lapsing binding death benefit nomination usually stops being binding
          three years after it's signed. Leave <strong>Lapses on</strong> blank and it's set to three years after the
          signing date; that date goes into the expiry calendar so it can be re-signed in time. Check your fund's rules —
          some differ, and non-lapsing nominations don't run out.
        </p>
        <p>
          A <strong>Look at it again by</strong> date — after a marriage, separation, new child or property purchase —
          also goes into the calendar.
        </p>
      </>
    ),
  },
  {
    id: "documents",
    title: "Documents and To review",
    keywords: "upload file pdf scan confirm classify classification link archive ocr",
    body: (
      <>
        <p>
          Drop files onto <Link to="/inbox">To review</Link> (PDFs, JPGs and PNGs). Financial Vault reads each one —
          including scanned documents — and proposes what it is, who it belongs to, the financial year, dates and
          amounts.
        </p>
        <p>
          Nothing is filed automatically. Each new document waits in To review until you <strong>Confirm</strong> it.
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
        <h4>When the extracted text is wrong</h4>
        <p>
          Text read from a scanned image can come out garbled. On the document's page, the <strong>Extracted text</strong>{" "}
          card has a <strong>Turn off</strong> button — it stops that file's text being searched or shown, without
          touching the file itself. <strong>Turn back on</strong> brings it back; nothing is deleted either way.
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
    id: "tax-references",
    title: "Tax references: the ATO rules, kept to hand",
    keywords: "ato ruling guide tax reference library tr 2000/2 reference code check current link pack rulings",
    body: (
      <>
        <p>
          A <strong>tax reference</strong> is an official rule or guide — an ATO ruling such as TR 2000/2, an ATO guide, a
          Revenue NSW or APRA page. It isn't anyone's own paperwork, so it's never put in a document pack and isn't tied to a
          person or entity. Each one keeps its code (e.g. "TR 2000/2") and a date to check it's still current.
        </p>
        <ol>
          <li>
            Go to <Link to="/documents?reference=only">Documents → Tax references</Link>.
          </li>
          <li>
            Press <strong>Load the reference library</strong>. The official documents that come with Financial Vault are added
            in one go (it can take a minute). Pressing it again only adds what's missing.
          </li>
          <li>To file a ruling you've downloaded yourself, upload it as usual — rulings and ATO guide printouts are recognised.</li>
          <li>
            If one wasn't, open it and press <strong>This is an ATO ruling or guide — file it as a tax reference</strong>, then
            Save.
          </li>
        </ol>
        <p>
          Every 31 July a single reminder goes in the calendar to check they're still current, after the new financial year's
          guides come out. The addresses to download fresh copies are in the link pack (<code>reference/LINK-PACK.md</code>).
          Search still finds them, and the <strong>Why is this claimed?</strong> icon can point to one.
        </p>
      </>
    ),
  },
  {
    id: "bulk-import",
    title: "Import a folder: loading years of paperwork",
    keywords: "folder many files first load statements tax returns",
    body: (
      <>
        <p>
          <Link to="/bulk-import">Import a folder</Link> is for loading years of paperwork at once. Choose a folder (or a set
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
          <Link to="/email-import">Import from Gmail</Link> collects attachments — bills, statements, contract notes — straight
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
            On Import from Gmail, enter your Gmail address and that code, then <strong>Connect mailbox</strong>.
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
          already imported is skipped, so running it often is fine. New documents arrive in To review for you to
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
          Add each account under <Link to="/banking">Bank accounts</Link> → <strong>New account</strong>, choosing which entity
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
    id: "selling",
    title: "Selling something",
    keywords: "sold sell sale disposal capital gain main residence exemption cost base selling costs improvements stamp duty capital works building write-off depreciation",
    body: (
      <>
        <p>
          On a property, vehicle or other asset's page, <strong>Sold it?</strong> → <strong>Mark as sold</strong>. Enter
          the sale date and price, and the selling costs (agent, legal, advertising). For a property, also enter the
          buying costs (stamp duty, legal) and what was spent on improvements, and whether it was your main residence.
        </p>
        <p>
          A sold asset stays on record — with its documents, loans and history — under <strong>Sold</strong> in its list
          and in the asset tree. It drops out of every total from the sale date. Deleting is only for things entered by
          mistake.
        </p>
        <p>
          <strong>The capital gain</strong> for property, shares held outside an investment account, collectibles and
          similar is worked out for each owner by their share, and shown in <Link to="/reports">Reports</Link> →{" "}
          <strong>Capital gains</strong> for the year of the sale. Gain = sale price − (purchase price + buying costs +
          improvements + selling costs − building write-off claimed). The main residence exemption applies to people only,
          not trusts or companies, and can be full or a percentage. Cars and personal items don't have a capital gain worked out. Check the
          figures with your accountant.
        </p>
        <p>
          <strong>Building write-off claimed.</strong> For a rental or commercial property, enter the total capital works
          deductions (the 2.5% or 4% a year on the building) claimed over the years — it's on the depreciation schedule or
          in your accountant's workpapers. The ATO requires this to come off the cost for property bought after 13 May
          1997, which makes the gain bigger. Leaving it out would under-state the gain.
        </p>
        <p>
          <strong>It wasn't sold — undo</strong> on the same card puts it back if it was marked sold by mistake.
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
          Every debt is on one page, <Link to="/loans">Loans &amp; cards</Link> in the menu, in four sections — each with its
          own <strong>New</strong> button: <Link to="/loans">Property loans</Link> (choose the property that secures each one
          so its LVR can be shown), <Link to="/vehicle-loans">Vehicle &amp; boat loans</Link>,{" "}
          <Link to="/credit-cards">Credit cards</Link>, and <Link to="/liabilities">Personal &amp; other debts</Link> for
          everything else. The links at the top of the page jump to each section.
        </p>
        <p>
          For every loan, enter the <strong>repayment amount</strong> and how often it's <strong>paid</strong> (weekly,
          fortnightly, monthly or quarterly), so the monthly cost can be worked out.
        </p>
        <h4>Credit cards</h4>
        <p>
          Record each card with its <strong>credit limit</strong> as well as the balance. Lenders assess a card on its
          limit — a $20,000 limit counts against you even when nothing is owing — so the limit is the figure that matters
          when you apply for a loan.
        </p>
        <p>
          Assets work the same way, one list per kind: Properties, <Link to="/vehicles">Vehicles &amp; boats</Link>,
          Investments, Bank accounts, <Link to="/super">Super</Link> (retail and industry funds), and{" "}
          <Link to="/assets">Other assets</Link> for equipment, collectibles and cash held elsewhere. An asset owned in shares
          by more than one entity can have its ownership split recorded on its page.
        </p>
      </>
    ),
  },
  {
    id: "vehicles",
    title: "Vehicles and boats",
    keywords: "car ute motorcycle motorbike boat jet ski caravan campervan trailer rego registration vin hull car loan boat loan",
    body: (
      <>
        <p>
          <Link to="/vehicles">Vehicles &amp; boats</Link> (in the menu under Assets) records cars, utes, motorcycles,
          boats, jet skis, caravans, campervans and trailers. For each one you can keep the year, make and model, the
          registration and when it expires, the VIN (or hull ID for a boat), what you paid and what it's worth now.
        </p>
        <h4>Loans for a vehicle</h4>
        <p>
          On a vehicle's page, <strong>Add a loan</strong> opens a vehicle / boat loan already linked to it. Enter the
          balance, the rate and the repayments. A personal loan that paid for a vehicle can be linked the same way, using{" "}
          <strong>What it paid for</strong> on the loan.
        </p>
        <p>
          Once linked, the vehicle's page shows what's owing on it, the monthly repayment and your equity (its value less
          the loan). Vehicle and boat loans have their own line in Net Worth, and they appear in the borrowing summary.
        </p>
        <p>A vehicle can't be deleted while a loan is linked to it — delete or unlink the loan first.</p>
      </>
    ),
  },
  {
    id: "borrowing",
    title: "Applying for a loan: your borrowing summary",
    keywords: "mortgage application broker lender serviceability borrowing capacity commitments debts limits",
    body: (
      <>
        <p>
          When you apply for a new mortgage, the lender wants every debt you have: the balance, the monthly repayment,
          and for credit cards the limit. <Link to="/reports">Reports</Link> → <strong>Debt Summary</strong> puts that in
          one place:
        </p>
        <ul>
          <li>
            <strong>Total debt</strong> — what you owe across every loan and card.
          </li>
          <li>
            <strong>Credit card limits</strong> — the total of your limits, which is what lenders count for cards.
          </li>
          <li>
            <strong>Repayments a month</strong> — every loan's repayment converted to a monthly figure (a fortnightly
            payment of $300 is about $650 a month).
          </li>
        </ul>
        <p>
          It warns you about any card with no limit recorded, and any loan with no repayment entered, so the totals
          aren't quietly short.
        </p>
        <p>
          For your broker, <Link to="/packs">Document Packs</Link> → <strong>Broker Pack</strong> includes an assets and
          liabilities statement with the same limits, monthly repayments and what each loan is secured by or paid for.
        </p>
        <p>
          These are the figures a lender starts from. How much they'll lend depends on their own rules — ask your broker.
        </p>
      </>
    ),
  },
  {
    id: "loan-purposes",
    title: "Loan interest: what the money was used for",
    keywords: "debt allocation loan purpose deductible interest split facility redraw equity usable equity why claimed reason explain",
    body: (
      <>
        <p>
          Loan interest is deductible according to what the borrowed money was <strong>used for</strong> — not what the loan
          is secured against. A loan secured on your home that paid for a rental property is deductible; a loan secured on
          a rental that paid for a holiday isn't. Mixed loans are split by the share of money used for each (ATO ruling
          TR 2000/2).
        </p>
        <ol>
          <li>
            On a loan's page, under <strong>What this loan's money was used for</strong>, press <strong>Add a use</strong>.
          </li>
          <li>
            Enter the amount, what it paid for, and link the evidence (the settlement statement or loan statement). Tick
            "Used to produce income" if it's for a rental, shares or a business.
          </li>
          <li>
            Each year, press <strong>Add a year's interest</strong> and enter the interest from the lender's annual
            statement. The deductible part is worked out from the uses.
          </li>
          <li>
            <Link to="/reports">Reports</Link> → <strong>Loan Interest</strong> shows every loan for a year, split by use and
            by borrower. The Accountant Pack includes it as a spreadsheet.
          </li>
        </ol>
        <p>
          <strong>Loan splits:</strong> give splits under one facility the same <strong>Facility</strong> name on each loan
          (e.g. "CBA home loan"), so they're shown together.
        </p>
        <p>
          <strong>Usable equity</strong> on a property page is its value × the lender's maximum loan-to-value ratio (80%
          unless you change it), less what's owed on loans secured by it. Drawing it is new borrowing: its interest is
          deductible only if the money goes to producing income. Keep investment and private draws in separate splits —
          once a loan mixes both, every repayment is shared between them.
        </p>
        <h4>Why is this claimed?</h4>
        <p>
          The small book icon next to each use and each year's interest opens the reason for the claim, the rule behind it (a
          tax reference and paragraph), the evidence and your accountant's note. It fills in blue once a reason is saved.{" "}
          <strong>Explain this claim (download)</strong> gives one ZIP with the explanation, the ruling and the evidence —
          ready to send if your accountant or the ATO asks.
        </p>
        <p>
          This first stage assumes nothing was redrawn, and no sale money went back into the loan, during the year. If
          something was, tell your accountant — they'll use the ATO's month-by-month method.
        </p>
      </>
    ),
  },
  {
    id: "property-profit",
    title: "Property profit after tax",
    keywords: "yield net yield after tax negative gearing land tax running costs depreciation income salary rental profit property profit",
    body: (
      <>
        <p>
          <Link to="/reports">Reports</Link> → <strong>Property Profit</strong> shows what each investment property really returns
          in a year, best first — so a property that looks like a 4% yield but is closer to 2% after costs is spotted before tax
          time.
        </p>
        <ol>
          <li>Rent, less running costs and land tax — the <strong>net yield</strong>.</li>
          <li>Less interest — <strong>cash before tax</strong>.</li>
          <li>
            Less depreciation and the building write-off (not cash, but deductible) — the <strong>tax result</strong>. A loss
            reduces the owner's tax on their other income (negative gearing).
          </li>
          <li>Each owner's tax on their share — <strong>cash after tax</strong>.</li>
        </ol>
        <p>To fill it in:</p>
        <ol>
          <li>
            On each person's page, under <strong>Income</strong>, enter their salary and any bonus, overtime or commission.
          </li>
          <li>
            On each property's page, under <strong>Running costs and tax figures</strong>, enter the rates, strata, management
            percentage and so on, the land value, and the yearly depreciation from the schedule. Mark your home as your home — it's
            left out.
          </li>
          <li>Weekly rent is on the property's main details; insurance comes from the policies recorded against it.</li>
          <li>
            Interest uses the deductible interest from the loan's recorded uses where there is one; otherwise it's estimated from
            the loans secured on the property.
          </li>
        </ol>
        <p>
          <strong>Land tax</strong> is estimated at NSW rates on each owner's combined NSW land (not the home): nothing up to
          $1,075,000, then $100 plus 1.6%, and 2% above $6,571,000. Family, discretionary and most unit trusts get no tax-free
          threshold. If you have the assessment, enter the real amount instead. Other states aren't estimated.
        </p>
        <p>
          Tax is at the 2026-27 resident rates plus Medicare. Companies are shown at 25%, super funds at 15%; a trust's result is
          taxed in its beneficiaries' hands, so it's shown before tax. Estimates, not tax advice.
        </p>
      </>
    ),
  },
  {
    id: "borrowing-capacity",
    title: "How much could I borrow?",
    keywords: "borrowing capacity servicing buffer apra lend loan estimate equity release lease doc commercial smsf dti debt to income",
    body: (
      <>
        <p>
          <Link to="/borrowing">How much could I borrow?</Link> (in the menu under What you owe) estimates what most lenders
          would lend, from the income, loans, cards and properties recorded here. It gives a range: conservative to generous
          lender assumptions.
        </p>
        <ol>
          <li>Tick who's borrowing, and enter your living expenses a month.</li>
          <li>
            The estimate counts salary in full, part of any bonus or overtime and part of the rent, takes off tax, your living
            expenses and your existing loans and cards, and works out what new loan the rest could repay.
          </li>
          <li>
            Repayments are assessed at the loan rate plus a 3% buffer (APRA's rule). Existing loans are counted as principal and
            interest at the buffered rate, and cards at a share of the limit, even if unused.
          </li>
          <li>
            If the loan would take your debts to 6× your income or more, it says so: from February 2026 banks can only make 20%
            of their new loans at that level.
          </li>
        </ol>
        <p>
          <strong>Drawing equity</strong> shows each property's value × the maximum LVR, less what's owed, limited by what your
          income can carry. <strong>Commercial, lease-doc and SMSF loans</strong> are worked out on the property's own rent
          (interest cover) and a lower LVR.
        </p>
        <p>
          Every assumption is under <strong>Lender assumptions</strong> — change any, and <strong>Save as my assumptions</strong>{" "}
          keeps them. Ask your broker for the figures their lenders use. The broker's lender calculators have the final say.
        </p>
      </>
    ),
  },
  {
    id: "work-deductions",
    title: "Work deductions, income statements and car options",
    keywords: "payg employee occupation deductions work from home car cents per km logbook self-education tools uniform income statement payment summary novated lease electric car allowance fbt salary packaging",
    body: (
      <>
        <p>
          On each person's page, <strong>Job and work benefits</strong> records their occupation, employer, car allowance and
          salary packaging. <strong>Work-related deductions</strong> keeps the year's claims, each with its receipt or record.
        </p>
        <ol>
          <li>Pick the financial year, then <strong>Add a claim</strong>.</li>
          <li>
            For a car, choose <strong>Cents per km</strong> and enter the work kilometres: the claim is worked out at the ATO's rate
            (91c in 2026-27, up to 5,000 km). For working from home, choose <strong>Fixed rate</strong> and enter the hours (70c an
            hour).
          </li>
          <li>Attach the receipt or record. The book icon records why it's claimed.</li>
          <li>
            The checklist underneath lists what can be claimed and the records needed. Warnings show missing records, a car
            allowance with no car claim, and items over $300 (those are depreciated, not claimed at once).
          </li>
          <li>
            Add the <strong>income statement</strong> figures from myGov after 30 June — it's compared with the income on the page.
          </li>
        </ol>
        <p>
          Every claim needs three things: you spent the money and weren't paid back; it was for earning your income; and you have a
          record. The ATO's guide for each occupation (linked from the card) lists what that job can claim.
        </p>
        <p>
          <strong>Compare car options</strong> works out what a car costs after tax as a car allowance, a novated lease, or an
          electric car on a novated lease (exempt from fringe benefits tax until the rules change for new leases from 1 April 2027
          on cars over $75,000). It also shows how much each lowers the payslip salary a lender sees.
        </p>
      </>
    ),
  },
  {
    id: "accountant-checklist",
    title: "Worth asking your accountant",
    keywords: "missed deductions concessions checklist super carry forward co-contribution medicare levy surcharge depreciation schedule borrowing costs split loan trust distributions private binding ruling part iva",
    body: (
      <>
        <p>
          <Link to="/accountant-checklist">Worth asking your accountant</Link> (in the menu under Reports) goes through your
          records for deductions, offsets and concessions you may be entitled to but aren't using — unused super cap, a missing
          depreciation schedule, loan uses not recorded, borrowing costs, the Medicare levy surcharge, share parcels just under 12
          months, trust distributions and more.
        </p>
        <p>Each item says why the app thinks so, the rule, its source, and what to ask. They're grouped by how settled they are:</p>
        <ul>
          <li>
            <strong>Settled</strong> — clearly allowed; claim it with records.
          </li>
          <li>
            <strong>Arguable</strong> — a reasonable position; take it to your accountant. <strong>Facts for a private ruling</strong>{" "}
            downloads the facts laid out for them to ask the ATO — a favourable ruling binds the ATO.
          </li>
          <li>
            <strong>ATO watches this</strong> — areas the ATO has warned about, so you know where the line is.
          </li>
        </ul>
        <p>
          <strong>Print</strong> it to take to the appointment. Nothing here looks for schemes — the best protection is each claim
          with its record and the rule behind it.
        </p>
      </>
    ),
  },
  {
    id: "whats-missing",
    title: "What's missing: insurance and paperwork",
    keywords: "missing expected insurance documents checklist landlord building contents ctp green slip strata certificate of currency private health life tpd income protection rental statement council rates land tax interest statement depreciation trust deed distribution minutes super statement set aside not needed print",
    body: (
      <>
        <p>
          <Link to="/missing">What's missing</Link> (in the menu under Plan &amp; report) works out the insurance and paperwork
          that's normal for what you've recorded, and shows what isn't here yet — grouped by property, vehicle, person and
          trust. For example: landlord and building cover on a rental, a CTP green slip on a car, contents cover on a strata
          home, private hospital cover above the Medicare levy surcharge threshold, the year's rental statement, rates notices
          and loan interest statement, and a trust's deed and distribution minutes.
        </p>
        <ul>
          <li>
            <strong>Required</strong> — required by law or by a lender, or effectively essential.
          </li>
          <li>
            <strong>Worth checking</strong> — normal for people in your position.
          </li>
        </ul>
        <p>Items tick themselves off:</p>
        <ol>
          <li>
            <strong>Insurance</strong> — tap <strong>Add policy</strong>. The property, vehicle or person's page opens with the
            insurance form ready on that kind of policy.
          </li>
          <li>
            <strong>Documents</strong> — tap <strong>Add document</strong>, and add it under Documents on that page. It counts
            once it's filed as the right type (for example "Rental Statement") and, for yearly paperwork, dated in or filed to
            that financial year.
          </li>
        </ol>
        <p>
          If something isn't needed — building cover inside the landlord policy, life cover held in super — tap{" "}
          <strong>Not needed</strong> and say why. It's kept on record with your reason and stops flagging; <strong>Flag it
          again</strong> brings it back. Yearly paperwork is checked for the financial year that has most recently ended; choose
          another year at the top. <strong>Print</strong> gives one list to take to the broker or accountant.
        </p>
        <p>
          The same items show on each property, vehicle, person and trust's own page, and the number missing shows on the
          dashboard under Worth doing.
        </p>
      </>
    ),
  },
  {
    id: "features",
    title: "Switching features on and off",
    keywords: "features switch turn off hide menu modules smsf commercial gmail import vehicles investments super insurance advisers",
    body: (
      <>
        <p>
          Not everyone needs every part of the app. In <Link to="/settings#features">Settings</Link> → <strong>Features</strong>,
          untick anything you don't use — for example Self-managed super fund, Commercial property, Import from Gmail or Job
          &amp; work deductions.
        </p>
        <p>
          A switched-off feature disappears from the menu, the dashboard and the pages it appears on. <strong>Nothing is
          deleted</strong>: tick it again and everything comes back exactly as it was. The choice is saved in the vault, so it
          applies on every computer that opens it.
        </p>
      </>
    ),
  },
  {
    id: "structure-comparison",
    title: "Who should own the next property?",
    keywords: "structure comparison ownership trust company smsf joint individual negative gearing land tax cgt why owned",
    body: (
      <>
        <p>
          <Link to="/structure-comparison">Who should own it?</Link> models the same purchase owned by each person, by two people
          half each, by a family trust, a company and an SMSF — with each person's real income and the NSW land they already own.
          For each: land tax, tax each year, cash after tax, tax on selling, and the overall result over the years held, plus the
          trade-offs in plain English.
        </p>
        <p>
          The owner is decided at purchase: changing it later usually costs stamp duty and capital gains tax. Take the comparison
          to your accountant before buying.
        </p>
        <p>
          On each property, <strong>Running costs and tax figures</strong> has a place to note <strong>why it's owned this way</strong>{" "}
          — useful years later.
        </p>
      </>
    ),
  },
  {
    id: "income-spending",
    title: "Income and spending for a loan application",
    keywords: "living expenses income spending cash flow budget monthly average loan application lender hem",
    body: (
      <>
        <p>
          <Link to="/reports">Reports</Link> → <strong>Income &amp; Spending</strong> adds up what came into and went out
          of your bank accounts each month, from the transactions you've imported, with the monthly averages a lender asks
          for. Choose the last 3, 6 or 12 months, and everyone's accounts or one person's.
        </p>
        <ul>
          <li>Only whole months count — the current month isn't finished.</li>
          <li>
            Money moved between your own accounts isn't income or spending. A payment out matched by the same amount into
            another of your accounts within three days is left out as a transfer.
          </li>
          <li>Averages start from the first month with transactions, so three months of statements give a three-month average.</li>
          <li>
            Money out includes loan repayments. Lenders ask for those separately (see <strong>Debt Summary</strong>), so
            take them off when you fill in living expenses.
          </li>
        </ul>
        <p>Give each transaction a category on its account's page and the report breaks the totals down by category too.</p>
      </>
    ),
  },
  {
    id: "offsets",
    title: "Offset accounts",
    keywords: "offset account interest saving mortgage home loan",
    body: (
      <>
        <p>
          When adding a bank account, choose the type <strong>Offset</strong>, then pick the loan it offsets. On an
          existing account, use <strong>Edit</strong>.
        </p>
        <p>
          The loan's page then shows the offset balance, the balance interest is actually charged on, and roughly how much
          interest the offset saves each year (offset balance × interest rate). <strong>Debt Summary</strong> in Reports
          shows the same. Your net worth isn't changed by it — the money in the offset is already counted as a bank
          balance, and lenders still count the full loan.
        </p>
      </>
    ),
  },
  {
    id: "items",
    title: "Items in a property: appliances, warranties and servicing",
    keywords: "sub-asset air conditioner washing machine dryer hot water solar warranty service repair maintenance receipt",
    body: (
      <>
        <p>
          On a property's page, <strong>Items in this property</strong> → <strong>Add item</strong> records things like
          an air conditioner, hot water system, washing machine or dryer: make, model, serial number, when you bought it,
          what it cost and when the warranty ends.
        </p>
        <p>
          Open an item to attach its receipt, manual and warranty, and to keep its <strong>service &amp; running costs</strong>:
          each service or repair with the date, who did it, what it cost and when it's next due. The item shows its total
          cost to own — purchase plus everything spent since — to help decide whether to repair or replace. Items can hold
          their own parts too (a pool pump under the pool, say).
        </p>
        <p>
          Vehicles and boats have the same service log. An item's value is part of the property's value, so items are
          never added to net worth a second time.
        </p>
      </>
    ),
  },
  {
    id: "calendar",
    title: "Expiry calendar",
    keywords: "calendar expiry expiries renewal reminder ics google apple outlook due dates",
    body: (
      <>
        <p>
          The bottom of the <Link to="/visualization">Diagram</Link> tab lists everything that expires or falls due,
          month by month: ID and health cover, insurance and other document renewals, vehicle rego, warranties, services
          due, lease expiries and rent reviews, and fixed-rate loan periods. Tap one to open it.
        </p>
        <h4>Putting the dates in your own calendar</h4>
        <ol>
          <li>
            Click <strong>Add to my calendar</strong>. A file called <code>financial-vault-expiries.ics</code> downloads.
          </li>
          <li>
            Open the file. Apple Calendar and Outlook offer to add the events. For Google Calendar, go to{" "}
            <code>calendar.google.com</code>, click the gear icon, choose <strong>Import &amp; export</strong>, select the
            file and click <strong>Import</strong>.
          </li>
        </ol>
        <p>
          Each date comes with a reminder two weeks before. Importing again later updates the same events rather than
          doubling them up. The file holds only what's due and when — never numbers or amounts — but it does leave this
          computer once it's in an online calendar.
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
          price, or at cost where there's no price) + super + vehicles and boats + other assets. Liabilities = every loan
          and debt, including vehicle and boat loans.
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
          Only what you tick goes in. The summaries (assets and liabilities, tax, income, loan interest) are spreadsheets
          built fresh from your records at that moment, and every pack includes an index listing each document in it. Tax
          references (ATO rulings and guides) are never included.
        </p>
        <h4>Fact Find</h4>
        <p>
          The <strong>Fact Find</strong> summary is laid out with the same broad sections every broker's fact find
          asks for — personal and contact details, family, ID (kind and expiry, not the number), employment, assets
          and liabilities, insurance, and your professional advisers — filled in from your own records. Anything
          that's a one-off answer for that particular loan (why you want it, the responsible-lending questions, what
          you'd like help with) or something Financial Vault doesn't track (employer details, your own forward
          expense estimate) is left blank for you to fill in by hand. Encrypted numbers — TFNs, ID numbers, account
          and policy numbers — are never included; tick the ID documents chip if the broker wants to see the scans
          themselves.
        </p>
      </>
    ),
  },
  {
    id: "pay-tracking",
    title: "Payslips and pay tracking",
    keywords: "payslip salary wages fortnightly weekly monthly missing payday super guarantee",
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
        <p>
          <strong>Payday super.</strong> From 1 July 2026, employers have to pay super at the same time as each pay. For
          pays from then on, tick <strong>Paid</strong> in the Super column once the contribution shows in the super
          account, so a missed payment stands out.
        </p>
      </>
    ),
  },
  {
    id: "portfolio-plan",
    title: "Portfolio Plan",
    keywords: "projection future purchases refinance equity growth stamp duty transfer duty buying costs gst going concern deposit cash",
    body: (
      <>
        <p>
          A <Link to="/portfolio-plans">Portfolio Plan</Link> is a saved, year-by-year projection of planned property
          purchases: growth, rent, loans, refinances and equity drawn from properties you already own (including what
          that borrowing costs). Once a planned property is actually bought, link it to the real commercial property and
          the plan shows actual figures next to the prediction.
        </p>
        <p>
          <strong>Cash needed to buy.</strong> Each planned property shows the cash it needs: the deposit, stamp duty,
          GST if it applies, and other buying costs (legal, inspections, lender fees). Stamp duty is estimated from the NSW
          general rates for 2026-27 unless you enter the figure. First home buyer concessions and the foreign buyer
          surcharge aren't included. A tenanted commercial property sold as a going concern is usually GST-free; tick
          <em> GST payable</em> if it isn't. The totals table has a <strong>Cash to buy</strong> column for each year.
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
            A <strong>vehicle or boat</strong> with a loan linked to it, or anything with items under it.
          </li>
          <li>
            A <strong>person</strong> who still holds anything in their own name — their personal entity goes with them,
            so it has to be empty first.
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
    id: "smsf",
    title: "Self-managed super funds (SMSFs)",
    keywords: "smsf super fund member contribution concessional non-concessional cap carry forward bring forward pension minimum drawdown lrba bare holding trust auditor annual return trustee transfer balance division 296 large balance business real property",
    body: (
      <>
        <p>
          Add the fund under <Link to="/people">People & entities</Link> → <strong>New</strong> →{" "}
          <strong>Trust, company or fund</strong>, with the type <strong>Self-managed super fund (SMSF)</strong>, then open
          it. The fund's page has five parts:
        </p>
        <ol>
          <li>
            <strong>Summary.</strong> Pick the year at the top. <strong>To look at</strong> lists what an auditor would pick up:
            a member who isn't a trustee, contributions over a cap, no auditor recorded, a strategy review that's overdue.
          </li>
          <li>
            <strong>Members and contributions.</strong> Add each member (up to six). Record each contribution with its type — the
            type decides which cap it counts against. Contributions into a member's other funds can be recorded too, because
            the caps count every fund together. Record each member's balance at 30 June from the annual statement; the
            total across all their super decides carry-forward and bring-forward.
          </li>
          <li>
            <strong>Pensions.</strong> Start a pension when a member retires. Each year, enter the pension balance on 1 July
            and each payment. The page shows that year's minimum (by age) and what's left to pay by 30 June, and the maximum
            for a transition to retirement pension. It also estimates the share of fund income that's tax-free.
          </li>
          <li>
            <strong>Property and borrowing (LRBA).</strong> When the fund borrowed to buy a property: add the property as
            owned by the fund (with its weekly rent), add the holding trust as a <em>Holding (bare) trust</em>, then{" "}
            <strong>Add an LRBA loan</strong>. The page shows the loan-to-value ratio and whether the rent covers the
            repayments. Enter the date the fund entered into the loan: from 10 August 2026, a new SMSF borrowing
            arrangement can only buy <em>business real property</em> (property used wholly in a business), not
            residential. Loans set up before then aren't affected. The page warns if a residential property has a loan
            that started on or after that date.
          </li>
          <li>
            <strong>Trustee, auditor and deadlines.</strong> Record individual trustees or the trustee company, the auditor,
            who lodges the return and the latest year lodged. The annual return, auditor appointment, strategy review,
            ASIC company review and pension dates go into the expiry calendar.
          </li>
          <li>
            <strong>Balances over $3 million.</strong> From 1 July 2026, Division 296 adds 15% tax on the share of a
            member's earnings that comes from a total super balance over $3 million (and another 10% over $10 million).
            The member's card flags anyone within 10% of $3 million or over it, from the total super balance you record
            each year. The ATO works out the tax and sends the assessment; this is only the early warning.
          </li>
        </ol>
        <p>
          <strong>The caps used</strong> for 2026-27: concessional $32,500, non-concessional $130,000 (up to $390,000 by
          bringing forward), transfer balance cap $2.1 million. Earlier years use their own caps. Unused concessional cap is
          carried forward up to five years while the total super balance was under $500,000 at the previous 30 June — worked
          out from the contributions recorded here, so it's only as complete as those records.
        </p>
        <p>
          These figures help you keep track; they're not advice. Your accountant or SMSF administrator confirms the numbers
          that go to the ATO.
        </p>
      </>
    ),
  },
  {
    id: "look-and-feel",
    title: "Look and feel: colours, style, dark mode and logo",
    keywords: "theme colour color violet teal pink lilac forest gold charcoal ocean terracotta grey greyscale bold soft dark light mode appearance logo keyhole vault monogram",
    body: (
      <>
        <p>There are nine colours, two styles, light or dark, and three logos to choose from:</p>
        <ul>
          <li>
            <strong>Colours:</strong> Midnight violet, Deep teal, Navy & pink, Cobalt & lilac, Forest green, Charcoal & gold,
            Ocean blue, Warm terracotta and Plain greyscale.
          </li>
          <li>
            <strong>Bold</strong> has square corners, heavy borders and a solid top bar. <strong>Soft</strong> is lighter
            with rounded corners.
          </li>
          <li>
            <strong>Light</strong>, <strong>Dark</strong>, or <strong>Match computer</strong> (follows your computer's own
            setting, switching at night if it does).
          </li>
          <li>
            <strong>Logo:</strong> Keyhole, Vault door or Monogram — shown on the dashboard, the lock screen and the browser
            tab.
          </li>
        </ul>
        <p>To change them:</p>
        <ol>
          <li>Open the ☰ menu.</li>
          <li>Scroll to the bottom, to <strong>Look and feel</strong>.</li>
          <li>Tap a colour, Bold or Soft, and Light, Dark or Auto. The change happens straight away.</li>
        </ol>
        <p>
          The same choices are in <Link to="/settings">Settings</Link> → <strong>Look and feel</strong>, with the colour
          names shown and the logo choice. Your choice is kept on this computer only, so each person who uses Financial Vault can pick their
          own. Red is always kept for delete buttons and warnings, whichever colour you choose.
        </p>
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
          than this computer. Documents, tax file numbers, account and policy numbers and the Gmail connection stay
          encrypted inside it, so restoring needs the passcode (or recovery key) you had when you took it — and the
          documents in it can only be opened through Financial Vault.
        </p>
        <h4>Restoring from a backup</h4>
        <ol>
          <li>Start a fresh copy of Financial Vault (a new download, or on a new computer). Don't set a passcode.</li>
          <li>
            On the first screen, under <strong>Moving from another computer, or starting over from a backup?</strong>,
            choose your backup ZIP and click <strong>Restore from this backup</strong>.
          </li>
          <li>When it says it's done, unlock with the passcode you had when the backup was taken.</li>
        </ol>
        <p>
          Restoring only works on a copy with no records in it, so it can never overwrite what you have. The dashboard
          reminds you when your last backup is over 30 days old.
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
            Tax file numbers, ID numbers, bank account numbers, insurance policy numbers and the Gmail app password are
            encrypted. They show with only their last digits; <strong>Show</strong> reveals one, and each reveal is logged.
          </li>
          <li>
            Document files are encrypted in the documents folder, so a copy of that folder — a synced folder, a backup,
            a lost laptop's drive — can't be opened without Financial Vault and your passcode. Documents from before this
            version are encrypted in the background the first time you unlock.
          </li>
          <li>Nothing is sent anywhere, except price lookups you've switched on and Gmail imports you run.</li>
        </ul>
        <h4>What isn't protected</h4>
        <p>
          Everything else — names, balances, transactions, holdings, and the text read out of documents for searching — is
          stored unencrypted in the database on your computer. The passcode stops people using the app; it doesn't stop
          someone with access to your files reading the database directly. A document you download or put in a pack is
          an ordinary, unencrypted copy. Protect the computer itself with a login password and disk encryption
          (FileVault on a Mac, BitLocker on Windows).
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
