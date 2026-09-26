import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { dataFolder } from "./appInfo.js";
import { readDocumentFile } from "./documentFiles.js";
import { hasDataKey } from "./fieldCrypto.js";
import { financialYearLabelForDate } from "./financialYear.js";
import { TAX_REFERENCE_TYPE } from "./taxReference.js";

/**
 * Readable copies of the vault's documents, in ordinary folders that follow
 * the asset tree — for backing up with OneDrive and for checking by hand:
 *
 *   Alex Example / Properties / 5 Rent St / 2025-26 / Rental Statement – 31 Jul 2025.pdf
 *   Alex Example / Properties / 5 Rent St / Loan – CBA home loan / 2025-26 / …
 *   Example Family Trust / 2025-26 / …
 *   Tax references / …
 *   Not filed yet / …
 *
 * The vault's own encrypted files stay the originals; these are copies, not
 * encrypted, kept in step as documents are added, linked, renamed or
 * deleted (archived). Identity documents (passport, licence, Medicare…) are never
 * copied. Only files Financial Vault wrote are ever changed or removed —
 * anything you put in the folder yourself is left alone. Each folder has an
 * _Index.csv, and each day a copy of the records goes in "Records backups".
 */

export const DEFAULT_FOLDER_NAME = "Readable documents";
const MANIFEST = ".financial-vault-copies.json";
const INDEX = "_Index.csv";
const RECORDS = "Records backups";
const KEEP_RECORD_BACKUPS = 7;

/** Where the readable copies go: the folder chosen in Settings, or the data folder's own. */
export async function mirrorFolder(): Promise<{ folder: string | null; enabled: boolean; custom: boolean }> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const data = dataFolder();
  const folder = s?.mirrorDir ?? (data ? path.join(data, DEFAULT_FOLDER_NAME) : null);
  return { folder, enabled: (s?.mirrorEnabled ?? true) && !!folder, custom: !!s?.mirrorDir };
}

