import { Alert, confirmAlert, Icon, showToast, Toast } from '@vicinae/api';
import type { Image } from '@vicinae/api';
import { SendType } from './send-types';
import type { BwSend, CreateSendPayload, SendAction, SendTypeValue } from './send-types';
import * as bw from './bw-executor';
import { showFailureToast } from './item-utils';
import { buildIcon } from './item-icons';
import { getPreferences, getServerUrl } from './preferences';
import { trimToNull } from './item-utils';

export function filterSends(sends: BwSend[], query: string): BwSend[] {
  if (!query.trim()) return sends;
  const lower = query.toLowerCase();
  return sends.filter((send) => send.name.toLowerCase().includes(lower));
}

export function sendTypeLabel(send: BwSend): string {
  return send.type === SendType.File ? 'File' : 'Text';
}

export async function deleteSendWithConfirm(
  send: { id: string; name: string },
  session: bw.Session | null,
  onSuccess: () => void,
): Promise<void> {
  if (!session) return;
  const confirmed = await confirmAlert({
    title: 'Delete Send',
    message: `Are you sure you want to delete "${send.name}"?`,
    primaryAction: { title: 'Delete', style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return;
  try {
    await bw.deleteSend(send.id, session);
    await showToast({ style: Toast.Style.Success, title: 'Send deleted', message: send.name });
    onSuccess();
  } catch (err) {
    await showFailureToast(err, 'Delete failed');
  }
}

export function sendSubtitle(send: BwSend): string {
  if (send.type === SendType.File && send.file?.fileName) {
    return `File: ${send.file.fileName}`;
  }
  if (send.type === SendType.Text && send.text?.text && !send.text.hidden) {
    const preview = send.text.text.slice(0, 50);
    return send.text.text.length > 50 ? `${preview}…` : preview;
  }
  return sendTypeLabel(send);
}

export function getSendActions(send: BwSend): SendAction[] {
  const actions: SendAction[] = [{ label: 'Copy Send Link', value: sendAccessUrl(send) }];
  if (send.type === SendType.Text && send.text?.text) {
    actions.push({ label: 'Copy Text', value: send.text.text });
  }
  return actions;
}

export function sendActionIcon(action: { label: string }): Image.ImageLike | undefined {
  switch (action.label) {
    case 'Copy Send Link':
      return Icon.Link;
    case 'Copy Text':
      return Icon.CopyClipboard;
    default:
      return undefined;
  }
}

export function sendAccessUrl(send: BwSend): string {
  try {
    const prefs = getPreferences();
    const serverUrl = getServerUrl(prefs);
    const base = serverUrl.replace(/\/+$/, '');
    return `${base}/#/send/${send.accessId}`;
  } catch {
    return `https://vault.bitwarden.com/#/send/${send.accessId}`;
  }
}

export function daysUntilDeletion(send: BwSend): number | null {
  if (!send.deletionDate) return null;
  const now = Date.now();
  const deletion = new Date(send.deletionDate).getTime();
  if (isNaN(deletion)) return null;
  const diff = deletion - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function buildDeletionCountdown(send: BwSend): string {
  const days = daysUntilDeletion(send);
  if (days === null) return '';
  if (days === 0) return 'Today';
  return `${days}d`;
}

export function buildExpirationCountdown(send: BwSend): string {
  if (!send.expirationDate) return '';
  const now = Date.now();
  const expiration = new Date(send.expirationDate).getTime();
  if (isNaN(expiration)) return '';
  const diff = expiration - now;
  if (diff <= 0) return 'Expired';
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  const days = Math.ceil(hours / 24);
  return `${days}d`;
}

export const HOURS_OPTIONS = [
  { value: '1', title: '1 hour' },
  { value: '6', title: '6 hours' },
  { value: '12', title: '12 hours' },
  { value: '24', title: '1 day' },
  { value: '48', title: '2 days' },
  { value: '168', title: '7 days' },
  { value: '336', title: '14 days' },
  { value: '720', title: '30 days' },
  { value: '0', title: 'Never' },
];

export const EDIT_HOURS_OPTIONS = [{ value: '-1', title: 'Keep existing' }, ...HOURS_OPTIONS];

export function toSendPayload(
  formValues: Record<string, string>,
  type: SendTypeValue,
): CreateSendPayload {
  const password = trimToNull(formValues.password);
  const notes = trimToNull(formValues.notes);
  let maxAccessCount: number | null = null;
  if (formValues.maxAccessCount?.trim()) {
    const raw = Number(formValues.maxAccessCount);
    if (!isNaN(raw)) maxAccessCount = raw;
  }

  let deletionDate: string | null = null;
  if (
    formValues.deletionHours &&
    formValues.deletionHours !== '0' &&
    formValues.deletionHours !== '-1'
  ) {
    const hours = Number(formValues.deletionHours) || 0;
    deletionDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  let expirationDate: string | null = null;
  if (
    formValues.expirationHours &&
    formValues.expirationHours !== '0' &&
    formValues.expirationHours !== '-1'
  ) {
    const hours = Number(formValues.expirationHours) || 0;
    expirationDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  const text =
    type === SendType.Text
      ? {
          text: formValues.textContent ?? '',
          hidden: formValues.hideText === 'true',
        }
      : null;

  const file =
    type === SendType.File
      ? {
          fileName: formValues.fileName ?? '',
        }
      : null;

  return {
    name: formValues.name ?? '',
    type,
    notes,
    disabled: formValues.disabled === 'true',
    hideEmail: formValues.hideEmail === 'true',
    password,
    maxAccessCount,
    deletionDate,
    expirationDate,
    text,
    file,
  };
}

const SEND_ICON_PATHS: Record<SendTypeValue, string> = {
  [SendType.Text]:
    'M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.25v-8.5A1.75 1.75 0 0 0 12.25 2zm.75 2.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1 0-1.5m0 3h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5',
  [SendType.File]:
    'M5 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5.414a1.5 1.5 0 0 0-.44-1.06L9.647 1.439A1.5 1.5 0 0 0 8.586 1zm.5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5M6 6h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1 0-1m0 2h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1 0-1m0 2h3a.5.5 0 0 1 0 1H6a.5.5 0 0 1 0-1',
};

const SEND_ICON_COLORS: Record<SendTypeValue, { light: string; dark: string }> = {
  [SendType.Text]: { light: '#1F6FEB', dark: '#2F6FED' },
  [SendType.File]: { light: '#3A9C61', dark: '#3A9C61' },
};

export function sendIcon(type: SendTypeValue): Image.ImageLike {
  return buildIcon(SEND_ICON_PATHS[type], SEND_ICON_COLORS[type]);
}
