import sodium from "libsodium-wrappers-sumo";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type KeysmithType = "totp" | "hotp";

export type KeysmithAccount = {
  id: string;
  account: string;
  issuer: string;
  type: KeysmithType | string;
  hash: string;
  pinLength: number;
  epoch: string;
  timeStep?: number;
  counter?: number;
  secretB64: string;
};

export type OTPAccountInput = {
  account: string;
  issuer?: string;
  type: KeysmithType;
  hash?: string;
  pinLength?: number;
  epoch?: string;
  timeStep?: number;
  counter?: number;
  secret: string;
};

export type Config = Record<string, Record<string, string>>;

const defaultConfigPath = (): string =>
  path.join(os.homedir(), ".config", "org.kde.keysmith", "Keysmith.conf");

export function normalizeConfigPath(value?: string): string {
  const cleaned = value?.trim();
  if (!cleaned) return defaultConfigPath();
  if (cleaned.startsWith("~")) {
    return path.join(os.homedir(), cleaned.slice(1));
  }
  return cleaned;
}

export function readConfig(configPath: string): Config {
  const raw = fs.readFileSync(configPath, "utf8");
  return parseConfig(raw);
}

/**
 * Turns a failed config read into something the user can act on. A missing file
 * is the common case, and the raw ENOENT says nothing about what to do.
 */
export function describeConfigReadError(error: unknown, configPath: string): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (code === "ENOENT") {
    return `No Keysmith.conf at ${configPath}. Install KDE Keysmith and create a vault, or set the Config path preference to where your Keysmith.conf lives.`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function writeConfig(configPath: string, config: Config): void {
  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, stringifyConfig(config), "utf8");
  fs.renameSync(tmpPath, configPath);
}

export function parseConfig(text: string): Config {
  const sections: Config = {};
  let current = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const s = line.match(/^\[(.+)\]$/);
    if (s) {
      current = s[1];
      sections[current] = {};
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!sections[current]) sections[current] = {};
    sections[current][key] = value;
  }
  return sections;
}

export function stringifyConfig(config: Config): string {
  return (
    Object.entries(config)
      .map(
        ([section, values]) =>
          `[${section}]\n${Object.entries(values)
            .map(([key, value]) => `${key}=${formatValue(value)}`)
            .join("\n")}`,
      )
      .join("\n\n") + "\n"
  );
}

