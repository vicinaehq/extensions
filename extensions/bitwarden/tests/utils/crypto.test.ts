import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, type EncryptedBlob } from "../../src/utils/crypto";

describe("crypto", () => {
  it("deriveKey returns 32 bytes for the same password+salt deterministically", async () => {
    const salt = Buffer.alloc(16, 1);
    const k1 = await deriveKey("hunter2", salt);
    const k2 = await deriveKey("hunter2", salt);
    expect(k1.length).toBe(32);
    expect(k1.equals(k2)).toBe(true);
  });

  it("deriveKey produces different keys for different passwords", async () => {
    const salt = Buffer.alloc(16, 2);
    const k1 = await deriveKey("a", salt);
    const k2 = await deriveKey("b", salt);
    expect(k1.equals(k2)).toBe(false);
  });

  it("encrypt + decrypt round-trips", async () => {
    const blob = await encrypt("hello world", "pwd");
    const out = await decrypt(blob, "pwd");
    expect(out).toBe("hello world");
  });

  it("decrypt with wrong password throws", async () => {
    const blob = await encrypt("secret", "right");
    await expect(decrypt(blob, "wrong")).rejects.toThrow();
  });

  it("decrypt rejects tampered ciphertext", async () => {
    const blob = await encrypt("secret", "pwd");
    const tampered: EncryptedBlob = {
      ...blob,
      ciphertext: blob.ciphertext.replace(/.$/, (c) => (c === "a" ? "b" : "a")),
    };
    await expect(decrypt(tampered, "pwd")).rejects.toThrow();
  });

  it("decrypt rejects malformed salt length", async () => {
    const blob = await encrypt("secret", "pwd");
    const bad: EncryptedBlob = { ...blob, salt: Buffer.alloc(8).toString("base64") };
    await expect(decrypt(bad, "pwd")).rejects.toThrow("Invalid salt");
  });

  it("decrypt rejects malformed IV length", async () => {
    const blob = await encrypt("secret", "pwd");
    const bad: EncryptedBlob = { ...blob, iv: Buffer.alloc(8).toString("base64") };
    await expect(decrypt(bad, "pwd")).rejects.toThrow("Invalid IV");
  });

  it("decrypt rejects tampered IV", async () => {
    const blob = await encrypt("secret", "pwd");
    const iv = Buffer.from(blob.iv, "base64");
    iv[0] = (iv[0] ?? 0) ^ 0xff;
    await expect(decrypt({ ...blob, iv: iv.toString("base64") }, "pwd")).rejects.toThrow();
  });
});