// ---------------------------------------------------------------------------
// Names and places
// ---------------------------------------------------------------------------

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A name that's safe as a file or folder name on Windows, Mac and OneDrive. */
export function safeName(name: string, max = 80): string {
  let s = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (s.length > max) s = s.slice(0, max).trim().replace(/[. ]+$/, "");
  if (!s) s = "Untitled";
  if (WINDOWS_RESERVED.test(s)) s = `${s}_`;
  return s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const ASSET_GROUPS: Record<string, string> = {
  PROPERTY: "Properties",
  COMMERCIAL_PROPERTY: "Commercial properties",
  VEHICLE: "Vehicles & boats",
  SUPERANNUATION: "Super",
  SHARES: "Investments",
  MANAGED_FUND: "Investments",
};

const MIME_EXT: Record<string, string> = { "application/pdf": ".pdf", "text/plain": ".txt", "image/jpeg": ".jpg", "image/png": ".png" };

export interface Placement {
  rel: string; // path inside the folder, with "/" separators
  documentId: string;
  filePath: string;
  fileHash: string;
  documentType: string | null;
  date: string | null;
  fyLabel: string | null;
  originalFilename: string;
  uploadDate: string;
}

/** Where every document belongs in the readable folder (a document linked to two things is in both). */
export async function planCopies(): Promise<Placement[]> {
  const [entities, people, assets, loans, accounts, investments, policies, estate, maintenance, tenancies, identity, purposes, interest, deductions, statements, documents] =
    await Promise.all([
      prisma.entity.findMany({ select: { id: true, name: true } }),
      prisma.person.findMany({ select: { id: true, name: true, entityId: true } }),
      prisma.asset.findMany({ select: { id: true, name: true, assetType: true, entityId: true, parentAssetId: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } } }),
      prisma.liability.findMany({ select: { id: true, name: true, entityId: true, securityPropertyId: true, securityCommercialPropertyId: true, securityAssetId: true } }),
      prisma.account.findMany({ select: { id: true, institution: true, accountName: true, entityId: true } }),
      prisma.investmentAccount.findMany({ select: { id: true, institution: true, accountType: true, entityId: true } }),
      prisma.insurancePolicy.findMany({ select: { id: true, kind: true, assetId: true, personId: true, entityId: true } }),
      prisma.estateDocument.findMany({ select: { id: true, personId: true } }),
      prisma.maintenanceRecord.findMany({ select: { id: true, assetId: true } }),
      prisma.tenancy.findMany({ select: { id: true, tenantName: true, commercialProperty: { select: { assetId: true } } } }),
      prisma.identityRecord.findMany({ select: { id: true } }),
      prisma.loanPurpose.findMany({ where: { documentId: { not: null } }, select: { documentId: true, liabilityId: true } }),
      prisma.loanInterestYear.findMany({ where: { documentId: { not: null } }, select: { documentId: true, liabilityId: true, fyLabel: true } }),
      prisma.workDeduction.findMany({ where: { documentId: { not: null } }, select: { documentId: true, personId: true, fyLabel: true } }),
      prisma.incomeStatement.findMany({ where: { documentId: { not: null } }, select: { documentId: true, personId: true, fyLabel: true } }),
      prisma.document.findMany({
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          filePath: true,
          fileHash: true,
          documentType: true,
          documentDate: true,
          uploadDate: true,
          entityId: true,
          supersededAt: true,
          reviewStatus: true,
          financialYear: { select: { label: true } },
          links: { select: { targetType: true, targetId: true } },
        },
      }),
    ]);

  const personByEntity = new Map(people.filter((p) => p.entityId).map((p) => [p.entityId!, p]));
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetByProperty = new Map(assets.filter((a) => a.property).map((a) => [a.property!.id, a]));
  const assetByCommercial = new Map(assets.filter((a) => a.commercialProperty).map((a) => [a.commercialProperty!.id, a]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const identityIds = new Set(identity.map((i) => i.id));

  /** A person's own things are under their name; a trust's or company's under its name. */
  const owner = (entityId: string) => safeName(personByEntity.get(entityId)?.name ?? entityName.get(entityId) ?? "Unknown owner");
  const assetPath = (id: string, depth = 0): string[] | null => {
    const a = assetById.get(id);
    if (!a || depth > 5) return null;
    if (a.parentAssetId) {
      const parent = assetPath(a.parentAssetId, depth + 1);
      if (parent) return [...parent, safeName(a.name)];
    }
    return [owner(a.entityId), ASSET_GROUPS[a.assetType] ?? "Other assets", safeName(a.name)];
  };
  const loanPath = (id: string): string[] | null => {
    const l = loanById.get(id);
    if (!l) return null;
    const secured =
      (l.securityPropertyId && assetByProperty.get(l.securityPropertyId)) ||
      (l.securityCommercialPropertyId && assetByCommercial.get(l.securityCommercialPropertyId)) ||
      (l.securityAssetId && assetById.get(l.securityAssetId)) ||
      null;
    const at = secured ? assetPath(secured.id) : null;
    return at ? [...at, safeName(`Loan – ${l.name}`)] : [owner(l.entityId), "Loans & cards", safeName(l.name)];
  };
  const personPath = (id: string) => {
    const p = personById.get(id);
    return p ? [p.entityId ? owner(p.entityId) : safeName(p.name)] : null;
  };

  function linkPath(targetType: string, targetId: string): string[] | null {
    switch (targetType) {
      case "ASSET":
        return assetPath(targetId);
      case "PROPERTY": {
        const a = assetByProperty.get(targetId);
        return a ? assetPath(a.id) : null;
      }
      case "COMMERCIAL_PROPERTY": {
        const a = assetByCommercial.get(targetId);
        return a ? assetPath(a.id) : null;
      }
      case "LIABILITY":
        return loanPath(targetId);
      case "ACCOUNT": {
        const a = accounts.find((x) => x.id === targetId);
        return a ? [owner(a.entityId), "Bank accounts", safeName(`${a.institution} ${a.accountName}`)] : null;
      }
      case "INVESTMENT_ACCOUNT": {
        const a = investments.find((x) => x.id === targetId);
        return a ? [owner(a.entityId), "Investments", safeName(`${a.institution} (${a.accountType.replace(/_/g, " ").toLowerCase()})`)] : null;
      }
      case "INSURANCE_POLICY": {
        const p = policies.find((x) => x.id === targetId);
        if (!p) return null;
        const base = (p.assetId && assetPath(p.assetId)) || (p.personId && personPath(p.personId)) || (p.entityId ? [owner(p.entityId)] : null);
        return base ? [...base, "Insurance"] : ["Insurance"];
      }
      case "ESTATE_DOCUMENT": {
        const e = estate.find((x) => x.id === targetId);
        const base = e ? personPath(e.personId) : null;
        return base ? [...base, "Wills & estate"] : null;
      }
      case "MAINTENANCE": {
        const m = maintenance.find((x) => x.id === targetId);
        const base = m ? assetPath(m.assetId) : null;
        return base ? [...base, "Servicing & repairs"] : null;
      }
      case "TENANCY": {
        const t = tenancies.find((x) => x.id === targetId);
        const base = t ? assetPath(t.commercialProperty.assetId) : null;
        return base && t ? [...base, "Tenancies", safeName(t.tenantName)] : null;
      }
      case "PERSON":
        return personPath(targetId);
      case "ENTITY":
        return entityName.has(targetId) ? [owner(targetId)] : null;
      default:
        return null;
    }
  }

  const byDoc = <T extends { documentId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.documentId!, [...(m.get(r.documentId!) ?? []), r]);
    return m;
  };
  const purposeByDoc = byDoc(purposes);
  const interestByDoc = byDoc(interest);
  const deductionByDoc = byDoc(deductions);
  const statementByDoc = byDoc(statements);

  const placements: Placement[] = [];
  for (const d of documents) {
    // Deleted (archived) documents leave the folder; they're still in the vault.
    if (d.reviewStatus === "ARCHIVED") continue;
    // Identity documents stay in the vault only.
    if (d.links.some((l) => l.targetType === "IDENTITY_RECORD" && identityIds.has(l.targetId))) continue;

    const date = d.documentDate ?? null;
    const reference = d.documentType === TAX_REFERENCE_TYPE;
    const dirs: Array<{ dir: string[]; fy: string | null }> = [];
    const docFy = d.financialYear?.label ?? (date ? financialYearLabelForDate(date) : null);

    if (reference) {
      dirs.push({ dir: d.supersededAt ? ["Tax references", "Replaced copies"] : ["Tax references"], fy: null });
    } else {
      for (const l of d.links) {
        const dir = linkPath(l.targetType, l.targetId);
        if (dir) dirs.push({ dir, fy: docFy });
      }
      for (const p of purposeByDoc.get(d.id) ?? []) {
        const dir = loanPath(p.liabilityId);
        if (dir) dirs.push({ dir, fy: docFy });
      }
      for (const y of interestByDoc.get(d.id) ?? []) {
        const dir = loanPath(y.liabilityId);
        if (dir) dirs.push({ dir, fy: y.fyLabel });
      }
      for (const w of deductionByDoc.get(d.id) ?? []) {
        const dir = personPath(w.personId);
        if (dir) dirs.push({ dir: [...dir, "Work deductions"], fy: w.fyLabel });
      }
      for (const s of statementByDoc.get(d.id) ?? []) {
        const dir = personPath(s.personId);
        if (dir) dirs.push({ dir, fy: s.fyLabel });
      }
      if (!dirs.length && d.entityId && entityName.has(d.entityId)) dirs.push({ dir: [owner(d.entityId)], fy: docFy });
      if (!dirs.length) dirs.push({ dir: ["Not filed yet"], fy: null });
    }

    const ext = (path.extname(d.originalFilename) || MIME_EXT[d.mimeType] || "").toLowerCase();
    const stem = path.basename(d.originalFilename, path.extname(d.originalFilename));
    const named = !reference && d.documentType ? `${d.documentType}${date ? ` – ${dateLabel(date)}` : ` – ${stem}`}` : stem;
    const file = safeName(named, 100) + ext;
    const seen = new Set<string>();
    for (const { dir, fy } of dirs) {
      const rel = [...dir, ...(fy ? [fy] : [])].join("/");
      if (seen.has(rel)) continue;
      seen.add(rel);
      placements.push({
        rel: `${rel}/${file}`,
        documentId: d.id,
        filePath: d.filePath,
        fileHash: d.fileHash,
        documentType: d.documentType,
        date: date ? date.toISOString().slice(0, 10) : null,
        fyLabel: fy,
        originalFilename: d.originalFilename,
        uploadDate: d.uploadDate.toISOString().slice(0, 10),
      });
    }
  }

  // Two documents with the same name in one folder: number them, in a steady order.
  const groups = new Map<string, Placement[]>();
  for (const p of placements) groups.set(p.rel.toLowerCase(), [...(groups.get(p.rel.toLowerCase()) ?? []), p]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.documentId.localeCompare(b.documentId));
    group.forEach((p, i) => {
      if (i === 0) return;
      const ext = path.posix.extname(p.rel);
      p.rel = `${p.rel.slice(0, p.rel.length - ext.length)} (${i + 1})${ext}`;
    });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Keeping the folder in step
// ---------------------------------------------------------------------------

interface Manifest {
  files: Record<string, { documentId: string; fileHash: string }>;
  indexes: string[];
}

export interface MirrorResult {
  at: string;
  folder: string;
  files: number;
  written: number;
  removed: number;
  problems: string[];
  recordsBackup: string | null;
}

const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false
  );
