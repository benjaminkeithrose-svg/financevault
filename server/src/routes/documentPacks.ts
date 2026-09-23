import { Router } from "express";
import { ZipArchive, ArchiverError } from "archiver";
import { prisma } from "../db.js";
import { shareOf } from "../services/ownership.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { readDocumentFile } from "../services/documentFiles.js";
import { DOCUMENT_TYPES } from "../services/documentTypes.js";
import { describeVehicle, monthlyRepayment } from "../services/debts.js";
import { computeLiveBreakdown } from "../services/netWorth.js";
import { incomeAndSpending } from "../services/cashflow.js";
import { policyKindLabel } from "./tree.js";
import { ADVISER_KINDS } from "./advisers.js";

export const documentPacksRouter = Router();

// ---------------------------------------------------------------------------
// Document Packs (spec: variable-output packs for brokers/accountants).
// Chips are never all-or-nothing — the caller picks exactly which document
// categories and generated summaries to include, so a pack only ever
// contains what the user explicitly chose (spec: "not everything, because
// I'll get overloaded").
//
// Two kinds of chip:
//  - Document categories: match the existing DOCUMENT_TYPES catalogue
//    categories, plus a special "Income" chip covering payslips/PAYG
//    (whether uploaded directly or logged against a tracked pay period).
//  - Generated summaries: CSVs built live from current data, never from
//    uploaded documents, so they're always as current as the app itself.
// ---------------------------------------------------------------------------

const DOCUMENT_CATEGORIES = ["Tax", "Property", "Investment", "Personal", "Finance", "Trust/Company", "Commercial Property"] as const;
const INCOME_DOCUMENT_TYPES = ["Payslip", "PAYG Summary / Income Statement"];
const GENERATED_SUMMARIES = ["ASSETS_LIABILITIES", "TAX_SUMMARY", "INCOME_SUMMARY", "FACT_FIND"] as const;

const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DE_FACTO: "De facto",
  SEPARATED: "Separated",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
  OTHER: "Other",
};

const IDENTITY_KIND_LABELS: Record<string, string> = {
  PRIVATE_HEALTH: "Private health insurance",
  MEDICARE: "Medicare card",
  DRIVERS_LICENCE: "Driver's licence",
  PASSPORT: "Passport",
  BIRTH_CERTIFICATE: "Birth certificate",
  CITIZENSHIP: "Citizenship certificate",
  PROOF_OF_AGE: "Proof of age card",
  OTHER: "Other ID or cover",
};

function categoryToDocumentTypes(category: string): string[] {
  return DOCUMENT_TYPES.filter((d) => d.category === category).map((d) => d.name);
}

async function connectedPersonIds(entityId: string): Promise<string[]> {
  const rels = await prisma.personEntityRelationship.findMany({ where: { entityId }, select: { personId: true } });
  return rels.map((r) => r.personId);
}

async function documentsForCategory(entityId: string, financialYearId: string | undefined, category: string) {
  const documentType = { in: categoryToDocumentTypes(category) };
  return prisma.document.findMany({
    where: {
      entityId,
      documentType,
      ...(financialYearId ? { OR: [{ financialYearId }, { financialYearId: null }] } : {}),
    },
    orderBy: { documentDate: "desc" },
  });
}

/**
 * Scans of ID and cover (licence, Medicare, passport, health insurance) for
 * the people connected to this entity — what a broker asks for to verify
 * identity. Only included when that chip is ticked.
 */
async function idDocuments(entityId: string) {
  const personIds = await connectedPersonIds(entityId);
  if (personIds.length === 0) return [];
  const records = await prisma.identityRecord.findMany({ where: { personId: { in: personIds } }, select: { id: true } });
  const links = await prisma.documentLink.findMany({
    where: { targetType: "IDENTITY_RECORD", targetId: { in: records.map((r) => r.id) } },
    include: { document: true },
  });
  const byId = new Map(links.map((l) => [l.document.id, l.document]));
  return [...byId.values()];
}

