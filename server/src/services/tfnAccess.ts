import { prisma } from "../db.js";
import { decryptField } from "./fieldCrypto.js";
import { digitsOnly, isValidTfn, maskTfn, normaliseTfn } from "./tfn.js";

export type TfnOwner = "person" | "entity";

async function readTfn(owner: TfnOwner, id: string): Promise<string | null> {
  // TFNs are omitted from queries by default, so they have to be asked for.
  const row =
    owner === "person"
      ? await prisma.person.findUnique({ where: { id }, select: { tfn: true } })
      : await prisma.entity.findUnique({ where: { id }, select: { tfn: true } });
  return row?.tfn ? decryptField(row.tfn) : null;
}

/** What the UI normally gets: whether there is one, and its last three digits. */
export async function tfnSummary(owner: TfnOwner, id: string) {
  const tfn = await readTfn(owner, id);
  return { hasTfn: tfn !== null, tfnMasked: tfn ? maskTfn(tfn) : null };
}

export async function revealTfn(owner: TfnOwner, id: string): Promise<string | null> {
  const tfn = await readTfn(owner, id);
  if (!tfn) return null;
  const d = digitsOnly(tfn);
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

/**
 * Interprets a TFN field from a request: absent leaves it alone, blank
 * clears it, anything else must pass the ATO checksum. A mistyped TFN that
 * slipped through would sit encrypted where nobody would notice it was wrong.
 */
export function parseTfnInput(value: unknown): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || (typeof value === "string" && value.trim() === "")) return { ok: true, value: null };
  if (typeof value !== "string" || !isValidTfn(value)) {
    return { ok: false, error: "That doesn't look like a valid tax file number — please check the digits." };
  }
  return { ok: true, value: normaliseTfn(value) };
}
