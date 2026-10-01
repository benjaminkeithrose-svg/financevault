import { randomBytes, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { prisma } from "../db.js";
import { logAudit } from "./audit.js";
import { clearDataKey, isEncrypted, openBytes, sealBytes, setDataKey, hasDataKey } from "./fieldCrypto.js";
import { encryptStoredDocuments } from "./documentFiles.js";

/**
 * Passcode handling, key wrapping and sessions.
 *
 * The passcode is never stored. It's stretched with scrypt into a key that
 * unwraps a random data key; that data key is what actually encrypts
 * sensitive fields, and it lives only in memory while unlocked.
 */

// OWASP's recommended scrypt cost. Deliberately slow (a fraction of a second
// per attempt) so a copied database can't be brute-forced quickly offline.
const DEFAULT_KDF = { N: 2 ** 17, r: 8, p: 1 };

export const MIN_PASSCODE_LENGTH = 8;

/** No activity for this long and the app locks itself and forgets the key. */
export const IDLE_LOCK_MS = 15 * 60 * 1000;

function scrypt(secret: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    // Node's default 32MB ceiling is below what N=2^17, r=8 needs (128MB).
    maxmem: 256 * 1024 * 1024,
  };
  return new Promise((resolve, reject) => {
    scryptCallback(secret.normalize("NFKC"), salt, 32, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// --- Recovery keys ---------------------------------------------------------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** 160 random bits, shown in groups of four so it can be written down. */
function generateRecoveryKey(): string {
  return toBase32(randomBytes(20)).match(/.{1,4}/g)!.join("-");
}

/**
 * Accepts the recovery key however it was copied down: any case, with or
 * without dashes and spaces, and with the digits people commonly write for
 * the letters they resemble (the alphabet has no 0, 1 or 8).
 */
function normaliseRecoveryKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/8/g, "B");
}

// --- Sessions ----------------------------------------------------------------

const sessions = new Map<string, number>();
let lastActivity = Date.now();

function newSession(): string {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, Date.now());
  lastActivity = Date.now();
  return token;
}

/** True if the token belongs to a live session; also counts as activity. */
export function touchSession(token: string | undefined): boolean {
  if (!token || !hasDataKey()) return false;
  const seen = sessions.get(token);
  if (seen === undefined) return false;
  const now = Date.now();
  if (now - seen > IDLE_LOCK_MS) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, now);
  lastActivity = now;
  return true;
}

export function lockNow(reason: "MANUAL" | "IDLE") {
  const wasUnlocked = hasDataKey();
  sessions.clear();
  clearDataKey();
  if (wasUnlocked) {
    void logAudit("VAULT_LOCKED", { targetType: "Vault", data: { reason } }).catch(() => {});
  }
}

// Idle lock runs on the server so it still happens if the browser tab was
// closed or the machine went to sleep with the app open.
setInterval(() => {
  if (hasDataKey() && Date.now() - lastActivity > IDLE_LOCK_MS) lockNow("IDLE");
}, 60 * 1000).unref();

// --- Unlock throttling ----------------------------------------------------

let consecutiveFailures = 0;
let blockedUntil = 0;

/**
 * Online guessing (e.g. another program on this machine hammering the
 * unlock endpoint) is throttled here; offline guessing against a copied
 * database is what the scrypt cost is for.
 */
function checkThrottle(): { retryAfterSeconds: number } | null {
  const wait = blockedUntil - Date.now();
  return wait > 0 ? { retryAfterSeconds: Math.ceil(wait / 1000) } : null;
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= 5) {
    const delay = Math.min(30_000 * 2 ** (consecutiveFailures - 5), 15 * 60_000);
    blockedUntil = Date.now() + delay;
  }
}

function recordSuccess() {
  consecutiveFailures = 0;
  blockedUntil = 0;
}

export class VaultError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

// --- Vault operations -------------------------------------------------------

