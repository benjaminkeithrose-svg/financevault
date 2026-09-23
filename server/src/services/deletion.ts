import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Deleting a record must never quietly take other records with it. Property
 * history (leases, outgoings, snapshots), share parcels and disposals are
 * the kind of thing a person expects to keep for years, and the database
 * would otherwise cascade them away or silently unlink a loan. So a delete
 * checks what still hangs off the record first and refuses, naming what's
 * in the way, rather than doing something the person didn't ask for.
 */
export type Dependent = { count: number; one: string; many: string };

export function describeDependents(dependents: Dependent[]): string | null {
  const present = dependents.filter((d) => d.count > 0).map((d) => `${d.count} ${d.count === 1 ? d.one : d.many}`);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return `${present.slice(0, -1).join(", ")} and ${present[present.length - 1]}`;
}

export function refuseIfInUse(what: string, dependents: Dependent[]): void {
  const listed = describeDependents(dependents);
  if (!listed) return;
  throw new HttpError(
    409,
    `This ${what} can't be deleted because it still has ${listed} recorded against it. ` +
      "Remove or move those first — nothing has been changed."
  );
}

type Tx = Parameters<Extract<Parameters<typeof prisma.$transaction>[0], (...args: never[]) => unknown>>[0];

/**
 * Runs a delete and removes the document links that pointed at the deleted
 * records, in one transaction. Links are stored by type and id rather than
 * as a foreign key, so the database can't clean them up on its own — left
 * behind, the documents would show as linked to something that's gone.
 * The documents themselves are kept.
 */
export async function deleteWithLinks(targets: Array<{ type: string; id: string }>, run: (tx: Tx) => Promise<unknown>) {
  await prisma.$transaction(async (tx) => {
    await run(tx);
    const byType = new Map<string, string[]>();
    for (const target of targets) byType.set(target.type, [...(byType.get(target.type) ?? []), target.id]);
    for (const [targetType, ids] of byType) {
      await tx.documentLink.deleteMany({ where: { targetType, targetId: { in: ids } } });
    }
  });
}

/** Everything recorded against an entity that would stop it being deleted. */
export async function entityDependents(entityId: string): Promise<Dependent[]> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: {
      _count: {
        select: {
          assets: true,
          accounts: true,
          liabilities: true,
          investmentAccounts: true,
          documents: true,
          transactions: true,
          taxRecords: true,
          assetOwnerships: true,
          netWorthSnapshots: true,
          portfolioPlans: true,
          emailImportRules: true,
        },
      },
    },
  });
  if (!entity) return [];
  const c = entity._count;
  return [
    { count: c.assets, one: "asset or property", many: "assets and properties" },
    { count: c.accounts, one: "bank account", many: "bank accounts" },
    { count: c.liabilities, one: "loan", many: "loans" },
    { count: c.investmentAccounts, one: "investment account", many: "investment accounts" },
    { count: c.documents, one: "document", many: "documents" },
    { count: c.transactions, one: "transaction", many: "transactions" },
    { count: c.taxRecords, one: "tax record", many: "tax records" },
    { count: c.assetOwnerships, one: "asset ownership share", many: "asset ownership shares" },
    { count: c.netWorthSnapshots, one: "net worth snapshot", many: "net worth snapshots" },
    { count: c.portfolioPlans, one: "portfolio plan", many: "portfolio plans" },
    { count: c.emailImportRules, one: "email import rule", many: "email import rules" },
  ];
}