function formatValue(value: string): string {
  if (value === "") return '""';
  if (/[\s;=#]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return value;
}

export async function ensureSodium(): Promise<void> {
  await sodium.ready;
}

export type DerivedKey = {
  key: Uint8Array;
  saltB64: string;
};

export async function deriveKey(
  password: string,
  master?: Record<string, string>,
): Promise<DerivedKey> {
  if (!master) {
    throw new Error("Keysmith.conf is missing the master-key section");
  }
  const saltRaw = base64Decode(master.salt ?? "");
  const keylen = Number.parseInt(master.length ?? "32", 10);
  const opsLimit = Number.parseInt(master.cpu ?? "3", 10);
  const memLimit = Number.parseInt(master.memory ?? "268435456", 10);
  const algorithm = Number.parseInt(
    master.algorithm ?? String(sodium.crypto_pwhash_ALG_ARGON2ID13),
    10,
  );
  const key = sodium.crypto_pwhash(
    keylen,
    password,
    saltRaw,
    opsLimit,
    memLimit,
    algorithm as number,
  );
  return { key, saltB64: base64Encode(saltRaw) };
}

function base64Decode(value: string): Uint8Array {
  const clean = value.replace(/\s/g, "");
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  return Uint8Array.from(Buffer.from(`${clean}${padding}`, "base64").values());
}

function base64Encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

/**
 * The normalized base64 of the `[master-key]` salt, or null when absent. Stored
 * alongside a cached key so a Keysmith password change invalidates the cache.
 */
export function masterSaltB64(config: Config): string | null {
  const salt = config["master-key"]?.salt;
  if (!salt) return null;
  return base64Encode(base64Decode(salt));
}

export type KeyVerification = "verified" | "invalid" | "nothing-to-verify";

/**
 * Opens the first account section in the config with the given key. A successful
 * open proves the key (and therefore the password it was derived from) is right.
 *
 * `crypto_secretbox_open_easy` throws on a wrong key. That throw is the signal,
 * not a bug, so it is caught here and turned into an explicit result.
 */
export function verifyKey(config: Config, key: Uint8Array): KeyVerification {
  for (const [id, data] of Object.entries(config)) {
    if (id === "master-key" || !data.secret || !data.nonce) continue;
    try {
      sodium.crypto_secretbox_open_easy(base64Decode(data.secret), base64Decode(data.nonce), key);
      return "verified";
    } catch {
      return "invalid";
    }
  }
  return "nothing-to-verify";
}

export async function listKeysmithAccounts(
  configPath: string,
  key: Uint8Array,
): Promise<KeysmithAccount[]> {
  await ensureSodium();
  const config = readConfig(configPath);
  const accounts: KeysmithAccount[] = [];

  for (const [id, data] of Object.entries(config)) {
    if (id === "master-key" || !data.secret || !data.nonce || !data.type) continue;
    let raw: Uint8Array;
    try {
      raw = sodium.crypto_secretbox_open_easy(
        base64Decode(data.secret),
        base64Decode(data.nonce),
        key,
      );
    } catch {
      // The key is already verified by the unlock step, so a failure here is a
      // corrupt entry, not a wrong password. Surface it plainly instead of the
      // raw libsodium message.
      throw new Error(`Failed to decrypt account "${id}". The vault entry may be corrupt.`);
    }
    accounts.push({
      id,
      account: (data.account ?? "").trim(),
      issuer: (data.issuer ?? "").trim(),
      type: data.type as KeysmithType,
      hash: data.hash ?? "Sha1",
      pinLength: Number.parseInt(data.pinLength ?? "6", 10),
      epoch: data.epoch ?? "1970-01-01T00:00:00.000Z",
      timeStep: data.timeStep ? Number.parseInt(data.timeStep, 10) : undefined,
      counter: data.counter ? Number.parseInt(data.counter, 10) : undefined,
      secretB64: Buffer.from(raw).toString("base64"),
    });
  }

  return accounts;
}

/**
 * Encrypts and appends an account using an already-derived, verified key.
 * It no longer accepts a password: deriving here would let a stale password
 * write an entry that can never be decrypted. Callers must unlock first.
 */
export async function addKeysmithAccount(
  configPath: string,
  key: Uint8Array,
  account: OTPAccountInput,
): Promise<void> {
  await ensureSodium();
  if (!(key instanceof Uint8Array) || key.length === 0) {
    throw new Error("Refusing to write: the vault was not unlocked with a verified key");
  }
  const rawConfigPath = normalizeConfigPath(configPath);
  const config = readConfig(rawConfigPath);

  const secretBytes = base32Decode(account.secret);
  if (!secretBytes) throw new Error("Invalid Base32 secret");
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(secretBytes, nonce, key);
  const id = `{${randomUUID()}}`;
  const saved: Record<string, string> = {
    account: account.account,
    issuer: account.issuer ?? "",
    type: account.type,
    hash: account.hash ?? "Sha1",
    pinLength: String(account.pinLength ?? 6),
    epoch: account.epoch ?? "1970-01-01T00:00:00.000Z",
    secret: Buffer.from(ciphertext).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
  };
  if (account.type === "totp") {
    saved.timeStep = String(account.timeStep ?? 30);
  } else {
    saved.counter = String(account.counter ?? 0);
  }

  // configparser-style section keys in existing files use URL-encoded braces.
  config[`%7B${id.slice(1, -1)}%7D`] = saved;
  writeConfig(rawConfigPath, config);
}

export function incrementHotpCounter(configPath: string, accountId: string): boolean {
  const config = readConfig(configPath);
  const data = config[accountId];
  if (!data || data.type !== "hotp") return false;
  const counter = Number.parseInt(data.counter ?? "0", 10);
  if (!Number.isFinite(counter)) return false;
  data.counter = String(counter + 1);
  writeConfig(configPath, config);
  return true;
}

export function base32Decode(input: string): Uint8Array | null {
  const clean = input.replace(/\s/g, "").toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]+$/.test(clean)) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  for (let i = 0; i < clean.length; i++) {
    const value = alphabet.indexOf(clean[i]);
    if (value === -1) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export function validateOTPSecret(secret: string): boolean {
  const decoded = base32Decode(secret);
  return decoded != null;
}