export async function vaultStatus() {
  const vault = await prisma.vault.findUnique({ where: { id: 1 } });
  return { configured: vault !== null, unlocked: hasDataKey() };
}

/**
 * Anything stored before the vault existed — or restored from an older
 * backup — is still plaintext. Rewriting it through the client encrypts it,
 * since the write extension won't store these fields in the clear. Safe to
 * run repeatedly: values already encrypted are left alone.
 */
async function encryptRemainingPlaintext() {
  const [people, entities, accounts, bankAccounts] = await Promise.all([
    prisma.person.findMany({ where: { tfn: { not: null } }, select: { id: true, tfn: true } }),
    prisma.entity.findMany({ where: { tfn: { not: null } }, select: { id: true, tfn: true } }),
    prisma.emailAccount.findMany({ select: { id: true, appPassword: true } }),
    // Bank account numbers, encrypted since this version.
    prisma.account.findMany({ where: { accountNumber: { not: null } }, select: { id: true, accountNumber: true } }),
  ]);
  for (const b of bankAccounts) {
    if (b.accountNumber && !isEncrypted(b.accountNumber)) {
      await prisma.account.update({ where: { id: b.id }, data: { accountNumber: b.accountNumber } });
    }
  }
  for (const p of people) {
    if (p.tfn && !isEncrypted(p.tfn)) await prisma.person.update({ where: { id: p.id }, data: { tfn: p.tfn } });
  }
  for (const e of entities) {
    if (e.tfn && !isEncrypted(e.tfn)) await prisma.entity.update({ where: { id: e.id }, data: { tfn: e.tfn } });
  }
  for (const a of accounts) {
    if (a.appPassword && !isEncrypted(a.appPassword)) {
      await prisma.emailAccount.update({ where: { id: a.id }, data: { appPassword: a.appPassword } });
    }
  }
  // Document files can be many and large, so they're sealed in the
  // background; the app is usable meanwhile and reads either form.
  encryptStoredDocuments().catch((err) => console.error("Encrypting stored documents stopped:", (err as Error).message));
}

function assertPasscode(passcode: string) {
  if (typeof passcode !== "string" || passcode.length < MIN_PASSCODE_LENGTH) {
    throw new VaultError(`Use at least ${MIN_PASSCODE_LENGTH} characters.`, 400);
  }
}

export async function setUpVault(passcode: string): Promise<{ token: string; recoveryKey: string }> {
  assertPasscode(passcode);
  if (await prisma.vault.findUnique({ where: { id: 1 } })) {
    throw new VaultError("A passcode is already set.", 409);
  }

  const dataKey = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const passcodeSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);

  const [passcodeKey, recoveryWrapKey] = await Promise.all([
    scrypt(passcode, passcodeSalt, DEFAULT_KDF),
    scrypt(normaliseRecoveryKey(recoveryKey), recoverySalt, DEFAULT_KDF),
  ]);

  // The wrapped keys are written before anything is encrypted with the data
  // key, so there's never a moment where fields are encrypted under a key
  // that hasn't been saved.
  await prisma.vault.create({
    data: {
      id: 1,
      kdfN: DEFAULT_KDF.N,
      kdfR: DEFAULT_KDF.r,
      kdfP: DEFAULT_KDF.p,
      passcodeSalt: passcodeSalt.toString("base64"),
      keyWrappedByPasscode: sealBytes(passcodeKey, dataKey),
      recoverySalt: recoverySalt.toString("base64"),
      keyWrappedByRecovery: sealBytes(recoveryWrapKey, dataKey),
    },
  });

  // Any session left over from before a reset belongs to the old key.
  sessions.clear();
  setDataKey(dataKey);
  dataKey.fill(0);
  await encryptRemainingPlaintext();
  await logAudit("VAULT_CREATED", { targetType: "Vault" });

  return { token: newSession(), recoveryKey };
}

async function loadVault() {
  const vault = await prisma.vault.findUnique({ where: { id: 1 } });
  if (!vault) throw new VaultError("No passcode has been set yet.", 409);
  return vault;
}

