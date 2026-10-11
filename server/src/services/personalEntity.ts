import { prisma } from "../db.js";

/**
 * Every person is also an entity: the "individual" entity that owns and owes
 * things in their own name. It's created with the person and kept in step
 * with them, so nobody has to set themselves up twice.
 */

type Tx = Parameters<Extract<Parameters<typeof prisma.$transaction>[0], (...args: never[]) => unknown>>[0];

export async function createPersonalEntity(tx: Tx, personId: string, name: string) {
  const entity = await tx.entity.create({ data: { name, entityType: "INDIVIDUAL" } });
  await tx.person.update({ where: { id: personId }, data: { entityId: entity.id } });
  await tx.personEntityRelationship.create({
    data: { personId, entityId: entity.id, relationshipType: "INDIVIDUAL_OWNER" },
  });
  return entity;
}

/**
 * Gives anyone recorded before this existed their personal entity. Where the
 * person is already the only individual owner of an INDIVIDUAL entity — the
 * way it had to be set up by hand before — that entity is adopted rather
 * than a second one created. Safe to run on every start.
 */
export async function ensurePersonalEntities(): Promise<number> {
  const people = await prisma.person.findMany({
    where: { entityId: null },
    include: {
      entityRelationships: {
        where: { relationshipType: "INDIVIDUAL_OWNER" },
        include: { entity: { include: { personRelationships: true, personalFor: true } } },
      },
    },
  });

  let created = 0;
  for (const person of people) {
    const adoptable = person.entityRelationships
      .map((r) => r.entity)
      .find(
        (e) =>
          e.entityType === "INDIVIDUAL" &&
          !e.personalFor &&
          e.personRelationships.filter((r) => r.relationshipType === "INDIVIDUAL_OWNER").length === 1
      );
    if (adoptable) {
      await prisma.person.update({ where: { id: person.id }, data: { entityId: adoptable.id } });
    } else {
      await prisma.$transaction((tx) => createPersonalEntity(tx, person.id, person.name));
      created += 1;
    }
  }
  return created;
}
