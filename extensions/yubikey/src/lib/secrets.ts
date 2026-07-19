import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DbusConnection, type DbusValue, Variant } from "./dbus";

/**
 * Acesso à chave de acesso do OATH, guardada com segurança.
 *
 * A chave de 16 bytes não extrai as sementes: ela só permite gerar códigos enquanto a YubiKey
 * está plugada. Ainda assim é um segredo, então segue a mesma postura do ykman: nunca em texto
 * puro no disco, guardada no Secret Service (gnome-keyring/KWallet) via D-Bus.
 *
 * O ganho grande é a importação: se o usuário já rodou `ykman oath ... -r`, a chave já está no
 * keystore do ykman, cifrada com uma wrap key que também está no Secret Service. Lemos de lá e
 * ele nunca vê um prompt de senha.
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
  // Algoritmo "plain": a sessão do D-Bus já é local e autenticada pelo uid; não precisamos do
  // handshake DH do Secret Service para o nível de proteção que buscamos.
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
  // Secret struct: (oayays) = (session, params, value, contentType). value é o índice 2.
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
  // Secret struct (session, params vazio, value, contentType)
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
// Fernet — para importar o keystore do ykman
// ---------------------------------------------------------------------------

/**
 * Decifra um token Fernet (o formato que o keystore do ykman usa).
 *
 * Fernet = versão(0x80) ‖ timestamp(8) ‖ IV(16) ‖ ciphertext ‖ HMAC(32).
 * A key de 32 bytes é `signing(16) ‖ encryption(16)`. Tudo em node:crypto.
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

/** Lê a chave de acesso do keystore do ykman, se o usuário já a lembrou lá. */
async function importFromYkman(session: Session, deviceId: string): Promise<Buffer | null> {
  let keystore: Record<string, string>;
  try {
    const raw = readFileSync(join(homedir(), ".local", "share", "ykman", "oath_keys.json"), "utf8");
    keystore = JSON.parse(raw);
  } catch {
    return null; // ykman nunca usado, ou nada lembrado
  }

  const token = keystore[deviceId];
  if (!token) return null;

  // A wrap key do ykman está no Secret Service com estes atributos (do keyring do Python).
  const items = await searchItems(session.bus, { service: "ykman", username: "wrap_key" });
  if (items.length === 0) return null;

  const wrapKeyRaw = await getSecretValue(session, items[0]);
  if (!wrapKeyRaw) return null;

  // A wrap key é uma chave Fernet em base64url (44 chars) → 32 bytes.
  const wrapKey = Buffer.from(wrapKeyRaw.toString("utf8").replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (wrapKey.length !== 32) return null;

  const decrypted = fernetDecrypt(token, wrapKey);
  if (!decrypted) return null;

  // O valor guardado é a chave em hex (JSON string). Ver ykman/_cli/oath.py:_validate.
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

/** Guarda em memória a chave desta sessão, para não bater no Secret Service a cada operação. */
const memoryCache = new Map<string, Buffer>();

/**
 * Recupera a chave de acesso do OATH para um device.
 *
 * Ordem: cache em memória → nosso item no Secret Service → importação do keystore do ykman.
 * Retorna null se nada foi encontrado (aí a UI pede a senha).
 */
export async function loadAccessKey(deviceId: string): Promise<Buffer | null> {
  const cached = memoryCache.get(deviceId);
  if (cached) return cached;

  let session: Session | null = null;
  try {
    session = await openSession();

    // 1) nosso próprio item
    const ours = await searchItems(session.bus, { ...OUR_ATTRS, deviceId });
    if (ours.length > 0) {
      const value = await getSecretValue(session, ours[0]);
      if (value) {
        const key = Buffer.from(value.toString("utf8"), "hex");
        memoryCache.set(deviceId, key);
        return key;
      }
    }

    // 2) importa do ykman (e reescreve no nosso item, para as próximas vezes)
    const imported = await importFromYkman(session, deviceId);
    if (imported) {
      memoryCache.set(deviceId, imported);
      await createItem(session, { ...OUR_ATTRS, deviceId }, "Vicinae YubiKey OATH", Buffer.from(imported.toString("hex"), "utf8")).catch(() => {});
      return imported;
    }

    return null;
  } catch {
    // Sem Secret Service (sway/Hyprland sem keyring): cai no cache em memória, que estará vazio.
    return memoryCache.get(deviceId) ?? null;
  } finally {
    session?.bus.close();
  }
}

/** Guarda a chave derivada de uma senha que o usuário digitou. */
export async function saveAccessKey(deviceId: string, key: Buffer): Promise<void> {
  memoryCache.set(deviceId, key);
  let session: Session | null = null;
  try {
    session = await openSession();
    await createItem(session, { ...OUR_ATTRS, deviceId }, "Vicinae YubiKey OATH", Buffer.from(key.toString("hex"), "utf8"));
  } catch {
    // Sem Secret Service: fica só em memória por esta sessão. Melhor que texto puro no disco.
  } finally {
    session?.bus.close();
  }
}

/** Só em memória, para o caso de o usuário não querer persistir. */
export function rememberInSession(deviceId: string, key: Buffer): void {
  memoryCache.set(deviceId, key);
}
