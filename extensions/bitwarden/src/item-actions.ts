import { Icon } from '@vicinae/api';
import type { Image } from '@vicinae/api';
import { BwItem, ItemType } from './bitwarden-types';
import type { ItemAction } from './bw-executor';

const LOGIN_ACTION_SPECS = [
  { label: 'Copy Password', key: 'password' as const, fetchKind: 'password' as const },
  { label: 'Copy Username', key: 'username' as const },
  {
    label: 'Copy Verification Code',
    key: 'totp' as const,
    valueOverride: 'TOTP',
    fetchKind: 'totp' as const,
  },
];

function getLoginActions(login: BwItem['login']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (!login) return actions;
  for (const spec of LOGIN_ACTION_SPECS) {
    const val = login[spec.key];
    if (val) {
      actions.push({ label: spec.label, value: spec.valueOverride ?? val });
    } else if (val !== null && spec.fetchKind) {
      actions.push({ label: spec.label, value: '', fetchKind: spec.fetchKind });
    }
  }
  if (login.uris?.length) {
    const primaryUri = login.uris[0]?.uri;
    if (primaryUri) actions.push({ label: 'Open URL', value: primaryUri });
  }
  return actions;
}

const CARD_ACTION_SPECS = [
  { label: 'Copy Card Number', key: 'number' as const, fetchKind: 'cardNumber' as const },
  { label: 'Copy Security Code', key: 'code' as const, fetchKind: 'cardCode' as const },
];

function getCardActions(card: BwItem['card']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (!card) return actions;
  for (const spec of CARD_ACTION_SPECS) {
    const val = card[spec.key];
    if (val) {
      actions.push({ label: spec.label, value: val });
    } else if (val !== null) {
      actions.push({ label: spec.label, value: '', fetchKind: spec.fetchKind });
    }
  }
  return actions;
}

type IdentityActionSpec =
  | {
      label: string;
      keys: readonly [string, string];
      buildValue: (identity: NonNullable<BwItem['identity']>) => string;
    }
  | { label: string; key: string };

const IDENTITY_ACTION_SPECS: IdentityActionSpec[] = [
  {
    label: 'Copy Name',
    keys: ['firstName' as const, 'lastName' as const],
    buildValue: (identity: NonNullable<BwItem['identity']>) =>
      `${identity.firstName} ${identity.lastName}`,
  },
  { label: 'Copy Email', key: 'email' as const },
  { label: 'Copy Phone', key: 'phone' as const },
];

function getIdentityActions(identity: BwItem['identity']): ItemAction[] {
  const actions: ItemAction[] = [];
  if (!identity) return actions;
  for (const spec of IDENTITY_ACTION_SPECS) {
    if ('keys' in spec) {
      if (
        identity[spec.keys[0] as keyof typeof identity] &&
        identity[spec.keys[1] as keyof typeof identity]
      ) {
        actions.push({ label: spec.label, value: spec.buildValue(identity) });
      }
    } else {
      const val = identity[spec.key as keyof typeof identity];
      if (val) actions.push({ label: spec.label, value: val });
    }
  }
  return actions;
}

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
