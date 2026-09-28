import { prismaAll } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { esc, VAULT_MARK } from "../routes/documentPacks.js";
import { assess, type AssessmentColumn } from "./assessment.js";
import { usableEquity } from "./debtAllocation.js";
import { dueDiligence } from "./dueDiligence.js";
import { purchaseSteps } from "./purchaseSteps.js";
import { isTaxReference } from "./taxReference.js";

/**
 * Packs for the professionals you'll talk to about a property you're
 * considering — broker, accountant, solicitor or conveyancer — and a due
 * diligence summary. Each is a summary made from what's already recorded
 * (the assessment, the checks, the buying steps) plus your questions for
 * them, and the documents you choose. They help you prepare; they don't
 * replace the advice.
 */

export const PACK_TYPES = {
  broker: { title: "Broker pack", who: "broker" },
  accountant: { title: "Accountant pack", who: "accountant" },
  solicitor: { title: "Solicitor or conveyancer pack", who: "solicitor or conveyancer" },
  "due-diligence": { title: "Due diligence summary", who: "adviser" },
} as const;
export type PackType = keyof typeof PACK_TYPES;

export interface PackSection {
  title: string;
  rows?: Array<[string, string]>;
  lines?: string[];
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-AU")}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`);
const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }) : "—";

const STATUS: Record<string, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", DONE: "Done", NA: "Not applicable" };
const KINDS: Record<string, string> = {
  HOUSE: "House",
  UNIT: "Unit or apartment",
  TOWNHOUSE: "Townhouse or villa",
  LAND: "Vacant land",
  OTHER: "Other",
};
const TITLES: Record<string, string> = { TORRENS: "Torrens", STRATA: "Strata", COMMUNITY: "Community title" };

export async function packQuestions(assetId: string, type: PackType): Promise<string> {
  const row = await prismaAll.dueDiligenceCheck.findUnique({ where: { assetId_key: { assetId, key: `note:${type}` } } });
  return row?.findings ?? "";
}

export async function saveQuestions(assetId: string, type: PackType, text: string) {
  await prismaAll.dueDiligenceCheck.upsert({
    where: { assetId_key: { assetId, key: `note:${type}` } },
    create: { assetId, key: `note:${type}`, kind: "NOTE", findings: text },
    update: { findings: text },
  });
}

