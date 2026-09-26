import { prisma } from "../db.js";

/**
 * Small nudges on the dashboard that keep the records trustworthy without
 * nagging: a backup that's getting old, values nobody has looked at for a
 * year, and — on a new setup — the few steps that get the tree started.
 */

const DAY = 86_400_000;
export const STALE_AFTER_DAYS = 365;
export const BACKUP_AFTER_DAYS = 30;

/** Top-level assets whose value hasn't changed (or been confirmed) in a year. */
export async function staleValues(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_AFTER_DAYS * DAY);
  const assets = await prisma.asset.findMany({
    where: {
      parentAssetId: null,
      disposalDate: null,
      currentValue: { not: null },
      assetType: { not: "CASH" },
      OR: [{ valuationDate: { lt: cutoff } }, { valuationDate: null, createdAt: { lt: cutoff } }],
    },
    include: { property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
    orderBy: [{ valuationDate: "asc" }, { createdAt: "asc" }],
  });
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    value: a.currentValue,
    since: (a.valuationDate ?? a.createdAt).toISOString(),
    route: a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : `/assets/${a.id}`,
  }));
}

export async function gettingStarted() {
  const [settings, people, family, structures, assets, loans, documents] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.person.count(),
    prisma.personRelationship.count(),
    prisma.entity.count({ where: { personalFor: null } }),
    prisma.asset.count({ where: { parentAssetId: null } }),
    prisma.liability.count(),
    prisma.document.count(),
  ]);
  const steps = [
    { key: "people", label: "Add the people in your family", route: "/people", done: people > 0 },
    { key: "family", label: "Link partners, parents and children", route: "/people", done: family > 0 || people === 1 },
    { key: "structures", label: "Add any trusts, companies or SMSF (skip if you have none)", route: "/people", done: structures > 0, optional: true },
    { key: "assets", label: "Add your properties, vehicles and other assets", route: "/properties", done: assets > 0 },
    { key: "loans", label: "Add loans and credit cards", route: "/loans", done: loans > 0 },
    { key: "documents", label: "Upload or import documents", route: "/documents", done: documents > 0 },
    { key: "backup", label: "Take your first full backup", route: "/settings", done: !!settings?.lastBackupAt },
  ];
  const required = steps.filter((s) => !s.optional);
  return {
    steps,
    dismissed: settings?.checklistDismissed ?? false,
    complete: required.every((s) => s.done),
  };
}
