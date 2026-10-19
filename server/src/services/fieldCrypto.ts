import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for the handful of fields that are secrets in their own right —
 * tax file numbers and the Gmail app password.
 *
 * The key only ever exists in memory, and only while the app is unlocked. It
 * is never written to disk in usable form (see vault.ts), so a copy of the
 * database — a synced folder, a backup ZIP, a lost laptop's drive — holds
 * these values only as ciphertext.
 */

const PREFIX = "enc:v1:";

let dataKey: Buffer | null = null;

export function setDataKey(key: Buffer) {
  dataKey = Buffer.from(key);
}

/** Overwrites the key before dropping it, rather than waiting on the GC. */
export function clearDataKey() {
  if (dataKey) dataKey.fill(0);
  dataKey = null;
}

export function hasDataKey(): boolean {
  return dataKey !== null;
}

export function sealBytes(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/** Throws if the key is wrong or the data was altered — GCM authenticates both. */
export function openBytes(key: Buffer, sealed: string): Buffer {
  const [iv, tag, ciphertext] = sealed.split(":").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !ciphertext) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField(plaintext: string): string {
  if (!dataKey) {
    // Refusing is the whole point: storing the value in the clear because the
    // key happened to be missing would silently defeat the protection.
    throw Object.assign(new Error("Financial Vault is locked, so this value can't be saved securely."), { status: 423 });
  }
  return PREFIX + sealBytes(dataKey, Buffer.from(plaintext, "utf8"));
}

export function decryptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isEncrypted(value)) return value;
  if (!dataKey) throw Object.assign(new Error("Financial Vault is locked."), { status: 423 });
  return openBytes(dataKey, value.slice(PREFIX.length)).toString("utf8");
}

// ---------------------------------------------------------------------------
// Document files. Each stored file is sealed whole with the same key:
// a marker, then the IV, the tag and the ciphertext. A file without the
// marker is from before encryption (or was saved while locked) and is read
// as it is, then sealed the next time the vault is unlocked.
// ---------------------------------------------------------------------------

const FILE_MAGIC = Buffer.from("FVAULT\x01\x00", "latin1");

export function isSealedFile(bytes: Buffer): boolean {
  return bytes.length >= FILE_MAGIC.length + 28 && bytes.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

/** Seals a file's bytes, or returns null when locked (the caller stores it as-is for now). */
export function sealFile(plaintext: Buffer): Buffer | null {
  if (!dataKey) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function openFile(bytes: Buffer): Buffer {
  if (!isSealedFile(bytes)) return bytes;
  if (!dataKey) throw Object.assign(new Error("Financial Vault is locked."), { status: 423 });
  const start = FILE_MAGIC.length;
  const iv = bytes.subarray(start, start + 12);
  const tag = bytes.subarray(start + 12, start + 28);
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes.subarray(start + 28)), decipher.final()]);
}
