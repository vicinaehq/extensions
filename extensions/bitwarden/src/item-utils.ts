import { Icon, LocalStorage } from '@vicinae/api';
import type { Image } from '@vicinae/api';
import { BwItem, BwFolder, ItemType } from './bitwarden-types';
import type { ItemTypeValue } from './bitwarden-types';
import type { CreateItemPayload, ItemAction } from './bw-executor';
import { FAVICON_CACHE_KEY } from './favicons';
import type { FaviconMap } from './favicons';

export const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other'];

const CACHE_KEY = 'vicinae-bitwarden-cache';

interface CachedVault {
  items: BwItem[];
  folders: BwFolder[];
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Load cached vault data from LocalStorage. Returns null if not found or stale. */
export async function loadCachedVault(): Promise<{ items: BwItem[]; folders: BwFolder[] } | null> {
  try {
    const raw = await LocalStorage.getItem<string>(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedVault = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) return null;
    return { items: cached.items, folders: cached.folders };
  } catch {
    return null;
  }
}

/** Save vault data to LocalStorage for instant load next time. */
export async function saveCachedVault(items: BwItem[], folders: BwFolder[]): Promise<void> {
  const cache: CachedVault = { items, folders, timestamp: Date.now() };
  await LocalStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function clearCachedVault(): Promise<void> {
  await LocalStorage.removeItem(CACHE_KEY);
  await LocalStorage.removeItem(FAVICON_CACHE_KEY);
}

/**
 * Filter items by a case-insensitive substring match against the item name.
 */
export function filterItems(items: BwItem[], query: string): BwItem[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(lower));
}

type GroupedItems = Map<string | null, { folderName: string; items: BwItem[] }>;

/**
 * Group items by folderId. Returns a Map where:
 * - `null` key maps to unfiled items
 * - Folder ID keys map to items in that folder
 */
export function groupByFolder(
  items: BwItem[],
  folders: { id: string; name: string }[],
): GroupedItems {
  const folderMap = new Map<string, string>();
  for (const f of folders) {
    folderMap.set(f.id, f.name);
  }

  const grouped: GroupedItems = new Map();

  for (const item of items) {
    const key = item.folderId ?? null;
    if (!grouped.has(key)) {
      grouped.set(key, {
        folderName: key ? (folderMap.get(key) ?? 'Unknown') : 'Unfiled',
        items: [],
      });
    }
    grouped.get(key)!.items.push(item);
  }

  return grouped;
}

/**
 * Get the subtitle to display for an Item (contextual based on type).
 */
export function itemSubtitle(item: BwItem): string | undefined {
  switch (item.type) {
    case ItemType.Login:
      return item.login?.username ?? undefined;
    case ItemType.Card:
      if (item.card?.cardholderName) return item.card.cardholderName;
      if (item.card?.brand && item.card.number) {
        return `${item.card.brand} *${item.card.number.slice(-4)}`;
      }
      return undefined;
    case ItemType.Identity:
      if (item.identity) {
        const parts = [item.identity.firstName, item.identity.lastName].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : undefined;
      }
      return undefined;
    case ItemType.SecureNote:
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Get the type label to display for an Item.
 */
export function itemTypeLabel(item: BwItem): string {
  switch (item.type) {
    case ItemType.Login:
      return 'Login';
    case ItemType.Card:
      return 'Card';
    case ItemType.Identity:
      return 'Identity';
    case ItemType.SecureNote:
      return 'Secure Note';
    default:
      return 'Unknown';
  }
}

function getLoginActions(login: BwItem['login']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (login?.password) actions.push({ label: 'Copy Password', value: login.password });
  if (login?.username) actions.push({ label: 'Copy Username', value: login.username });
  if (login?.totp) actions.push({ label: 'Copy TOTP', value: 'TOTP' });
  if (login?.uris?.length) {
    const primaryUri = login.uris[0]?.uri;
    if (primaryUri) actions.push({ label: 'Open URL', value: primaryUri });
  }
  return actions;
}

function getCardActions(card: BwItem['card']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (card?.number) actions.push({ label: 'Copy Card Number', value: card.number });
  if (card?.code) actions.push({ label: 'Copy Security Code', value: card.code });
  return actions;
}

function getIdentityActions(identity: BwItem['identity']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (identity?.firstName && identity?.lastName) {
    actions.push({ label: 'Copy Name', value: `${identity.firstName} ${identity.lastName}` });
  }
  if (identity?.email) actions.push({ label: 'Copy Email', value: identity.email });
  if (identity?.phone) actions.push({ label: 'Copy Phone', value: identity.phone });
  return actions;
}

/**
 * Get the list of actions for an Item based on its type.
 */
export function itemActions(item: BwItem): ItemAction[] {
  switch (item.type) {
    case ItemType.Login:
      return getLoginActions(item.login);
    case ItemType.Card:
      return getCardActions(item.card);
    case ItemType.Identity:
      return getIdentityActions(item.identity);
    default:
      return [];
  }
}

function t(v: unknown): string | null {
  return String(v ?? '').trim() || null;
}

function buildLoginFields(values: Record<string, string>): CreateItemPayload['login'] {
  return {
    username: t(values.username),
    password: t(values.password),
    totp: t(values.totp),
    uris: values.url?.trim() ? [{ uri: values.url.trim(), match: null }] : undefined,
  };
}

function buildCardFields(values: Record<string, string>): CreateItemPayload['card'] {
  return {
    cardholderName: t(values.cardholderName),
    brand: t(values.brand),
    number: t(values.number),
    expMonth: t(values.expMonth),
    expYear: t(values.expYear),
    code: t(values.code),
  };
}

function buildIdentityFields(values: Record<string, string>): CreateItemPayload['identity'] {
  return {
    title: t(values.title),
    firstName: t(values.firstName),
    middleName: t(values.middleName),
    lastName: t(values.lastName),
    email: t(values.email),
    phone: t(values.phone),
    address1: t(values.address1),
    address2: t(values.address2),
    city: t(values.city),
    state: t(values.state),
    postalCode: t(values.postalCode),
    country: t(values.country),
  };
}

/**
 * Serialize a form submission into the JSON structure `bw create item` expects.
 */
export function toCreatePayload(
  formValues: Record<string, string>,
  type: ItemTypeValue,
  folderId?: string | null,
  fields?: { name: string; value: string; type: number }[],
): CreateItemPayload {
  const base: CreateItemPayload = {
    type,
    name: formValues.name ?? '',
    notes: t(formValues.notes),
    folderId: folderId || null,
    favorite: false,
  };

  if (type === ItemType.Login) base.login = buildLoginFields(formValues);
  if (type === ItemType.Card) base.card = buildCardFields(formValues);
  if (type === ItemType.Identity) base.identity = buildIdentityFields(formValues);
  if (type === ItemType.SecureNote) base.secureNote = { type: 0 };
  if (fields && fields.length > 0) base.fields = fields;

  return base;
}

/**
 * Build a markdown detail string for an item.
 */
export function buildItemDetailMarkdown(item: BwItem): string {
  const lines: string[] = [];

  if (item.notes) {
    lines.push(`**Notes:**`, '', item.notes);
  }

  return lines.join('\n');
}

/**
 * Map an ItemAction label to a Vicinae Icon.
 */
export function actionIcon(action: { label: string }): Image.ImageLike | undefined {
  switch (action.label) {
    case 'Copy Password':
      return Icon.Key;
    case 'Copy Username':
      return Icon.Person;
    case 'Copy Card Number':
      return Icon.CreditCard;
    case 'Copy Security Code':
      return Icon.Lock;
    case 'Copy Name':
      return Icon.Person;
    case 'Copy Email':
      return Icon.Envelope;
    case 'Copy Phone':
      return Icon.Phone;
    default:
      return undefined;
  }
}

/**
 * Get an icon for a list item. Uses processed favicons when available,
 * falls back to Vicinae built-in icons by item type.
 */
export function itemIcon(item: BwItem, favicons?: FaviconMap): Image.ImageLike {
  if (item.type === ItemType.Login && item.login?.uris?.[0]?.uri) {
    try {
      const domain = new URL(item.login.uris[0].uri).hostname;
      const cached = favicons?.[domain];

      // Only use favicon when we have a confirmed non-empty image
      if (cached !== undefined && cached !== '') {
        return { source: cached, fallback: 'key' };
      }
    } catch {
      // Invalid URL, fall through to type icon
    }
  }

  switch (item.type) {
    case ItemType.Login:
      return 'key';
    case ItemType.Card:
      return 'credit-card';
    case ItemType.Identity:
      return 'person';
    case ItemType.SecureNote:
      return 'document';
    default:
      return 'circle';
  }
}
