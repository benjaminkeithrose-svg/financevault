import { Router } from "express";
import { ZipArchive, ArchiverError } from "archiver";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { DOCUMENT_TYPES } from "../services/documentTypes.js";
import { describeVehicle, monthlyRepayment } from "../services/debts.js";

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
const GENERATED_SUMMARIES = ["ASSETS_LIABILITIES", "TAX_SUMMARY", "INCOME_SUMMARY"] as const;

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
  const [assets, liabilities, accounts] = await Promise.all([
    prisma.asset.findMany({ where: { entityId, parentAssetId: null } }),
    prisma.liability.findMany({
      where: { entityId },
      include: { securityProperty: true, securityCommercialProperty: true, securityAsset: true },
    }),
    prisma.account.findMany({ where: { entityId } }),
  ]);

  // Laid out the way a broker's assets-and-liabilities form asks for it:
  // card limits and monthly repayments matter as much as balances.
  const rows: string[][] = [["Type", "Name", "Value/Balance", "Detail", "Credit limit", "Monthly repayment", "Secured by / for"]];
  for (const a of assets) {
    const detail = a.assetType === "VEHICLE" ? `${a.vehicleType ?? "VEHICLE"}: ${describeVehicle(a)}` : a.assetType;
    rows.push(["Asset", a.name, String(a.currentValue ?? ""), detail, "", "", ""]);
  }
  for (const acc of accounts) {
    rows.push(["Bank Account", `${acc.institution} ${acc.accountName}`, String(acc.currentBalance ?? ""), acc.accountType, "", "", ""]);
  }
  for (const l of liabilities) {
    const monthly = monthlyRepayment(l);
    const securedBy =
      l.securityProperty?.address ?? l.securityCommercialProperty?.name ?? (l.securityAsset ? describeVehicle(l.securityAsset) : "");
    rows.push([
      "Liability",
      l.name,
      String(l.currentBalance ?? ""),
      [l.liabilityType, l.lender].filter(Boolean).join(" — "),
      l.creditLimit !== null ? String(l.creditLimit) : "",
      monthly !== null ? monthly.toFixed(2) : "",
      securedBy,
    ]);
  }

  const totalAssets = assets.reduce((s, a) => s + (a.currentValue ?? 0), 0) + accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
  const totalLimits = liabilities.reduce((s, l) => s + (l.liabilityType === "CREDIT_CARD" ? l.creditLimit ?? 0 : 0), 0);
  const totalMonthly = liabilities.reduce((s, l) => s + (monthlyRepayment(l) ?? 0), 0);
  rows.push([]);
  rows.push(["Total assets", "", String(totalAssets), ""]);
  rows.push(["Total liabilities", "", String(totalLiabilities), ""]);
  rows.push(["Net position", "", String(totalAssets - totalLiabilities), ""]);
  rows.push(["Total credit card limits", "", "", "", String(totalLimits)]);
  rows.push(["Total monthly repayments", "", "", "", "", totalMonthly.toFixed(2)]);

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
      archive.file(doc.filePath, { name: `documents/${doc.originalFilename}` });
      const fy = doc.financialYearId ? (await prisma.financialYear.findUnique({ where: { id: doc.financialYearId } }))?.label : "";
      indexRows.push([doc.originalFilename, doc.documentType ?? "", entity.name, doc.documentDate?.toISOString().slice(0, 10) ?? "", fy ?? "", doc.source]);
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

    await archive.finalize();
  })
);
