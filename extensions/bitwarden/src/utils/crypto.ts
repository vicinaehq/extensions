import { pbkdf2, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

const ITERATIONS = 600_000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

export interface EncryptedBlob {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
  tag: string; // base64
}

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return pbkdf2Async(password, salt, ITERATIONS, KEY_LEN, "sha256");
}

export async function encrypt(plaintext: string, password: string): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export async function decrypt(blob: EncryptedBlob, password: string): Promise<string> {
  if (blob.v !== 1) throw new Error("Unsupported blob version");
  const salt = Buffer.from(blob.salt, "base64");
  const iv = Buffer.from(blob.iv, "base64");
  const ct = Buffer.from(blob.ciphertext, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  if (salt.length !== SALT_LEN) throw new Error("Invalid salt");
  if (iv.length !== IV_LEN) throw new Error("Invalid IV");
  if (tag.length !== TAG_LEN) throw new Error("Invalid auth tag");
  const key = await deriveKey(password, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
