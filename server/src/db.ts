import { PrismaClient } from "@prisma/client";
import { encryptField, isEncrypted } from "./services/fieldCrypto.js";

/**
 * Fields encrypted at rest, by model. Enforced here on every write rather
 * than at each route, so a new code path can't store one in the clear by
 * forgetting to call the encryption helper — it simply can't be written
 * unencrypted through this client.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Person: ["tfn", "motherMaidenName"],
  Entity: ["tfn"],
  EmailAccount: ["appPassword"],
  IdentityRecord: ["number", "referenceNumber"],
  InsurancePolicy: ["policyNumber"],
  Account: ["accountNumber"],
};

function encryptInPlace(data: unknown, fields: string[]) {
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    // Already-encrypted values pass through untouched, so a client that
    // round-trips ciphertext it was given can't double-encrypt it.
    if (typeof value === "string" && value !== "" && !isEncrypted(value)) {
      record[field] = encryptField(value);
    }
  }
}

// Encrypted fields are left out of every query result unless explicitly
// selected. Ciphertext isn't dangerous on its own, but this way nothing —
// a list endpoint, a nested include, a report — hands a TFN to the browser
// by accident; the few places that need one have to ask for it by name.
const base = new PrismaClient({
  omit: {
    person: { tfn: true, motherMaidenName: true },
    entity: { tfn: true },
    identityRecord: { number: true, referenceNumber: true },
    insurancePolicy: { policyNumber: true },
    account: { accountNumber: true },
  },
});

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // A changed value is a new valuation: its date is kept, so the
        // dashboard can say which values haven't been looked at in a while.
        if (model === "Asset" && (operation === "create" || operation === "update")) {
          const a = args as { data?: Record<string, unknown>; where?: { id?: string } };
          const value = a.data?.currentValue;
          if (typeof value === "number" && a.data && a.data.valuationDate === undefined) {
            const before =
              operation === "update" && a.where?.id
                ? await base.asset.findUnique({ where: { id: a.where.id }, select: { currentValue: true } })
                : null;
            if (operation === "create" || before?.currentValue !== value) a.data.valuationDate = new Date();
          }
        }
        const fields = model ? ENCRYPTED_FIELDS[model] : undefined;
        if (fields) {
          const a = args as Record<string, unknown>;
          if (operation === "create" || operation === "update" || operation === "updateMany") {
            encryptInPlace(a.data, fields);
          } else if (operation === "createMany") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            for (const row of rows) encryptInPlace(row, fields);
          } else if (operation === "upsert") {
            encryptInPlace(a.create, fields);
            encryptInPlace(a.update, fields);
          }
        }
        return query(args);
      },
    },
  },
});
