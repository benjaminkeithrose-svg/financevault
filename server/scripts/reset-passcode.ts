/**
 * Last resort for a forgotten passcode with no recovery key.
 *
 * Deliberately a command, not a button: a reset reachable from the lock
 * screen would let anyone at the keyboard bypass the lock. Running this needs
 * access to the app's files — which already means access to the unencrypted
 * data — so it grants nothing new.
 *
 * The encrypted fields can't be recovered without the passcode or recovery
 * key, so they're cleared rather than left as unreadable ciphertext.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { isEncrypted } from "../src/services/fieldCrypto.js";

async function main() {
  const [people, entities, accounts, idRecords] = await Promise.all([
    prisma.person.findMany({ where: { tfn: { not: null } }, select: { id: true, name: true, tfn: true } }),
    prisma.entity.findMany({ where: { tfn: { not: null } }, select: { id: true, name: true, tfn: true } }),
    prisma.emailAccount.findMany({ select: { id: true, emailAddress: true, appPassword: true } }),
    prisma.identityRecord.findMany({
      select: { id: true, kind: true, number: true, referenceNumber: true, person: { select: { name: true } } },
    }),
  ]);
  const lostPeople = people.filter((p) => isEncrypted(p.tfn));
  const lostEntities = entities.filter((e) => isEncrypted(e.tfn));
  const lostAccounts = accounts.filter((a) => isEncrypted(a.appPassword));
  const lostIds = idRecords.filter((r) => isEncrypted(r.number) || isEncrypted(r.referenceNumber));

  console.log("Resetting the passcode will permanently clear:");
  for (const p of lostPeople) console.log(`  - the tax file number for ${p.name}`);
  for (const e of lostEntities) console.log(`  - the tax file number for ${e.name}`);
  for (const a of lostAccounts) console.log(`  - the Gmail app password for ${a.emailAddress} (reconnect it afterwards)`);
  for (const r of lostIds) console.log(`  - the ${r.kind.toLowerCase().replace(/_/g, " ")} number for ${r.person.name} (the record and its scans are kept)`);
  if (lostPeople.length + lostEntities.length + lostAccounts.length + lostIds.length === 0) console.log("  - nothing else");
  console.log("Everything else is kept.\n");

  if (!process.argv.includes("--yes")) {
    console.log("Nothing has been changed. To go ahead, run:  npm run reset-passcode -- --yes");
    return;
  }

  await prisma.$transaction([
    prisma.person.updateMany({ where: { id: { in: lostPeople.map((p) => p.id) } }, data: { tfn: null } }),
    prisma.entity.updateMany({ where: { id: { in: lostEntities.map((e) => e.id) } }, data: { tfn: null } }),
    prisma.emailAccount.updateMany({
      where: { id: { in: lostAccounts.map((a) => a.id) } },
      data: { appPassword: "", enabled: false },
    }),
    prisma.identityRecord.updateMany({
      where: { id: { in: lostIds.map((r) => r.id) } },
      data: { number: null, referenceNumber: null },
    }),
    prisma.vault.deleteMany({}),
  ]);
  console.log("Done. Start Financial Vault again and it will ask you to set a new passcode.");
}

main().finally(() => prisma.$disconnect());
