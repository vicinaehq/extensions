import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DbusConnection, type DbusValue, Variant } from "./dbus";

/**
 * Storage for the OATH access key.
 *
 * The 16-byte key does not extract the seeds: it only allows generating codes while the YubiKey
 * is plugged in. It is still a secret, so it follows ykman's own posture: never in plain text on
 * disk, kept in the Secret Service (gnome-keyring/KWallet) over D-Bus.
 *
 * The big win is the import path: if the user already ran `ykman oath ... -r`, the key is
 * already in ykman's keystore, encrypted with a wrap key that also lives in the Secret Service.
 * We read it from there and they never see a password prompt.
 */

const SECRETS = "org.freedesktop.secrets";
const SERVICE_PATH = "/org/freedesktop/secrets";
const SERVICE_IFACE = "org.freedesktop.Secret.Service";
const ITEM_IFACE = "org.freedesktop.Secret.Item";

const OUR_ATTRS = { application: "vicinae-yubikey" } as const;

type Session = { bus: DbusConnection; sessionPath: string };

async function openSession(): Promise<Session> {
  const bus = new DbusConnection();
  await bus.connect();
  // The "plain" algorithm: the D-Bus session is already local and authenticated by uid, so we
  // do not need the Secret Service's DH handshake for the protection level we are after.
  const [, sessionPath] = await bus.call({
    destination: SECRETS,
    path: SERVICE_PATH,
    iface: SERVICE_IFACE,
    member: "OpenSession",
    signature: "sv",
    args: ["plain", new Variant("s", "")],
  });
  return { bus, sessionPath: sessionPath as string };
}

async function unlock(bus: DbusConnection, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await bus.call({
    destination: SECRETS,
    path: SERVICE_PATH,
    iface: SERVICE_IFACE,
    member: "Unlock",
    signature: "ao",
    args: [paths],
  });
}

async function searchItems(bus: DbusConnection, attrs: Record<string, string>): Promise<string[]> {
  const [unlocked, locked] = await bus.call({
    destination: SECRETS,
    path: SERVICE_PATH,
    iface: SERVICE_IFACE,
    member: "SearchItems",
    signature: "a{ss}",
    args: [attrs],
  });
  return [...(unlocked as string[]), ...(locked as string[])];
}

async function getSecretValue(session: Session, itemPath: string): Promise<Buffer | null> {
  await unlock(session.bus, [itemPath]);
  const [secret] = await session.bus.call({
    destination: SECRETS,
    path: itemPath,
    iface: ITEM_IFACE,
    member: "GetSecret",
    signature: "o",
    args: [session.sessionPath],
  });
  // Secret struct: (oayays) = (session, params, value, contentType). value is index 2.
  const value = (secret as DbusValue[])?.[2];
  return Buffer.isBuffer(value) ? value : null;
}

async function createItem(session: Session, attrs: Record<string, string>, label: string, value: Buffer): Promise<void> {
  const collection = "/org/freedesktop/secrets/aliases/default";
  await unlock(session.bus, [collection]);

  const properties: Record<string, DbusValue> = {
    "org.freedesktop.Secret.Item.Label": new Variant("s", label),
    "org.freedesktop.Secret.Item.Attributes": new Variant("a{ss}", attrs),
  };
  // Secret struct (session, empty params, value, contentType)
  const secretStruct: DbusValue[] = [session.sessionPath, Buffer.alloc(0), value, "application/octet-stream"];

  await session.bus.call({
    destination: SECRETS,
    path: collection,
    iface: "org.freedesktop.Secret.Collection",
    member: "CreateItem",
    signature: "a{sv}(oayays)b",
    args: [properties, secretStruct, true],
  });
}

// ---------------------------------------------------------------------------
// Fernet, for importing ykman's keystore
// ---------------------------------------------------------------------------

/**
 * Decrypts a Fernet token (the format ykman's keystore uses).
 *
 * Fernet = version(0x80) ‖ timestamp(8) ‖ IV(16) ‖ ciphertext ‖ HMAC(32).
 * The 32-byte key is `signing(16) ‖ encryption(16)`. All through node:crypto.
 */