const toDisk = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const csv = (v: string | null) => (v === null ? "" : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function readManifest(root: string): Promise<Manifest> {
  try {
    const m = JSON.parse(await fs.readFile(path.join(root, MANIFEST), "utf8"));
    return { files: m.files ?? {}, indexes: m.indexes ?? [] };
  } catch {
    return { files: {}, indexes: [] };
  }
}

/** Removes folders left empty, up to (not including) the root. */
async function pruneEmpty(root: string, dir: string) {
  let current = dir;
  while (current.startsWith(root) && current !== root) {
    try {
      if ((await fs.readdir(current)).length) return;
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

async function writeIfChanged(file: string, text: string) {
  try {
    if ((await fs.readFile(file, "utf8")) === text) return;
  } catch {
    /* new */
  }
  await fs.writeFile(file, text);
}

/** A copy of the records once a day, keeping the last week. */
async function backupRecords(root: string, today = new Date()): Promise<string | null> {
  const dir = path.join(root, RECORDS);
  await fs.mkdir(dir, { recursive: true });
  const name = `financevault-records-${today.toISOString().slice(0, 10)}.db`;
  const file = path.join(dir, name);
  if (!(await exists(file))) {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
  const old = (await fs.readdir(dir)).filter((n) => /^financevault-records-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse();
  for (const n of old.slice(KEEP_RECORD_BACKUPS)) await fs.rm(path.join(dir, n), { force: true });
  return name;
}

/** Brings the readable folder into line with the vault. Needs the vault unlocked (to read the documents). */
export async function syncMirror(): Promise<MirrorResult | null> {
  const { folder, enabled } = await mirrorFolder();
  if (!folder || !enabled || !hasDataKey()) return null;
  const root = path.resolve(folder);
  await fs.mkdir(root, { recursive: true });

  const plan = await planCopies();
  const manifest = await readManifest(root);
  const next: Manifest = { files: {}, indexes: [] };
  const problems: string[] = [];
  let written = 0;
  let removed = 0;

  // Copies no longer wanted (unlinked, renamed, deleted): only files this wrote.
  const wanted = new Set(plan.map((p) => p.rel));
  for (const rel of Object.keys(manifest.files)) {
    if (wanted.has(rel)) continue;
    const file = toDisk(root, rel);
    await fs.rm(file, { force: true });
    removed += 1;
    await pruneEmpty(root, path.dirname(file));
  }

  for (const p of plan) {
    const file = toDisk(root, p.rel);
    const had = manifest.files[p.rel];
    if (had && had.documentId === p.documentId && had.fileHash === p.fileHash && (await exists(file))) {
      next.files[p.rel] = had;
      continue;
    }
    // Never write over a file someone put there by hand.
    if (!had && (await exists(file))) {
      problems.push(`${p.rel}: a file you added has the same name, so the vault's copy wasn't put there.`);
      continue;
    }
    try {
      const bytes = await readDocumentFile(p.filePath);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.copying`;
      await fs.writeFile(temp, bytes);
      await fs.rename(temp, file);
      next.files[p.rel] = { documentId: p.documentId, fileHash: p.fileHash };
      written += 1;
    } catch (e) {
      if (!hasDataKey()) break; // locked part-way: carry on next time
      problems.push(`${p.originalFilename}: ${(e as Error).message}`);
    }
  }

  // An index in each folder: what's there, what it is, and the fingerprint of the original.
  const byDir = new Map<string, Placement[]>();
  for (const p of plan) if (next.files[p.rel]) byDir.set(path.posix.dirname(p.rel), [...(byDir.get(path.posix.dirname(p.rel)) ?? []), p]);
  for (const [dir, items] of byDir) {
    const rows = [
      "File,Document type,Document date,Financial year,Original file name,Added to vault,SHA-256 of original,Vault document id",
      ...items
        .sort((a, b) => a.rel.localeCompare(b.rel))
        .map((p) =>
          [path.posix.basename(p.rel), p.documentType, p.date, p.fyLabel, p.originalFilename, p.uploadDate, p.fileHash, p.documentId].map(csv).join(",")
        ),
    ];
    await writeIfChanged(path.join(toDisk(root, dir), INDEX), rows.join("\r\n") + "\r\n");
    next.indexes.push(dir);
  }
  for (const dir of manifest.indexes) {
    if (byDir.has(dir)) continue;
    await fs.rm(path.join(toDisk(root, dir), INDEX), { force: true });
    await pruneEmpty(root, toDisk(root, dir));
  }

  await writeIfChanged(
    path.join(root, "READ ME.txt"),
    [
      "FINANCIAL VAULT — READABLE COPIES OF YOUR DOCUMENTS",
      "",
      "Financial Vault keeps these folders up to date. They follow the asset tree:",
      "each person, trust or company; then what they own; then the financial year.",
      "",
      "- These are copies. The originals stay encrypted inside Financial Vault.",
      "- Changes made here aren't seen by Financial Vault. Add, rename and file",
      "  documents in the app; this folder follows.",
      "- Files you put here yourself are never changed or removed.",
      "- ID documents (passport, licence, Medicare…) are not copied here.",
      "- _Index.csv in each folder lists what's there. Its SHA-256 column is the",
      "  fingerprint of the original, for checking a copy hasn't been changed.",
      "- 'Records backups' holds a copy of your records from each of the last",
      "  7 days. Restore one from Financial Vault's first screen on a new copy.",
      "",
    ].join("\r\n")
  );

  let recordsBackup: string | null = null;
  try {
    recordsBackup = await backupRecords(root);
  } catch (e) {
    problems.push(`Records backup: ${(e as Error).message}`);
  }

  await fs.writeFile(path.join(root, MANIFEST), JSON.stringify(next, null, 1));
  const result: MirrorResult = { at: new Date().toISOString(), folder: root, files: Object.keys(next.files).length, written, removed, problems, recordsBackup };
  lastResult = result;
  return result;
}

// ---------------------------------------------------------------------------
// When it runs: shortly after any change, on unlocking, and every so often.
// ---------------------------------------------------------------------------

let lastResult: MirrorResult | null = null;
let running: Promise<MirrorResult | null> | null = null;
let again = false;
let timer: NodeJS.Timeout | null = null;

export const lastMirrorResult = () => lastResult;

/** Runs a sync now (or straight after the one already running). */
export function runMirror(): Promise<MirrorResult | null> {
  if (running) {
    again = true;
    return running;
  }
  running = syncMirror()
    .catch((e) => {
      console.error("Keeping the readable document folder up to date failed:", e);
      return null;
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void runMirror();
      }
    });
  return running;
}

/** A change was made: sync a few seconds later (several changes in a row make one sync). */
export function mirrorSoon(delayMs = 3000) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runMirror();
  }, delayMs);
  timer.unref?.();
}
