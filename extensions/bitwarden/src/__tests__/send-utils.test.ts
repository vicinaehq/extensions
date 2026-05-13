import { describe, expect, it, vi } from 'vitest';
import {
  buildDeletionCountdown,
  daysUntilDeletion,
  filterSends,
  sendAccessUrl,
  getSendActions,
  sendSubtitle,
  sendTypeLabel,
  toSendPayload,
} from '../send-utils';
import { SendType } from '../send-types';
import type { BwSend } from '../send-types';

const mockPrefs = {
  serverRegion: 'bitwarden.com' as const,
  customServerUrl: '',
  customCertPath: '',
  bitwardenApiClientId: '',
  bitwardenApiClientSecret: '',
  autoLockTimeout: '21600',
  downloadDir: '',
  passwordLength: '20',
  passwordUppercase: true,
  passwordLowercase: true,
  passwordNumbers: true,
  passwordSymbols: true,
};

vi.mock('@vicinae/api', () => ({
  getPreferenceValues: () => mockPrefs,
  Icon: {},
}));

function makeSend(overrides: Partial<BwSend> = {}): BwSend {
  return {
    id: 'send-1',
    accessId: 'abc123',
    key: 'def456',
    name: 'Test Send',
    notes: null,
    type: SendType.Text,
    password: null,
    text: { text: 'hello world', hidden: false },
    file: null,
    maxAccessCount: null,
    accessCount: 0,
    deletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    expirationDate: null,
    creationDate: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    disabled: false,
    hideEmail: false,
    ...overrides,
  };
}

describe('filterSends', () => {
  const sends: BwSend[] = [
    makeSend({ id: '1', name: 'Alpha' }),
    makeSend({ id: '2', name: 'Beta' }),
    makeSend({ id: '3', name: 'Alphabet Soup' }),
  ];

  it('returns all sends when query is empty', () => {
    expect(filterSends(sends, '')).toHaveLength(3);
    expect(filterSends(sends, '  ')).toHaveLength(3);
  });

  it('returns matching sends case-insensitively', () => {
    expect(filterSends(sends, 'ALPHA')).toHaveLength(2);
    expect(filterSends(sends, 'beta')).toHaveLength(1);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterSends(sends, 'gamma')).toHaveLength(0);
  });
});

describe('sendTypeLabel', () => {
  it('returns "Text" for Text sends', () => {
    expect(sendTypeLabel(makeSend({ type: SendType.Text }))).toBe('Text');
  });

  it('returns "File" for File sends', () => {
    expect(sendTypeLabel(makeSend({ type: SendType.File }))).toBe('File');
  });
});

describe('sendSubtitle', () => {
  it('returns file name for File sends', () => {
    const send = makeSend({
      type: SendType.File,
      text: null,
      file: { id: 'f1', fileName: 'report.pdf', size: 1024, sizeName: '1 KB' },
    });
    expect(sendSubtitle(send)).toBe('File: report.pdf');
  });

  it('returns text preview for Text sends', () => {
    const send = makeSend({ type: SendType.Text, text: { text: 'hello world', hidden: false } });
    expect(sendSubtitle(send)).toBe('hello world');
  });

  it('returns type label when send has no content', () => {
    const send = makeSend({ type: SendType.Text, text: null });
    expect(sendSubtitle(send)).toBe('Text');
  });
});

describe('getSendActions', () => {
  it('always includes Copy Send Link', () => {
    const actions = getSendActions(makeSend());
    expect(actions.some((a) => a.label === 'Copy Send Link')).toBe(true);
  });

  it('includes Copy Text for Text sends with content', () => {
    const actions = getSendActions(
      makeSend({ type: SendType.Text, text: { text: 'secret', hidden: false } }),
    );
    expect(actions.some((a) => a.label === 'Copy Text')).toBe(true);
  });

  it('does not include Copy Text for File sends', () => {
    const send = makeSend({
      type: SendType.File,
      text: null,
      file: { id: 'f1', fileName: 'x.pdf', size: 0, sizeName: '0 B' },
    });
    const actions = getSendActions(send);
    expect(actions.some((a) => a.label === 'Copy Text')).toBe(false);
  });
});

describe('sendAccessUrl', () => {
  it('builds URL from server config', () => {
    const url = sendAccessUrl(makeSend({ accessId: 'abc123', key: 'def456' }));
    expect(url).toBe('https://bitwarden.com/#/send/abc123/def456');
  });
});

describe('daysUntilDeletion', () => {
  it('returns days until deletion date', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilDeletion(makeSend({ deletionDate: future }))).toBe(3);
  });

  it('returns 0 for past deletion date', () => {
    const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilDeletion(makeSend({ deletionDate: past }))).toBe(0);
  });

  it('returns null when no deletion date', () => {
    const send = makeSend({ deletionDate: '' });
    expect(daysUntilDeletion(send)).toBeNull();
  });
});

describe('buildDeletionCountdown', () => {
  it('returns formatted days', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(buildDeletionCountdown(makeSend({ deletionDate: future }))).toBe('3d');
  });

  it('returns "Today" for 0 days', () => {
    const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(buildDeletionCountdown(makeSend({ deletionDate: past }))).toBe('Today');
  });
});

describe('toSendPayload', () => {
  it('builds basic Text send payload', () => {
    const payload = toSendPayload(
      { name: 'My Send', textContent: 'hello', deletionDays: '3', hideText: 'true' },
      SendType.Text,
    );
    expect(payload.name).toBe('My Send');
    expect(payload.type).toBe(SendType.Text);
    expect(payload.text?.text).toBe('hello');
    expect(payload.text?.hidden).toBe(true);
    expect(payload.file).toBeNull();
  });

  it('builds basic File send payload', () => {
    const payload = toSendPayload(
      { name: 'My File', filePath: '/home/user/docs/doc.pdf', deletionDays: '5' },
      SendType.File,
    );
    expect(payload.type).toBe(SendType.File);
    expect(payload.file?.fileName).toBe('doc.pdf');
    expect(payload.text).toBeNull();
  });

  it('sets deletionDate from deletionHours', () => {
    const payload = toSendPayload({ name: 'Test', deletionHours: '168' }, SendType.Text);
    const expectedDate = new Date(Date.now() + 168 * 60 * 60 * 1000).toISOString();
    expect(payload.deletionDate?.slice(0, 10)).toBe(expectedDate.slice(0, 10));
  });

  it('handles optional maxAccessCount', () => {
    const payload = toSendPayload({ name: 'Test', maxAccessCount: '10' }, SendType.Text);
    expect(payload.maxAccessCount).toBe(10);
  });

  it('handles password', () => {
    const payload = toSendPayload({ name: 'Test', password: 'secret' }, SendType.Text);
    expect(payload.password).toBe('secret');
  });
});