function fernetDecrypt(tokenB64: string, key: Buffer): Buffer | null {
  const token = Buffer.from(tokenB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (token.length < 1 + 8 + 16 + 32 || token[0] !== 0x80) return null;

  const signingKey = key.subarray(0, 16);
  const encKey = key.subarray(16, 32);

  const body = token.subarray(0, token.length - 32);
  const mac = token.subarray(token.length - 32);
  const expected = createHmac("sha256", signingKey).update(body).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;

  const iv = token.subarray(9, 25);
  const ciphertext = token.subarray(25, token.length - 32);
  const decipher = createDecipheriv("aes-128-cbc", encKey, iv);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

/** Reads the access key from ykman's keystore, if the user already remembered it there. */
async function importFromYkman(session: Session, deviceId: string): Promise<Buffer | null> {
  let keystore: Record<string, string>;
  try {
    const raw = readFileSync(join(homedir(), ".local", "share", "ykman", "oath_keys.json"), "utf8");
    keystore = JSON.parse(raw);
  } catch {
    return null; // ykman never used, or nothing remembered
  }

  const token = keystore[deviceId];
  if (!token) return null;

  // ykman's wrap key sits in the Secret Service under these attributes (from Python keyring).
  const items = await searchItems(session.bus, { service: "ykman", username: "wrap_key" });
  if (items.length === 0) return null;

  const wrapKeyRaw = await getSecretValue(session, items[0]);
  if (!wrapKeyRaw) return null;

  // The wrap key is a Fernet key in base64url (44 chars) → 32 bytes.
  const wrapKey = Buffer.from(wrapKeyRaw.toString("utf8").replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (wrapKey.length !== 32) return null;

  const decrypted = fernetDecrypt(token, wrapKey);
  if (!decrypted) return null;

  // The stored value is the key in hex (a JSON string). See ykman/_cli/oath.py:_validate.
  try {
    const hex = JSON.parse(decrypted.toString("utf8"));
    return typeof hex === "string" ? Buffer.from(hex, "hex") : null;
  } catch {
    return decrypted;
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Holds this session's key in memory, to avoid hitting the Secret Service on every call. */
const memoryCache = new Map<string, Buffer>();

/**
 * Retrieves the OATH access key for a device.
 *
 * Order: memory cache → our own Secret Service item → import from ykman's keystore.
 * Returns null when nothing was found, and then the UI asks for the password.
 */
export async function loadAccessKey(deviceId: string): Promise<Buffer | null> {
  const cached = memoryCache.get(deviceId);
  if (cached) return cached;

  let session: Session | null = null;
  try {
    session = await openSession();

    // 1) our own item
    const ours = await searchItems(session.bus, { ...OUR_ATTRS, deviceId });
    if (ours.length > 0) {
      const value = await getSecretValue(session, ours[0]);
      if (value) {
        const key = Buffer.from(value.toString("utf8"), "hex");
        memoryCache.set(deviceId, key);
        return key;
      }
    }

    // 2) import from ykman (and write it into our own item, for next time)
    const imported = await importFromYkman(session, deviceId);
    if (imported) {
      memoryCache.set(deviceId, imported);
      // Best effort: the key is already in hand, and ykman's entry stays readable next time.
      await createItem(session, { ...OUR_ATTRS, deviceId }, "Vicinae YubiKey OATH", Buffer.from(imported.toString("hex"), "utf8")).catch(() => {});
      return imported;
    }

    return null;
  } catch {
    // No Secret Service (sway/Hyprland without a keyring): fall back to the memory cache.
    return memoryCache.get(deviceId) ?? null;
  } finally {
    session?.bus.close();
  }
}

/**
 * Stores the key derived from a password the user typed.
 *
 * Returns false when it could only be kept in memory: with no Secret Service running
 * (sway/Hyprland without a keyring) the key lasts for this session only, and the caller has to
 * say so instead of claiming it was remembered.
 */
export async function saveAccessKey(deviceId: string, key: Buffer): Promise<boolean> {
  memoryCache.set(deviceId, key);
  let session: Session | null = null;
  try {
    session = await openSession();
    await createItem(session, { ...OUR_ATTRS, deviceId }, "Vicinae YubiKey OATH", Buffer.from(key.toString("hex"), "utf8"));
    return true;
  } catch {
    // No Secret Service: memory only for this session. Better than plain text on disk.
    return false;
  } finally {
    session?.bus.close();
  }
}

/** Memory only, for when the user does not want to persist it. */
export function rememberInSession(deviceId: string, key: Buffer): void {
  memoryCache.set(deviceId, key);
}
