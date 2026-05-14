import { LocalStorage } from '@vicinae/api';
import { secretStore, secretLookup, secretClear } from './secret-store';
import { BwItem, BwFolder } from './bitwarden-types';
import type { BwSend } from './send-types';
import { logError } from './log';

const CACHE_KEY = 'vicinae-bitwarden-cache';

interface CachedVault {
  items: BwItem[];
  folders: BwFolder[];
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function stripSensitiveFields(item: BwItem): BwItem {
  const stripped: BwItem = {
    id: item.id,
    organizationId: null,
    folderId: item.folderId,
    type: item.type,
    name: item.name,
    notes: null,
    favorite: item.favorite,
    revisionDate: '',
    creationDate: '',
    deletedDate: null,
    collectionIds: null,
  };

  if (item.login) {
    stripped.login = {
      username: item.login.username,
      password: item.login.password ? '' : null,
      totp: item.login.totp ? '' : null,
      uris: item.login.uris,
      passwordRevisionDate: null,
    };
  }

  if (item.card) {
    stripped.card = {
      cardholderName: item.card.cardholderName,
      brand: item.card.brand,
      number: item.card.number ? '' : null,
      expMonth: null,
      expYear: null,
      code: item.card.code ? '' : null,
    };
  }

  if (item.identity) {
    stripped.identity = {
      title: null,
      firstName: item.identity.firstName,
      middleName: null,
      lastName: item.identity.lastName,
      address1: null,
      address2: null,
      address3: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      company: null,
      email: null,
      phone: null,
      ssn: null,
      username: null,
      passportNumber: null,
      licenseNumber: null,
    };
  }

  if (item.secureNote) {
    stripped.secureNote = { type: item.secureNote.type };
  }

  stripped.fields = [];
  stripped.attachments = [];

  return stripped;
}

export async function loadCachedVault(): Promise<{ items: BwItem[]; folders: BwFolder[] } | null> {
  try {
    const raw = await LocalStorage.getItem<string>(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedVault = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) return null;
    return { items: cached.items, folders: cached.folders };
  } catch (err) {
    logError('vault-cache.loadVault', err);
    return null;
  }
}

export async function saveCachedVault(items: BwItem[], folders: BwFolder[]): Promise<void> {
  const cache: CachedVault = {
    items: items.map(stripSensitiveFields),
    folders,
    timestamp: Date.now(),
  };
  await LocalStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function clearCachedVault(): Promise<void> {
  await LocalStorage.removeItem(CACHE_KEY);
}

const SENDS_CACHE_KEY = 'vicinae-bitwarden-sends-cache';
const SENDS_SECRET_KEY = 'sends-keys';
const TOTP_SECRETS_KEY = 'totp-secrets';

interface CachedSends {
  sends: BwSend[];
  timestamp: number;
}

const SENDS_CACHE_TTL = 24 * 60 * 60 * 1000;

function stripSendKey(send: BwSend): BwSend {
  return { ...send, key: '' };
}

function stripSensitiveSendFields(send: BwSend): BwSend {
  return {
    ...stripSendKey(send),
    notes: null,
    text: send.text ? { text: '', hidden: send.text.hidden } : null,
  };
}

export async function loadTotpSecrets(): Promise<Record<string, string>> {
  try {
    const raw = await secretLookup(TOTP_SECRETS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    logError('vault-cache.loadTotpSecrets', err);
    return {};
  }
}

export async function saveTotpSecrets(map: Record<string, string>): Promise<void> {
  await secretStore(TOTP_SECRETS_KEY, JSON.stringify(map), 'Vicinae Bitwarden TOTP');
}

export async function clearTotpSecrets(): Promise<void> {
  await secretClear(TOTP_SECRETS_KEY);
}

export async function clearSendKeys(): Promise<void> {
  await secretClear(SENDS_SECRET_KEY);
}

export async function loadSendKeys(): Promise<Record<string, string>> {
  try {
    const raw = await secretLookup(SENDS_SECRET_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    logError('vault-cache.loadSendKeys', err);
    return {};
  }
}

async function saveSendKeys(map: Record<string, string>): Promise<void> {
  await secretStore(SENDS_SECRET_KEY, JSON.stringify(map), 'Vicinae Bitwarden Sends');
}

export async function loadCachedSends(): Promise<BwSend[] | null> {
  try {
    const raw = await LocalStorage.getItem<string>(SENDS_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedSends = JSON.parse(raw);
    if (Date.now() - cached.timestamp > SENDS_CACHE_TTL) return null;
    return cached.sends;
  } catch (err) {
    logError('vault-cache.loadSends', err);
    return null;
  }
}

export async function saveCachedSends(sends: BwSend[]): Promise<void> {
  const cache: CachedSends = {
    sends: sends.map(stripSensitiveSendFields),
    timestamp: Date.now(),
  };
  await LocalStorage.setItem(SENDS_CACHE_KEY, JSON.stringify(cache));

  const keys: Record<string, string> = {};
  for (const s of sends) {
    keys[s.id] = s.key;
  }
  await saveSendKeys(keys);
}

export async function clearCachedSends(): Promise<void> {
  await LocalStorage.removeItem(SENDS_CACHE_KEY);
  await secretClear(SENDS_SECRET_KEY);
}
