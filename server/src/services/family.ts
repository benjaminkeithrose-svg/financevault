import { prisma } from "../db.js";

/** Roles that mean someone set up or controls a trust (as opposed to benefiting from it). */
export const FOUNDING_TRUST_ROLES = ["TRUSTEE", "APPOINTOR", "SETTLOR"];

/** A person's immediate family, from the recorded partner and parent/child links. */
export async function familyOf(personId: string) {
  const links = await prisma.personRelationship.findMany({
    where: { OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
    include: {
      fromPerson: { select: { id: true, name: true } },
      toPerson: { select: { id: true, name: true } },
    },
  });
  const partners = links
    .filter((l) => l.relationshipType === "PARTNER")
    .map((l) => (l.fromPersonId === personId ? l.toPerson : l.fromPerson));
  const children = links.filter((l) => l.relationshipType === "PARENT" && l.fromPersonId === personId).map((l) => l.toPerson);
  const parents = links.filter((l) => l.relationshipType === "PARENT" && l.toPersonId === personId).map((l) => l.fromPerson);
  return { partners, children, parents };
}

/**
 * Who could be added to a family trust as a beneficiary when this person is
 * made its trustee, appointor or settlor: their partner and children, less
 * anyone already a beneficiary. Nothing is added — the list is offered, all
 * ticked, and the person decides.
 */
export async function trustFamilySuggestions(personId: string, trustEntityId: string) {
  const { partners, children } = await familyOf(personId);
  const existing = await prisma.personEntityRelationship.findMany({
    where: { entityId: trustEntityId, relationshipType: "BENEFICIARY" },
    select: { personId: true },
  });
  const already = new Set(existing.map((r) => r.personId));
  const seen = new Set<string>();
  const suggestions: Array<{ personId: string; name: string; relation: "PARTNER" | "CHILD" }> = [];
  for (const p of partners) {
    if (already.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    suggestions.push({ personId: p.id, name: p.name, relation: "PARTNER" });
  }
  for (const c of children) {
    if (already.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    suggestions.push({ personId: c.id, name: c.name, relation: "CHILD" });
  }
  return suggestions;
}
