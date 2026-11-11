import { z } from "zod";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Shared ownership: a house 50/50 between two people, a loan owed jointly,
 * a car split three ways. The record keeps one primary owner (entityId) for
 * simple lists; the split lives in AssetOwnership / LiabilityOwnership rows.
 * With no rows the primary owner has 100%.
 */

export interface ShareRow {
  ownerEntityId: string;
  ownershipPercent: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

function current(rows: ShareRow[], on: Date): ShareRow[] {
  return rows.filter((r) => (!r.startDate || r.startDate <= on) && (!r.endDate || r.endDate >= on));
}

/**
 * The fraction (0–1) of a record that an entity owns today. Listed shares
 * count as written; a primary owner who isn't listed keeps whatever the
 * listed shares leave over, so "add Sam at 50%" to Alex's house means
 * 50/50 without also having to list Alex.
 */
export function shareOf(record: { entityId: string; ownerships?: ShareRow[] }, entityId: string, on = new Date()): number {
  const rows = current(record.ownerships ?? [], on);
  if (rows.length === 0) return record.entityId === entityId ? 1 : 0;
  const listed = rows.filter((r) => r.ownerEntityId === entityId).reduce((s, r) => s + r.ownershipPercent, 0);
  const total = rows.reduce((s, r) => s + r.ownershipPercent, 0);
  const primaryRest = record.entityId === entityId && listed === 0 ? Math.max(0, 100 - total) : 0;
  return Math.min(100, listed + primaryRest) / 100;
}

/** Refuses a new share that would take the current shares past 100%. */
export function checkRoomFor(existing: ShareRow[], adding: number, on = new Date()): void {
  const taken = current(existing, on).reduce((s, r) => s + r.ownershipPercent, 0);
  if (taken + adding > 100.01) {
    throw new HttpError(400, `That would make the shares add up to ${Math.round((taken + adding) * 100) / 100}% — ${Math.round((100 - taken) * 100) / 100}% is left to give.`);
  }
}

/** Owners chosen when something is created: two or more, adding up to 100%. */
export const ownersInput = z
  .array(z.object({ entityId: z.string().min(1), percent: z.number().gt(0).max(100) }))
  .optional()
  .nullable();

export type Owners = NonNullable<z.infer<typeof ownersInput>>;

/** Checks a list of owners and returns it, or null when there's only one owner (nothing to split). */
export function checkOwners(owners: Owners | null | undefined): Owners | null {
  if (!owners || owners.length < 2) return null;
  const ids = new Set(owners.map((o) => o.entityId));
  if (ids.size !== owners.length) throw new HttpError(400, "Each owner can only be listed once.");
  const total = owners.reduce((s, o) => s + o.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new HttpError(400, `The owners' shares add up to ${Math.round(total * 100) / 100}% — they need to add up to 100%.`);
  }
  return owners;
}