async function incomeDocuments(entityId: string, financialYearId: string | undefined) {
  const personIds = await connectedPersonIds(entityId);

  const directUploads = await prisma.document.findMany({
    where: {
      entityId,
      documentType: { in: INCOME_DOCUMENT_TYPES },
      ...(financialYearId ? { OR: [{ financialYearId }, { financialYearId: null }] } : {}),
    },
  });

  let fyBounds: { startDate: Date; endDate: Date } | null = null;
  if (financialYearId) {
    fyBounds = await prisma.financialYear.findUnique({ where: { id: financialYearId } });
  }

  const loggedEntries =
    personIds.length === 0
      ? []
      : await prisma.payPeriodEntry.findMany({
          where: {
            personId: { in: personIds },
            status: "LOGGED",
            documentId: { not: null },
            ...(fyBounds ? { periodStart: { gte: fyBounds.startDate, lte: fyBounds.endDate } } : {}),
          },
          include: { document: true },
        });

  const byId = new Map<string, (typeof directUploads)[number]>();
  for (const d of directUploads) byId.set(d.id, d);
  for (const e of loggedEntries) if (e.document) byId.set(e.document.id, e.document);

  return Array.from(byId.values());
}

export async function assetsLiabilitiesCsv(entityId: string): Promise<string> {
  // Anything this entity owns or owes part of, not just what's in its name.
  const ownedBy = { OR: [{ entityId }, { ownerships: { some: { ownerEntityId: entityId } } }] };
  const [assets, liabilities, accounts] = await Promise.all([
    prisma.asset.findMany({ where: { AND: [ownedBy, { parentAssetId: null }, { disposalDate: null }] }, include: { ownerships: true } }),
    prisma.liability.findMany({
      where: ownedBy,
      include: { securityProperty: true, securityCommercialProperty: true, securityAsset: true, ownerships: true },
    }),
    prisma.account.findMany({ where: ownedBy, include: { ownerships: true } }),
  ]);

  const pct = (share: number) => `${Math.round(share * 10000) / 100}%`;
  const amount = (v: number | null, share: number) => (v === null ? "" : (v * share).toFixed(2));

  // Laid out the way a broker's assets-and-liabilities form asks for it:
  // card limits and monthly repayments matter as much as balances. Jointly
  // held things show this entity's share and the full amount.
  const rows: string[][] = [["Type", "Name", "Share", "Value/Balance (share)", "Full value/balance", "Detail", "Credit limit", "Monthly repayment (share)", "Secured by / for"]];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalLimits = 0;
  let totalMonthly = 0;
  for (const a of assets) {
    const share = shareOf(a, entityId);
    const detail = a.assetType === "VEHICLE" ? `${a.vehicleType ?? "VEHICLE"}: ${describeVehicle(a)}` : a.assetType;
    rows.push(["Asset", a.name, pct(share), amount(a.currentValue, share), String(a.currentValue ?? ""), detail, "", "", ""]);
    totalAssets += (a.currentValue ?? 0) * share;
  }
  for (const acc of accounts) {
    const share = shareOf(acc, entityId);
    rows.push(["Bank Account", `${acc.institution} ${acc.accountName}`, pct(share), amount(acc.currentBalance, share), String(acc.currentBalance ?? ""), acc.accountType, "", "", ""]);
    totalAssets += (acc.currentBalance ?? 0) * share;
  }
  for (const l of liabilities) {
    const share = shareOf(l, entityId);
    const monthly = monthlyRepayment(l);
    const securedBy =
      l.securityProperty?.address ?? l.securityCommercialProperty?.name ?? (l.securityAsset ? describeVehicle(l.securityAsset) : "");
    rows.push([
      "Liability",
      l.name,
      pct(share),
      amount(l.currentBalance, share),
      String(l.currentBalance ?? ""),
      [l.liabilityType, l.lender].filter(Boolean).join(" — "),
      l.creditLimit !== null ? String(l.creditLimit) : "",
      monthly !== null ? (monthly * share).toFixed(2) : "",
      securedBy,
    ]);
    totalLiabilities += (l.currentBalance ?? 0) * share;
    // Lenders count the whole limit of a card someone can draw on.
    if (l.liabilityType === "CREDIT_CARD") totalLimits += l.creditLimit ?? 0;
    totalMonthly += (monthly ?? 0) * share;
  }

  rows.push([]);
  rows.push(["Total assets (share)", "", "", totalAssets.toFixed(2)]);
  rows.push(["Total liabilities (share)", "", "", totalLiabilities.toFixed(2)]);
  rows.push(["Net position (share)", "", "", (totalAssets - totalLiabilities).toFixed(2)]);
  rows.push(["Total credit card limits (full limits)", "", "", "", "", "", totalLimits.toFixed(2)]);
  rows.push(["Total monthly repayments (share)", "", "", "", "", "", "", totalMonthly.toFixed(2)]);

  return toCsv(rows);
}

