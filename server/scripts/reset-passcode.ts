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
import fs from "node:fs/promises";
import { isEncrypted, isSealedFile } from "../src/services/fieldCrypto.js";

async function main() {
  const [people, entities, accounts, idRecords, bankAccounts, policies, documents] = await Promise.all([
    prisma.person.findMany({ where: { tfn: { not: null } }, select: { id: true, name: true, tfn: true } }),
    prisma.entity.findMany({ where: { tfn: { not: null } }, select: { id: true, name: true, tfn: true } }),
    prisma.emailAccount.findMany({ select: { id: true, emailAddress: true, appPassword: true } }),
    prisma.identityRecord.findMany({
      select: { id: true, kind: true, number: true, referenceNumber: true, person: { select: { name: true } } },
    }),
    prisma.account.findMany({ where: { accountNumber: { not: null } }, select: { id: true, accountName: true, accountNumber: true } }),
    prisma.insurancePolicy.findMany({ where: { policyNumber: { not: null } }, select: { id: true, insurer: true, kind: true, policyNumber: true } }),
    prisma.document.findMany({ select: { filePath: true } }),
  ]);
  const lostPeople = people.filter((p) => isEncrypted(p.tfn));
  const lostEntities = entities.filter((e) => isEncrypted(e.tfn));
  const lostAccounts = accounts.filter((a) => isEncrypted(a.appPassword));
  const lostIds = idRecords.filter((r) => isEncrypted(r.number) || isEncrypted(r.referenceNumber));
  const lostBank = bankAccounts.filter((a) => isEncrypted(a.accountNumber));
  const lostPolicies = policies.filter((p) => isEncrypted(p.policyNumber));
  let sealedFiles = 0;
  for (const filePath of new Set(documents.map((d) => d.filePath))) {
    const bytes = await fs.readFile(filePath).catch(() => null);
    if (bytes && isSealedFile(bytes)) sealedFiles += 1;
  }

  console.log("Resetting the passcode will permanently clear:");
  for (const p of lostPeople) console.log(`  - the tax file number for ${p.name}`);
  for (const e of lostEntities) console.log(`  - the tax file number for ${e.name}`);
  for (const a of lostAccounts) console.log(`  - the Gmail app password for ${a.emailAddress} (reconnect it afterwards)`);
  for (const r of lostIds) console.log(`  - the ${r.kind.toLowerCase().replace(/_/g, " ")} number for ${r.person.name} (the record and its scans are kept)`);
  for (const a of lostBank) console.log(`  - the account number for ${a.accountName}`);
  for (const p of lostPolicies) console.log(`  - the policy number for ${p.insurer ?? p.kind.toLowerCase()} insurance`);
  if (lostPeople.length + lostEntities.length + lostAccounts.length + lostIds.length + lostBank.length + lostPolicies.length === 0) {
    console.log("  - no numbers");
  }
  if (sealedFiles > 0) {
    console.log(
      `\n  !! ${sealedFiles} document file${sealedFiles === 1 ? " is" : "s are"} encrypted and will NEVER open again after this.` +
        "\n     Their details and searchable text are kept, but the files themselves are lost." +
        "\n     If you can find your recovery key, use it instead (Forgot passcode? on the lock screen)."
    );
  }
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
    prisma.account.updateMany({ where: { id: { in: lostBank.map((a) => a.id) } }, data: { accountNumber: null } }),
    prisma.insurancePolicy.updateMany({ where: { id: { in: lostPolicies.map((p) => p.id) } }, data: { policyNumber: null } }),
    prisma.vault.deleteMany({}),
  ]);
  console.log("Done. Start Financial Vault again and it will ask you to set a new passcode.");
}

main().finally(() => prisma.$disconnect());
