import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { decryptField } from "../src/services/fieldCrypto.js";
import {
  changePasscode,
  lockNow,
  recoverVault,
  setUpVault,
  touchSession,
  unlockVault,
  vaultStatus,
} from "../src/services/vault.js";

// The raw row, bypassing the client: this is what a copy of the database file holds.
async function rawTfn(id: string) {
  const rows = await prisma.$queryRawUnsafe<{ tfn: string | null }[]>("SELECT tfn FROM Person WHERE id = ?", id);
  return rows[0]?.tfn ?? null;
}

let recoveryKey = "";

beforeAll(async () => {
  await prisma.vault.deleteMany();
  await prisma.person.deleteMany();
  // An older install's data: a TFN stored before the vault existed. Written
  // with raw SQL, since the client now refuses to store one unencrypted.
  const now = Date.now();
  await prisma.$executeRawUnsafe(
    "INSERT INTO Person (id, name, tfn, createdAt, updatedAt) VALUES ('legacy', 'Legacy', '123456782', ?, ?)",
    now,
    now
  );
});

describe("vault lifecycle", () => {
  it("starts unconfigured and locked", async () => {
    expect(await vaultStatus()).toEqual({ configured: false, unlocked: false });
  });

  it("refuses a short passcode", async () => {
    await expect(setUpVault("short")).rejects.toMatchObject({ status: 400 });
  });

  it("sets up, issues a recovery key, and unlocks", async () => {
    const result = await setUpVault("correct horse battery");
    recoveryKey = result.recoveryKey;
    expect(recoveryKey).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/);
    expect(touchSession(result.token)).toBe(true);
    expect(await vaultStatus()).toEqual({ configured: true, unlocked: true });
  });

  it("encrypts secrets that were stored before the vault existed", async () => {
    const stored = await rawTfn("legacy");
    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain("123456782");
    expect(decryptField(stored)).toBe("123456782");
  });

  it("can't be set up a second time — that would let anyone replace the passcode", async () => {
    await expect(setUpVault("attacker passcode")).rejects.toMatchObject({ status: 409 });
  });

  it("encrypts new writes whichever code path makes them", async () => {
    await prisma.person.create({ data: { id: "fresh", name: "Fresh", tfn: "876543210" } });
    expect(await rawTfn("fresh")).toMatch(/^enc:v1:/);
  });

  it("never returns the field unless it's asked for by name", async () => {
    const person = await prisma.person.findUnique({ where: { id: "fresh" } });
    expect(person).not.toHaveProperty("tfn");
  });

  it("locks: sessions end and the key is dropped", async () => {
    const token = await unlockVault("correct horse battery");
    lockNow("MANUAL");
    expect(touchSession(token)).toBe(false);
    // With the key gone, a TFN can't be written at all — not even in the clear.
    await expect(prisma.person.update({ where: { id: "fresh" }, data: { tfn: "123456782" } })).rejects.toThrow(/locked/);
  });

  it("rejects a wrong passcode, and recovers the same key from the right one", async () => {
    await expect(unlockVault("wrong passcode!")).rejects.toMatchObject({ status: 401 });
    await unlockVault("correct horse battery");
    expect(decryptField(await rawTfn("legacy"))).toBe("123456782");
  });

  it("changes the passcode without rewriting encrypted fields", async () => {
    const before = await rawTfn("legacy");
    await changePasscode("correct horse battery", "a different passcode");
    expect(await rawTfn("legacy")).toBe(before);
    lockNow("MANUAL");
    await expect(unlockVault("correct horse battery")).rejects.toMatchObject({ status: 401 });
    await unlockVault("a different passcode");
    expect(decryptField(await rawTfn("legacy"))).toBe("123456782");
  });

  it("recovers with the recovery key however it was written down", async () => {
    lockNow("MANUAL");
    const sloppy = recoveryKey.toLowerCase().replace(/-/g, " ").replace(/o/g, "0");
    await recoverVault(sloppy, "recovered passcode");
    expect(decryptField(await rawTfn("legacy"))).toBe("123456782");
    lockNow("MANUAL");
    await unlockVault("recovered passcode");
  });

  it("rejects a wrong recovery key", async () => {
    await expect(recoverVault("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", "whatever passcode")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throttles repeated wrong guesses, even against the right passcode", async () => {
    lockNow("MANUAL");
    for (let i = 0; i < 5; i++) await unlockVault("guess " + i).catch(() => {});
    await expect(unlockVault("recovered passcode")).rejects.toMatchObject({ status: 429 });
  });
});