export async function unlockVault(passcode: string): Promise<string> {
  const throttled = checkThrottle();
  if (throttled) {
    throw new VaultError("Too many wrong attempts. Try again shortly.", 429, throttled.retryAfterSeconds);
  }

  const vault = await loadVault();
  const key = await scrypt(passcode ?? "", Buffer.from(vault.passcodeSalt, "base64"), {
    N: vault.kdfN,
    r: vault.kdfR,
    p: vault.kdfP,
  });

  let dataKey: Buffer;
  try {
    // A wrong passcode derives the wrong key, which fails GCM
    // authentication — the wrapped key doubles as the passcode check.
    dataKey = openBytes(key, vault.keyWrappedByPasscode);
  } catch {
    recordFailure();
    await logAudit("VAULT_UNLOCK_FAILED", { targetType: "Vault" });
    throw new VaultError("That passcode isn't right.", 401);
  }

  recordSuccess();
  setDataKey(dataKey);
  dataKey.fill(0);
  await encryptRemainingPlaintext();
  await logAudit("VAULT_UNLOCKED", { targetType: "Vault" });
  return newSession();
}

/** Forgotten passcode: the recovery key unwraps the same data key. */
export async function recoverVault(recoveryKey: string, newPasscode: string): Promise<string> {
  assertPasscode(newPasscode);
  const throttled = checkThrottle();
  if (throttled) {
    throw new VaultError("Too many wrong attempts. Try again shortly.", 429, throttled.retryAfterSeconds);
  }

  const vault = await loadVault();
  const params = { N: vault.kdfN, r: vault.kdfR, p: vault.kdfP };
  const recoveryWrapKey = await scrypt(
    normaliseRecoveryKey(recoveryKey ?? ""),
    Buffer.from(vault.recoverySalt, "base64"),
    params
  );

  let dataKey: Buffer;
  try {
    dataKey = openBytes(recoveryWrapKey, vault.keyWrappedByRecovery);
  } catch {
    recordFailure();
    await logAudit("VAULT_RECOVERY_FAILED", { targetType: "Vault" });
    throw new VaultError("That recovery key isn't right.", 401);
  }

  recordSuccess();
  const passcodeSalt = randomBytes(16);
  const passcodeKey = await scrypt(newPasscode, passcodeSalt, params);
  await prisma.vault.update({
    where: { id: 1 },
    data: {
      passcodeSalt: passcodeSalt.toString("base64"),
      keyWrappedByPasscode: sealBytes(passcodeKey, dataKey),
    },
  });

  setDataKey(dataKey);
  dataKey.fill(0);
  await encryptRemainingPlaintext();
  await logAudit("VAULT_RECOVERED", { targetType: "Vault" });
  return newSession();
}

/** Only the wrapping changes; the encrypted fields are untouched. */
export async function changePasscode(currentPasscode: string, newPasscode: string) {
  assertPasscode(newPasscode);
  const vault = await loadVault();
  const params = { N: vault.kdfN, r: vault.kdfR, p: vault.kdfP };
  const currentKey = await scrypt(currentPasscode ?? "", Buffer.from(vault.passcodeSalt, "base64"), params);

  let dataKey: Buffer;
  try {
    dataKey = openBytes(currentKey, vault.keyWrappedByPasscode);
  } catch {
    recordFailure();
    throw new VaultError("Your current passcode isn't right.", 401);
  }

  const passcodeSalt = randomBytes(16);
  const newKey = await scrypt(newPasscode, passcodeSalt, params);
  await prisma.vault.update({
    where: { id: 1 },
    data: {
      passcodeSalt: passcodeSalt.toString("base64"),
      keyWrappedByPasscode: sealBytes(newKey, dataKey),
    },
  });
  dataKey.fill(0);
  await logAudit("VAULT_PASSCODE_CHANGED", { targetType: "Vault" });
}