async function taxSummaryCsv(entityId: string, financialYearId: string | undefined): Promise<string> {
  const records = await prisma.taxRecord.findMany({
    where: { entityId, ...(financialYearId ? { financialYearId } : {}) },
    include: { financialYear: true },
    orderBy: { createdAt: "desc" },
  });
  const rows: string[][] = [["Financial Year", "Type", "Description", "Amount", "Status"]];
  for (const r of records) {
    rows.push([r.financialYear.label, r.recordType, r.description, String(r.amount ?? ""), r.status]);
  }
  return toCsv(rows);
}

async function incomeSummaryCsv(entityId: string, financialYearId: string | undefined): Promise<string> {
  const personIds = await connectedPersonIds(entityId);
  const people = await prisma.person.findMany({ where: { id: { in: personIds } } });
  let fyBounds: { startDate: Date; endDate: Date } | null = null;
  if (financialYearId) fyBounds = await prisma.financialYear.findUnique({ where: { id: financialYearId } });

  const rows: string[][] = [["Person", "Period Start", "Period End", "Status", "Amount", "Document"]];
  for (const person of people) {
    const entries = await prisma.payPeriodEntry.findMany({
      where: {
        personId: person.id,
        ...(fyBounds ? { periodStart: { gte: fyBounds.startDate, lte: fyBounds.endDate } } : {}),
      },
      include: { document: true },
      orderBy: { periodStart: "asc" },
    });
    for (const e of entries) {
      rows.push([
        person.name,
        e.periodStart.toISOString().slice(0, 10),
        e.periodEnd.toISOString().slice(0, 10),
        e.status,
        String(e.amount ?? ""),
        e.document?.originalFilename ?? "",
      ]);
    }
  }
  return toCsv(rows);
}

const PAY_FREQUENCY_LABELS: Record<string, string> = { WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly", MONTHLY: "Monthly" };
const PREMIUM_FREQUENCY_LABELS: Record<string, string> = { MONTHLY: "a month", QUARTERLY: "a quarter", ANNUALLY: "a year" };
const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const fmtMoney = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toFixed(2));

/**
 * A broker's "fact find" laid out with the same broad sections every
 * Australian lender's version asks for — filled in from your own records
 * where Financial Vault holds it, left blank where it's a one-off answer
 * for this particular application (loan purpose, the responsible-lending
 * questions, what you'd like help with) or something the app doesn't track
 * (employer details, a forward expense budget). Never includes an
 * encrypted number (TFN, ID, account or policy number) — those stay in the
 * app; attach the ID/document chips instead if a scan is wanted.
 */
