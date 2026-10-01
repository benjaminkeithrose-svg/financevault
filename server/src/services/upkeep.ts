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
    route: a.property
      ? `/properties/${a.property.id}`
      : a.commercialProperty
        ? `/commercial-properties/${a.commercialProperty.id}`
        : `/assets/${a.id}`,
  }));
}

export const parseKeys = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Getting started: small steps in the order a family's records are built up.
 * Each ticks itself off from what's recorded, so stopping and coming back
 * loses nothing. Loans and Reports only appear once there's something for
 * them to be about. Any step can be skipped; the list can be put away.
 */
export async function gettingStarted() {
  const [settings, people, family, assets, accounts, securing, loans, documents] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.person.count(),
    prisma.personRelationship.count(),
    prisma.asset.count({ where: { parentAssetId: null } }),
    prisma.account.count(),
    prisma.asset.count({ where: { parentAssetId: null, assetType: { in: ["PROPERTY", "COMMERCIAL_PROPERTY", "VEHICLE"] } } }),
    prisma.liability.count(),
    prisma.document.count(),
  ]);
  const off = new Set(parseKeys(settings?.featuresOff));
  const on = (feature: string) => !off.has(feature);
  const skipped = new Set(parseKeys(settings?.setupSkipped));
  const owns = assets + accounts > 0;
  const buttons = (list: Array<[string, string, string?]>) =>
    list.filter(([, , feature]) => !feature || on(feature)).map(([label, route]) => ({ label, route }));

  const steps = [
    {
      key: "have",
      label: "What do you have?",
      explain: "Tick what applies — anything you don't have is kept out of the menu. Change it any time in Settings → Features.",
      buttons: [],
      done: !!settings?.setupHaveDone,
    },
    {
      key: "people",
      label: "Add the people, then their relationships",
      explain: "Your family, and any trusts, companies or SMSF.",
      buttons: buttons([["Add people", "/people"]]),
      done: people > 0 && (family > 0 || people === 1),
    },
    {
      key: "own",
      label: "Add what they own",
      explain: "Start with one — you can add the detail later.",
      buttons: buttons([
        ["Property", "/properties"],
        ["Bank account", "/banking"],
        ["Vehicle or boat", "/vehicles", "vehicles"],
        ["Shares or crypto", "/investments", "investments"],
        ["Super", "/super", "super"],
        ["Something else", "/assets"],
      ]),
      done: owns,
    },
    ...(securing > 0
      ? [
          {
            key: "loans",
            label: "Add loans",
            explain: "Home loans, car loans and credit cards.",
            buttons: buttons([["Add a loan", "/loans"]]),
            done: loans > 0,
          },
        ]
      : []),
    {
      key: "papers",
      label: "Add papers and cover",
      explain: "Statements, contracts and policies — they back up the figures.",
      buttons: buttons([
        ["Upload documents", "/documents"],
        ["Add insurance", "/insurance", "insurance"],
        ["See what's missing", "/missing", "expected"],
      ]),
      done: documents > 0,
    },
    ...(owns && loans > 0
      ? [
          {
            key: "reports",
            label: "Have a look at the reports",
            explain: "There's enough recorded now for them to mean something.",
            buttons: buttons([
              ["Net Worth", "/net-worth"],
              ["Reports", "/reports"],
            ]),
            done: false,
          },
        ]
      : []),
    {
      key: "backup",
      label: "Take your first full backup",
      explain: "Keep a copy somewhere other than this computer.",
      buttons: buttons([["Backup", "/settings"]]),
      done: !!settings?.lastBackupAt,
    },
  ].map((s) => ({ ...s, skipped: !s.done && skipped.has(s.key) }));
  // Reports appears last, once there are assets and loans; until then
  // there's still a step to come (or the list can be put away).
  const complete = steps.every((s) => s.done || s.skipped) && steps.some((s) => s.key === "reports");
  return { steps, dismissed: settings?.checklistDismissed ?? false, complete };
}
