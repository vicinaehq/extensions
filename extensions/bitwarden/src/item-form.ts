import { Form } from '@vicinae/api';
import { BwItem, ItemType } from './bitwarden-types';
import type { ItemTypeValue } from './bitwarden-types';
import type { CreateItemPayload } from './bw-executor';
import * as bw from './bw-executor';
import { showFailureToast } from './toast';

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

export function buildItemDetailMarkdown(item: BwItem): string {
  if (item.notes) {
    return `## Notes\n\n${item.notes}`;
  }
  return '';
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