export async function factFindCsv(entityId: string): Promise<string> {
  const personIds = await connectedPersonIds(entityId);
  const people = await prisma.person.findMany({
    where: { id: { in: personIds } },
    include: {
      familyFrom: { include: { toPerson: { select: { id: true, name: true } } } },
      familyTo: { include: { fromPerson: { select: { id: true, name: true } } } },
      identityRecords: true,
    },
    orderBy: { name: "asc" },
  });

  const rows: string[][] = [["Field", "Value"]];
  const section = (title: string) => {
    rows.push([]);
    rows.push([title]);
  };

  section("PERSONAL & CONTACT DETAILS");
  if (people.length === 0) rows.push(["No one linked to this entity yet", ""]);
  for (const p of people) {
    rows.push([`${p.name} — Date of birth`, fmtDate(p.dateOfBirth)]);
    rows.push([`${p.name} — Marital status`, p.maritalStatus ? (MARITAL_STATUS_LABELS[p.maritalStatus] ?? p.maritalStatus) : ""]);
    rows.push([`${p.name} — Phone`, p.phone ?? ""]);
    rows.push([`${p.name} — Email`, p.email ?? ""]);
    rows.push([`${p.name} — Current address`, p.currentAddress ?? ""]);
    rows.push([`${p.name} — Previous address (if under 3 years)`, p.previousAddress ?? ""]);
  }

  section("FAMILY");
  for (const p of people) {
    const partner = p.familyFrom.find((r) => r.relationshipType === "PARTNER")?.toPerson.name ?? p.familyTo.find((r) => r.relationshipType === "PARTNER")?.fromPerson.name;
    const children = p.familyFrom.filter((r) => r.relationshipType === "PARENT").map((r) => r.toPerson.name);
    rows.push([`${p.name} — Partner`, partner ?? ""]);
    rows.push([`${p.name} — Children`, children.join(", ")]);
    const kin = [p.nextOfKinName, p.nextOfKinRelationship, p.nextOfKinPhone, p.nextOfKinAddress].filter(Boolean).join(" · ");
    rows.push([`${p.name} — Next of kin`, kin]);
  }

  section("IDENTIFICATION");
  let anyId = false;
  for (const p of people) {
    for (const r of p.identityRecords) {
      anyId = true;
      const detail = [r.issuer, r.expiryDate ? `expires ${fmtDate(r.expiryDate)}` : null].filter(Boolean).join(" — ");
      rows.push([`${p.name} — ${IDENTITY_KIND_LABELS[r.kind] ?? "ID"}`, detail]);
    }
  }
  if (!anyId) rows.push(["No ID or cover recorded", ""]);
  rows.push(["Numbers and scans", "Numbers are kept encrypted and left out of this summary — tick the ID documents chip to attach the scans."]);

  section("EMPLOYMENT & INCOME");
  for (const p of people) {
    rows.push([`${p.name} — Pay frequency`, p.payFrequency ? (PAY_FREQUENCY_LABELS[p.payFrequency] ?? p.payFrequency) : "Not tracked"]);
  }
  rows.push(["Employer, role and income breakdown", "Not tracked in Financial Vault — fill in by hand. If the Income Summary chip is ticked, payslip totals are in that file."]);

  section("MONTHLY EXPENSES");
  rows.push(["Note", "The figures below are your actual average spending by category over the last 12 months, from bank transactions — most fact finds want your own forward estimate of ongoing costs, so use this as a reference, not a substitute."]);
  const cashflow = await incomeAndSpending({ months: 12, entityId });
  if (cashflow.monthsCovered === 0) {
    rows.push(["No bank transactions on record", ""]);
  } else {
    for (const c of cashflow.byCategory.filter((c) => c.moneyOut > 0)) {
      rows.push([`${c.name} — average per month`, fmtMoney(c.moneyOut / cashflow.monthsCovered)]);
    }
    rows.push(["All categories — average money out per month", fmtMoney(cashflow.averageMonthlyOut)]);
    rows.push(["All categories — average money in per month", fmtMoney(cashflow.averageMonthlyIn)]);
  }

  section("ASSETS & LIABILITIES (TOP LINE)");
  const b = await computeLiveBreakdown(entityId, { lookThrough: true });
  rows.push(["Property", fmtMoney(b.propertyValue)]);
  rows.push(["Vehicles", fmtMoney(b.vehicleValue)]);
  rows.push(["Investments", fmtMoney(b.investmentValue)]);
  rows.push(["Super", fmtMoney(b.superValue)]);
  rows.push(["Cash (bank accounts)", fmtMoney(b.cash)]);
  rows.push(["Other assets", fmtMoney(b.otherAssets)]);
  rows.push(["Total assets", fmtMoney(b.totalAssets)]);
  rows.push(["Mortgages", fmtMoney(b.mortgages)]);
  rows.push(["Credit cards", fmtMoney(b.creditCards)]);
  rows.push(["Personal loans", fmtMoney(b.personalLoans)]);
  rows.push(["Vehicle loans", fmtMoney(b.vehicleLoans)]);
  rows.push(["Other liabilities", fmtMoney(b.otherLiabilities)]);
  rows.push(["Total liabilities", fmtMoney(b.totalLiabilities)]);
  rows.push(["Net position", fmtMoney(b.netPosition)]);
  rows.push(["Full breakdown", "See the attached Assets & Liabilities Statement for each property, loan, account and its ownership share."]);

  section("INSURANCE");
  const policies = await prisma.insurancePolicy.findMany({
    where: {
      OR: [
        { entityId },
        { personId: { in: personIds } },
        { asset: { OR: [{ entityId }, { ownerships: { some: { ownerEntityId: entityId } } }] } },
      ],
    },
    include: { asset: { select: { name: true } }, person: { select: { name: true } }, entity: { select: { name: true } } },
    orderBy: { kind: "asc" },
  });
  if (policies.length === 0) rows.push(["No insurance recorded", ""]);
  for (const p of policies) {
    const covers = p.asset?.name ?? p.person?.name ?? p.entity?.name ?? "";
    const premium = p.premium !== null ? `${fmtMoney(p.premium)} ${PREMIUM_FREQUENCY_LABELS[p.premiumFrequency ?? "ANNUALLY"] ?? ""}` : "";
    const detail = [
      covers ? `covers ${covers}` : null,
      p.coverAmount ? `cover ${fmtMoney(p.coverAmount)}` : null,
      premium ? `premium ${premium}` : null,
      p.renewalDate ? `renews ${fmtDate(p.renewalDate)}` : null,
      p.heldInSuper ? "held in super" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    rows.push([`${policyKindLabel(p.kind)} — ${p.insurer ?? "insurer not recorded"}`, detail]);
  }

  section("PROFESSIONAL ADVISERS");
  const advisers = await prisma.adviser.findMany({ orderBy: { kind: "asc" } });
  if (advisers.length === 0) rows.push(["No advisers recorded", "Fill in by hand if you'd like your broker to liaise with your accountant or solicitor."]);
  for (const a of advisers) {
    const detail = [a.firm, [a.contactFirstName, a.contactSurname].filter(Boolean).join(" "), a.phone, a.email].filter(Boolean).join(" · ");
    rows.push([ADVISER_KINDS[a.kind] ?? a.kind, detail]);
  }

  section("LOAN OBJECTIVES & FEATURES (for this application)");
  rows.push(["Purpose of this loan", ""]);
  rows.push(["Preferred loan features (offset, redraw, fixed/variable, interest only, etc.)", ""]);
  rows.push(["Preferred lenders / lenders to avoid", ""]);

  section("YOUR FINANCIAL POSITION (for this application)");
  rows.push(["Any financial judgments or legal proceedings against you?", ""]);
  rows.push(["Any difficulty meeting financial commitments in the past two years?", ""]);
  rows.push(["Are any existing debts currently in arrears?", ""]);
  rows.push(["Concerned about rising interest rates?", ""]);
  rows.push(["Expecting any changes to your financial situation that could affect repayments?", ""]);

  section("WHAT YOU'D LIKE HELP WITH (optional)");
  rows.push(["Areas of interest — insurance, debt/budgeting, super, investment, life events, home & property, health, estate planning, financial structures, retirement, other", ""]);

  rows.push([]);
  rows.push([`Generated by Financial Vault on ${fmtDate(new Date())}. Blank fields are for you to fill in by hand for this application.`]);

  return toCsv(rows);
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

documentPacksRouter.get(
  "/preview",
  asyncHandler(async (req, res) => {
    const entityId = String(req.query.entityId || "");
    const financialYearId = req.query.financialYearId ? String(req.query.financialYearId) : undefined;
    if (!entityId) {
      res.status(400).json({ error: "entityId is required" });
      return;
    }

    const categories: { key: string; label: string; count: number }[] = await Promise.all(
      DOCUMENT_CATEGORIES.map(async (category) => ({
        key: category,
        label: category,
        count: (await documentsForCategory(entityId, financialYearId, category)).length,
      }))
    );
    const income = await incomeDocuments(entityId, financialYearId);
    categories.push({ key: "Income", label: "Income (payslips & PAYG)", count: income.length });
    categories.push({ key: "ID", label: "ID documents (licence, Medicare, passport…)", count: (await idDocuments(entityId)).length });

    const [assetCount, liabilityCount, accountCount, taxRecordCount] = await Promise.all([
      prisma.asset.count({ where: { entityId, parentAssetId: null } }),
      prisma.liability.count({ where: { entityId } }),
      prisma.account.count({ where: { entityId } }),
      prisma.taxRecord.count({ where: { entityId, ...(financialYearId ? { financialYearId } : {}) } }),
    ]);

    const generated = [
      { key: "ASSETS_LIABILITIES", label: "Assets & Liabilities Statement", count: assetCount + liabilityCount + accountCount },
      { key: "TAX_SUMMARY", label: "Tax Summary", count: taxRecordCount },
      { key: "INCOME_SUMMARY", label: "Income Summary", count: income.length },
      { key: "FACT_FIND", label: "Fact Find (for a broker)", count: 1 },
    ];

    res.json({ categories, generated });
  })
);

documentPacksRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const entityId = String(req.body.entityId || "");
    const financialYearId = req.body.financialYearId ? String(req.body.financialYearId) : undefined;
    const categories: string[] = Array.isArray(req.body.categories) ? req.body.categories : [];
    const generated: string[] = Array.isArray(req.body.generated) ? req.body.generated : [];

    if (!entityId) {
      res.status(400).json({ error: "entityId is required" });
      return;
    }
    const entity = await prisma.entity.findUnique({ where: { id: entityId } });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }

    const documentsById = new Map<string, Awaited<ReturnType<typeof documentsForCategory>>[number]>();
    for (const category of categories) {
      if (category === "Income") {
        for (const d of await incomeDocuments(entityId, financialYearId)) documentsById.set(d.id, d);
        continue;
      }
      if (category === "ID") {
        for (const d of await idDocuments(entityId)) documentsById.set(d.id, d);
        continue;
      }
      if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) continue;
      for (const d of await documentsForCategory(entityId, financialYearId, category)) documentsById.set(d.id, d);
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${entity.name.replace(/[^a-z0-9]+/gi, "_")}_pack.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: ArchiverError) => {
      throw err;
    });
    archive.pipe(res);

    const indexRows: string[][] = [["Document", "Type", "Entity", "Date", "Financial Year", "Source"]];
    for (const doc of documentsById.values()) {
      let bytes: Buffer | null = null;
      try {
        bytes = await readDocumentFile(doc.filePath);
      } catch {
        // A file missing from the documents folder is listed, not fatal.
      }
      if (bytes) archive.append(bytes, { name: `documents/${doc.originalFilename}` });
      const fy = doc.financialYearId ? (await prisma.financialYear.findUnique({ where: { id: doc.financialYearId } }))?.label : "";
      indexRows.push([bytes ? doc.originalFilename : `${doc.originalFilename} (file missing)`, doc.documentType ?? "", entity.name, doc.documentDate?.toISOString().slice(0, 10) ?? "", fy ?? "", doc.source]);
    }
    archive.append(toCsv(indexRows), { name: "document_index.csv" });

    if (generated.includes("ASSETS_LIABILITIES")) {
      archive.append(await assetsLiabilitiesCsv(entityId), { name: "assets_and_liabilities_statement.csv" });
    }
    if (generated.includes("TAX_SUMMARY")) {
      archive.append(await taxSummaryCsv(entityId, financialYearId), { name: "tax_summary.csv" });
    }
    if (generated.includes("INCOME_SUMMARY")) {
      archive.append(await incomeSummaryCsv(entityId, financialYearId), { name: "income_summary.csv" });
    }
    if (generated.includes("FACT_FIND")) {
      archive.append(await factFindCsv(entityId), { name: "fact_find.csv" });
    }

    await archive.finalize();
  })
);