/** The property's own documents (its due diligence evidence is linked to it too) — never identity documents or rulings. */
export async function packDocuments(assetId: string) {
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId }, include: { property: true, commercialProperty: true } });
  if (!asset) throw new HttpError(404, "Property not found");
  const target = asset.property
    ? { targetType: "PROPERTY", targetId: asset.property.id }
    : { targetType: "COMMERCIAL_PROPERTY", targetId: asset.commercialProperty!.id };
  const links = await prismaAll.documentLink.findMany({
    where: target,
    include: { document: { include: { links: { select: { targetType: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  return links
    .map((l) => l.document)
    .filter(
      (d) =>
        !d.links.some((x) => x.targetType === "IDENTITY_RECORD") && !isTaxReference(d.documentType) && !seen.has(d.id) && seen.add(d.id),
    )
    .map((d) => ({ id: d.id, name: d.originalFilename, type: d.documentType, date: d.documentDate, filePath: d.filePath }));
}

export async function packData(assetId: string, type: PackType) {
  if (!(type in PACK_TYPES)) throw new HttpError(404, "No such pack.");
  const asset = await prismaAll.asset.findUnique({
    where: { id: assetId },
    include: {
      property: true,
      commercialProperty: { include: { tenancies: true } },
      entity: true,
      ownerships: { include: { ownerEntity: true } },
    },
  });
  if (!asset || (!asset.property && !asset.commercialProperty)) throw new HttpError(404, "Property not found");
  const [a, dd, steps, questions] = await Promise.all([
    assess(assetId),
    dueDiligence(assetId),
    purchaseSteps(assetId),
    packQuestions(assetId, type),
  ]);
  if (!a) throw new HttpError(404, "Property not found");
  const p = asset.property;
  const c = asset.commercialProperty;
  const address = p?.address ?? c?.address ?? asset.name;
  const owners = asset.ownerships.length
    ? asset.ownerships.map((o) => `${o.ownerEntity.name} ${o.ownershipPercent}%`).join(", ")
    : asset.entity.name;
  const e = a.columns[0];
  const shown = a.columns.filter((col) => col.shown);

  const property: PackSection = {
    title: "The property",
    rows: [
      ["Address", address],
      ["Kind", c ? "Commercial" : (KINDS[p?.kind ?? ""] ?? "—")],
      ["Title", TITLES[p?.titleType ?? c?.titleType ?? ""] ?? "—"],
      ["Who'd buy it", owners],
      ["Asking price", money(asset.askingPrice)],
      ["Where it's up to", steps.stage.charAt(0) + steps.stage.slice(1).toLowerCase().replace("contract", "under contract")],
    ],
  };
  const purchase: PackSection = {
    title: "Buying it",
    rows: [
      [a.priceIsAsking ? "Price (the asking price)" : "Price", money(a.price)],
      [a.purchase.dutyEstimated ? "Stamp duty (NSW estimate)" : "Stamp duty", money(a.purchase.stampDuty)],
      ["Other buying costs", money(a.purchase.otherCosts)],
      ...(a.purchase.openIssueCosts ? ([["Costs of problems found", money(a.purchase.openIssueCosts)]] as Array<[string, string]>) : []),
      ["Cash needed", money(a.purchase.cashNeeded)],
      ["Loan", money(a.purchase.loan)],
      ["LVR", a.purchase.lvr !== null ? `${a.purchase.lvr}%` : "—"],
      ["Repayments", a.purchase.repaymentType === "PI" ? `Principal and interest over ${a.purchase.loanTermYears} years` : "Interest only"],
    ],
  };
  const columnsRows = (label: string, f: (col: AssessmentColumn) => string) =>
    [label + ": " + shown.map((col) => `${col.label} ${f(col)}`).join(" · ")] as string[];
  const numbers: PackSection = {
    title: "The numbers (expected, conservative, bad case)",
    lines: [
      ...columnsRows("Rent a year", (col) => money(col.inputs.rent)),
      ...columnsRows("Weeks empty", (col) => String(col.inputs.vacancyWeeks)),
      ...columnsRows("Running costs a year", (col) => money(col.inputs.costs)),
      ...columnsRows("Interest rate", (col) => (col.inputs.ratePercent !== null ? `${col.inputs.ratePercent}%` : "—")),
      ...columnsRows("Gross yield", (col) => pct(col.figures.grossYield)),
      ...columnsRows("Net yield", (col) => pct(col.figures.netYield)),
      ...columnsRows("Cash a year before tax", (col) => money(col.figures.cashBeforeTax)),
      ...columnsRows("Cash a year after tax", (col) => money(col.figures.cashAfterTax)),
      ...(c && a.advertisedYield !== null
        ? [`Advertised yield ${pct(a.advertisedYield)}; the yield the leases and outgoings support ${pct(a.supportedYield)}`]
        : []),
    ],
  };
  const questionsSection: PackSection = {
    title: `Questions for the ${PACK_TYPES[type].who}`,
    lines: questions.trim() ? questions.trim().split(/\n+/) : ["(none written yet)"],
  };
  const openIssues: PackSection = {
    title: "Problems found",
    lines: dd.openIssues.length
      ? dd.openIssues.map((i) => `${i.label}${i.cost ? ` — about ${money(i.cost)}` : ""}${i.findings ? `: ${i.findings}` : ""}`)
      : ["None open."],
  };
  const stepLines = steps.steps
    .filter((s) => s.doneAt || s.date || s.amount)
    .map(
      (s) =>
        `${s.label}${s.amount ? ` — ${money(s.amount)}` : ""}${s.date ? ` — ${date(s.date)}` : ""}${s.doneAt ? ` (done ${date(s.doneAt)})` : ""}`,
    );
  const checksIn = (names: RegExp) =>
    dd.groups
      .filter((g) => names.test(g.name))
      .flatMap((g) =>
        g.checks
          .filter((ch) => ch.status !== "NOT_STARTED" || ch.findings)
          .map(
            (ch) => `${g.name} — ${ch.label}: ${STATUS[ch.status]}${ch.checked ? ", checked" : ""}${ch.findings ? `. ${ch.findings}` : ""}`,
          ),
      );

  const sections: PackSection[] = [property];
  if (type === "broker") {
    // Equity in what the buyers already own, as a lender might see it.
    const ownerIds = [asset.entityId, ...asset.ownerships.map((o) => o.ownerEntityId)];
    const owned = await prismaAll.asset.findMany({
      where: {
        status: "OWNED",
        disposalDate: null,
        assetType: { in: ["PROPERTY", "COMMERCIAL_PROPERTY"] },
        OR: [{ entityId: { in: ownerIds } }, { ownerships: { some: { ownerEntityId: { in: ownerIds } } } }],
      },
      include: {
        property: { include: { liabilities: { where: { counted: true } } } },
        commercialProperty: { include: { loans: { where: { counted: true } } } },
      },
    });
    const equity = owned
      .map((o) => {
        const owing = [...(o.property?.liabilities ?? []), ...(o.commercialProperty?.loans ?? [])].reduce(
          (s, l) => s + (l.currentBalance ?? 0),
          0,
        );
        const u = usableEquity(o.currentValue, o.lenderMaxLvr, owing);
        return u ? `${o.name}: worth ${money(u.value)}, owing ${money(owing)}, usable equity about ${money(u.usable)}` : null;
      })
      .filter((x): x is string => !!x);
    sections.push(purchase, numbers);
    sections.push({ title: "Equity in what they own", lines: equity.length ? equity : ["No other property recorded."] });
    if (a.borrowing) {
      sections.push({
        title: "Can we borrow it? (the app's estimate)",
        lines: [
          `Backed by ${a.borrowing.people.join(", ") || "—"}. A lender might lend ${money(a.borrowing.capacity[0])} to ${money(a.borrowing.capacity[1])} more. ${a.borrowing.reason ?? ""}`,
          ...a.borrowing.notes,
        ],
      });
    }
  }
  if (type === "accountant") {
    sections.push(purchase, numbers);
    sections.push({
      title: "Tax",
      rows: [
        ["Who'd own it", owners],
        ["Why that owner", asset.ownershipReason ?? "—"],
        ["Tax result a year (expected)", money(e.figures.taxResult)],
        ["Tax effect a year (− saved)", money(e.figures.taxEffect)],
        ["Depreciation a year (schedule)", money(asset.depreciationPerYear)],
        ["Building write-off a year", money(asset.capitalWorksPerYear)],
        ["Running costs used", a.expectedFrom.costBreakdown.map((b) => `${b.label} ${money(b.amount)}`).join(", ") || "—"],
      ],
      lines: [...(c ? checksIn(/Income, costs/) : []), ...a.notes],
    });
  }
  if (type === "solicitor") {
    sections.push({ title: "The contract and settlement", lines: stepLines.length ? stepLines : ["Nothing recorded yet."] });
    const legal = checksIn(/Title|Legal|Contract|Strata|Community/);
    sections.push({ title: "Title, planning and contract checks", lines: legal.length ? legal : ["None recorded yet."] });
    if (c) {
      sections.push({
        title: "Leases",
        lines: c.tenancies.length
          ? c.tenancies.map(
              (t) =>
                `${t.tenantName ?? "Tenant"}${t.rentPerAnnum ? ` — ${money(t.rentPerAnnum)} a year` : ""}${t.leaseExpiry ? `, ends ${date(t.leaseExpiry)}` : ""}`,
            )
          : ["None recorded."],
      });
    }
    sections.push(openIssues);
  }
  if (type === "due-diligence") {
    sections.push({ title: "Checks", lines: [`${dd.totals.done} of ${dd.totals.total} done.`] });
    for (const g of dd.groups) {
      sections.push({
        title: `${g.name} — ${g.done} of ${g.total} done`,
        lines: g.checks.map(
          (ch) =>
            `${ch.label}: ${STATUS[ch.status]}${ch.checked ? ", checked" : ""}${ch.problem && !ch.resolvedAt ? ", PROBLEM" : ""}${ch.findings ? `. ${ch.findings}` : ""}`,
        ),
      });
    }
    sections.push(openIssues);
    if (dd.resolvedIssues.length)
      sections.push({ title: "Resolved", lines: dd.resolvedIssues.map((i) => `${i.label}${i.resolution ? ` — ${i.resolution}` : ""}`) });
    if (dd.development.length)
      sections.push({
        title: "Development ideas",
        lines: dd.development.map((d) => `${d.label} — ${d.approved ? "approved (see documents)" : "NOT APPROVED"}`),
      });
    sections.push(numbers);
  }
  if (type === "broker" || type === "accountant") sections.push(openIssues);
  sections.push(questionsSection);

  return {
    type,
    title: `${PACK_TYPES[type].title} — ${address}`,
    address,
    route: p ? `/properties/${p.id}` : `/commercial-properties/${c!.id}`,
    prepared: new Date().toISOString(),
    disclaimer: `Prepared from the buyer's own records to help talk it through with your ${PACK_TYPES[type].who}. It's an estimate, not advice, and doesn't replace it.`,
    sections,
    questions,
    documents: (await packDocuments(assetId)).map(({ filePath: _f, ...d }) => d),
  };
}

export type PackData = Awaited<ReturnType<typeof packData>>;

/** The pack's summary as a page that opens in any browser — the first file in the ZIP. */
export function packSummaryHtml(pack: PackData, documents: Array<{ name: string; type: string | null; date: Date | string | null }>) {
  const section = (sec: PackSection) =>
    `<h2>${esc(sec.title)}</h2>` +
    (sec.rows
      ? `<table><tbody>${sec.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`
      : "") +
    (sec.lines ? `<ul>${sec.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "");
  const docs = documents.length
    ? `<ul>${documents.map((d) => `<li>${esc(d.name)}${d.type ? ` — ${esc(d.type)}` : ""}${d.date ? ` (${esc(date(d.date))})` : ""}</li>`).join("")}</ul><p class="note">In the <em>documents</em> folder. The same list is in document_index.csv.</p>`
    : "<p>No documents chosen.</p>";
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pack.title)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1c2130;line-height:1.5}
header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1E1B4B;padding-bottom:12px;margin-bottom:20px}
header strong{font-size:22px}header span{display:block;color:#555;font-size:14px}
h2{font-size:17px;margin:22px 0 6px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}
th{width:40%;font-weight:600;color:#333}ul{padding-left:20px;font-size:14px}.note{color:#555;font-size:13px}
.disclaimer{border:1px solid #ccc;border-radius:6px;padding:10px 12px;font-size:13px;color:#333;margin-top:24px}
</style></head><body>
<header>${VAULT_MARK}<div><strong>${esc(pack.title)}</strong><span>Prepared ${esc(date(pack.prepared))} with Financial Vault</span></div></header>
${pack.sections.map(section).join("\n")}
<h2>Documents (${documents.length})</h2>
${docs}
<p class="disclaimer">${esc(pack.disclaimer)}</p>
</body></html>
`;
}
