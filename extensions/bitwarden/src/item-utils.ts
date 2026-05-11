import { Form, Icon, showToast, Toast } from '@vicinae/api';
import type { Image } from '@vicinae/api';
import { BwItem, BwFolder, ItemType } from './bitwarden-types';
import type { ItemTypeValue } from './bitwarden-types';
import type { CreateItemPayload, ItemAction } from './bw-executor';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';

export async function showFailureToast(err: unknown, title: string): Promise<string> {
  const message = getErrorMessage(err);
  await showToast({ style: Toast.Style.Failure, title, message });
  return message;
}

export function formatTotp(code: string): string {
  const mid = Math.floor(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

export const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other'];

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function readFormValues(values: Form.Values): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) {
    result[key] = String(val ?? '');
  }
  return result;
}

export { loadCachedVault, saveCachedVault, clearCachedVault } from './vault-cache';
export { itemIcon } from './item-icons';

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
    case ItemType.Identity: {
      const identity = item.identity;
      if (!identity) return undefined;
      const parts = [identity.firstName, identity.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : undefined;
    }
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
  if (login?.password) {
    actions.push({ label: 'Copy Password', value: login.password });
  } else if (login && login.password !== null) {
    actions.push({ label: 'Copy Password', value: '', fetchKind: 'password' });
  }
  if (login?.username) actions.push({ label: 'Copy Username', value: login.username });
  if (login?.totp) {
    actions.push({ label: 'Copy Verification Code', value: 'TOTP' });
  } else if (login && login.totp !== null) {
    actions.push({ label: 'Copy Verification Code', value: '', fetchKind: 'totp' });
  }
  if (login?.uris?.length) {
    const primaryUri = login.uris[0]?.uri;
    if (primaryUri) actions.push({ label: 'Open URL', value: primaryUri });
  }
  return actions;
}

function getCardActions(card: BwItem['card']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (card?.number) {
    actions.push({ label: 'Copy Card Number', value: card.number });
  } else if (card && card.number !== null) {
    actions.push({ label: 'Copy Card Number', value: '', fetchKind: 'cardNumber' });
  }
  if (card?.code) {
    actions.push({ label: 'Copy Security Code', value: card.code });
  } else if (card && card.code !== null) {
    actions.push({ label: 'Copy Security Code', value: '', fetchKind: 'cardCode' });
  }
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

export function trimToNull(v: unknown): string | null {
  return String(v ?? '').trim() || null;
}

function buildLoginFields(values: Record<string, string>): CreateItemPayload['login'] {
  return {
    username: trimToNull(values.username),
    password: trimToNull(values.password),
    totp: trimToNull(values.totp),
    uris: values.url?.trim() ? [{ uri: values.url.trim(), match: null }] : undefined,
  };
}

function buildCardFields(values: Record<string, string>): CreateItemPayload['card'] {
  return {
    cardholderName: trimToNull(values.cardholderName),
    brand: trimToNull(values.brand),
    number: trimToNull(values.number),
    expMonth: trimToNull(values.expMonth),
    expYear: trimToNull(values.expYear),
    code: trimToNull(values.code),
  };
}

function buildIdentityFields(values: Record<string, string>): CreateItemPayload['identity'] {
  return {
    title: trimToNull(values.title),
    firstName: trimToNull(values.firstName),
    middleName: trimToNull(values.middleName),
    lastName: trimToNull(values.lastName),
    email: trimToNull(values.email),
    phone: trimToNull(values.phone),
    address1: trimToNull(values.address1),
    address2: trimToNull(values.address2),
    city: trimToNull(values.city),
    state: trimToNull(values.state),
    postalCode: trimToNull(values.postalCode),
    country: trimToNull(values.country),
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
    notes: trimToNull(formValues.notes),
    folderId: folderId ?? null,
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
  if (item.notes) {
    return `## Notes\n\n${item.notes}`;
  }
  return '';
}

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

export async function uploadAttachments(
  itemId: string,
  filePaths: string[],
  session: bw.Session,
): Promise<void> {
  for (const filePath of filePaths) {
    try {
      await bw.createAttachment(itemId, filePath, session);
    } catch (err) {
      await showFailureToast(err, 'Failed to attach file');
    }
  }
}
