import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearDataKey,
  decryptField,
  encryptField,
  isEncrypted,
  openBytes,
  sealBytes,
  setDataKey,
} from "../src/services/fieldCrypto.js";
import { scrubSecrets } from "../src/services/audit.js";

afterEach(() => clearDataKey());

describe("field encryption", () => {
  it("round-trips", () => {
    setDataKey(randomBytes(32));
    const sealed = encryptField("123456782");
    expect(isEncrypted(sealed)).toBe(true);
    expect(sealed).not.toContain("123456782");
    expect(decryptField(sealed)).toBe("123456782");
  });

  it("produces different ciphertext for the same value each time", () => {
    setDataKey(randomBytes(32));
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("refuses to encrypt while locked rather than storing plaintext", () => {
    expect(() => encryptField("123456782")).toThrow(/locked/);
  });

  it("detects tampering", () => {
    const key = randomBytes(32);
    const sealed = sealBytes(key, Buffer.from("secret"));
    const [iv, tag, ct] = sealed.split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => openBytes(key, [iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("fails with the wrong key", () => {
    const sealed = sealBytes(randomBytes(32), Buffer.from("secret"));
    expect(() => openBytes(randomBytes(32), sealed)).toThrow();
  });

  it("passes plaintext through unchanged, for rows written before encryption", () => {
    expect(decryptField("legacy value")).toBe("legacy value");
  });
});

describe("audit scrubbing", () => {
  it("replaces secret values but records that they changed", () => {
    expect(scrubSecrets({ name: "Ben", tfn: "123456782", nested: { appPassword: "abcd" } })).toEqual({
      name: "Ben",
      tfn: "[changed — value not logged]",
      nested: { appPassword: "[changed — value not logged]" },
    });
  });

  it("keeps a cleared value as cleared", () => {
    expect(scrubSecrets({ tfn: null })).toEqual({ tfn: null });
    expect(scrubSecrets({ tfn: "" })).toEqual({ tfn: "" });
  });
});
