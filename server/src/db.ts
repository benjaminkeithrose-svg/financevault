import { PrismaClient } from "@prisma/client";
import { encryptField, isEncrypted } from "./services/fieldCrypto.js";

/**
 * Fields encrypted at rest, by model. Enforced here on every write rather
 * than at each route, so a new code path can't store one in the clear by
 * forgetting to call the encryption helper — it simply can't be written
 * unencrypted through this client.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Person: ["tfn"],
  Entity: ["tfn"],
  EmailAccount: ["appPassword"],
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

const base = new PrismaClient();

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
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
