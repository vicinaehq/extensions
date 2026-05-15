import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SendType, type BwSend } from '../send-types';

const mockBw = vi.hoisted(() => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

const mockPop = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockClipboardCopy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowToast = vi.hoisted(() => vi.fn());
const mockResolveSendUrl = vi.hoisted(() => vi.fn());
const mockDeleteSendWithConfirm = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => mockBw);

vi.mock('../toast', () => ({
  showFailureToast: async (_err: unknown, title: string) =>
    mockShowToast({ style: 'failure', title }),
}));

vi.mock('../send-utils', () => ({
  buildDeletionCountdown: () => '',
  buildExpirationCountdown: () => '',
  deleteSendWithConfirm: (...args: unknown[]) => mockDeleteSendWithConfirm(...args),
  filterSends: (s: BwSend[]) => s,
  getSendActions: () => [{ label: 'Copy Send Link', value: 'https://send/url' }],
  resolveSendUrl: (...args: unknown[]) => mockResolveSendUrl(...args),
  SEND_LINK_ACTION_LABEL: 'Copy Send Link',
  sendAccessUrl: () => 'https://send/initial',
  sendActionIcon: () => 'icon',
  sendIcon: () => 'icon',
  sendSubtitle: () => '',
  sendTypeLabel: (s: BwSend) => (s.type === SendType.Text ? 'Text' : 'File'),
}));

vi.mock('../use-session', () => ({ useSession: vi.fn() }));
vi.mock('../vault-cache', () => ({
  loadCachedSends: vi.fn(),
  saveCachedSends: vi.fn(),
}));
vi.mock('../unlock-gate', () => ({
  castGateSetter: vi.fn(),
  renderGate: vi.fn(),
  useGateEffects: vi.fn(),
}));

vi.mock('../edit-send', () => ({
  default: () => React.createElement('div', { 'data-testid': 'edit-send' }),
}));

vi.mock('@vicinae/api', () => {
  const Detail: any = ({ markdown, metadata, actions, navigationTitle }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'detail', 'data-title': navigationTitle },
      React.createElement('div', { 'data-testid': 'markdown' }, markdown),
      metadata,
      actions,
    );
  Detail.Metadata = ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'metadata' }, children);
  Detail.Metadata.Label = ({ title, text }: any) =>
    React.createElement(
      'div',
      { 'data-testid': `meta-${title}` },
      React.createElement('span', { 'data-testid': `meta-${title}-text` }, text),
    );
  Detail.Metadata.Separator = () => React.createElement('hr');

  const Action = Object.assign(createActionMock(), {
    CopyToClipboard: ({ title, content }: any) =>
      React.createElement(
        'button',
        {
          'data-testid': `copy-${title.replace(/\s+/g, '-').toLowerCase()}`,
          onClick: () => mockClipboardCopy(content),
        },
        title,
      ),
  });

  const ActionPanel = ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children);

  return {
    Action,
    ActionPanel,
    Clipboard: { copy: mockClipboardCopy },
    Detail,
    Icon: {
      Pencil: 'p',
      Trash: 't',
      Eye: 'eye',
      EyeDisabled: 'eye-off',
      Globe01: 'g',
      Link: 'l',
      CopyClipboard: 'c',
    },
    List: () => null,
    showToast: (...args: unknown[]) => mockShowToast(...args),
    Toast: { Style: { Success: 'success', Failure: 'failure' } },
    useNavigation: () => ({ pop: mockPop, push: mockPush }),
  };
});

import { createActionMock } from './__utils__/vicinae-mocks';
import { SendDetailView } from '../search-sends';

function makeSend(overrides: Partial<BwSend> = {}): BwSend {
  return {
    id: 'send-1',
    accessId: 'a',
    key: 'k',
    name: 'A Send',
    notes: null,
    type: SendType.Text,
    password: null,
    text: { text: 'body', hidden: false },
    file: null,
    maxAccessCount: null,
    accessCount: 0,
    deletionDate: new Date('2030-01-01').toISOString(),
    expirationDate: null,
    creationDate: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    disabled: false,
    hideEmail: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSendUrl.mockResolvedValue('https://send/resolved');
});

describe('SendDetailView', () => {
  it('renders text body in the markdown for Text sends', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ text: { text: 'visible body', hidden: false } }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('markdown').textContent).toContain('visible body');
    });
  });

  it('appends a Notes section under a separator when notes are present', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ notes: 'extra note', text: { text: 'body', hidden: false } }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      const md = screen.getByTestId('markdown').textContent ?? '';
      expect(md).toContain('body');
      expect(md).toContain('---');
      expect(md).toContain('## Notes');
      expect(md).toContain('extra note');
    });
  });

  it('shows access count alone when there is no max', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ accessCount: 3, maxAccessCount: null }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('meta-Access Count-text').textContent).toBe('3');
    });
  });

  it('shows N / M access count when max is set', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ accessCount: 2, maxAccessCount: 5 }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('meta-Access Count-text').textContent).toBe('2 / 5');
    });
  });

  it('masks the password to the same length and reveals it via Show Password', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ password: 'shhh' }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('meta-Password-text').textContent).toBe('••••');
    });

    fireEvent.click(screen.getByTestId('action-show-password'));
    await waitFor(() => {
      expect(screen.getByTestId('meta-Password-text').textContent).toBe('shhh');
    });
  });

  it('does not render a Password row or toggle when send has no password', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend({ password: null }),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => screen.getByTestId('detail'));
    expect(screen.queryByTestId('meta-Password')).toBeNull();
    expect(screen.queryByTestId('action-show-password')).toBeNull();
  });

  it('hides Edit/Delete when there is no session', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend(),
        session: null,
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => screen.getByTestId('detail'));
    expect(screen.queryByTestId('action-edit-send')).toBeNull();
    expect(screen.queryByTestId('action-delete-send')).toBeNull();
  });

  it('pushes EditSend on Edit Send action', async () => {
    render(
      React.createElement(SendDetailView, {
        send: makeSend(),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => screen.getByTestId('action-edit-send'));
    fireEvent.click(screen.getByTestId('action-edit-send'));
    expect(mockPush).toHaveBeenCalled();
  });

  it('delegates delete to deleteSendWithConfirm and pops on success', async () => {
    mockDeleteSendWithConfirm.mockImplementation(
      async (_send: BwSend, _session: string, onSuccess: () => Promise<void>) => {
        await onSuccess();
      },
    );
    const onDeleted = vi.fn();
    render(React.createElement(SendDetailView, { send: makeSend(), session: 'token', onDeleted }));
    await waitFor(() => screen.getByTestId('action-delete-send'));
    fireEvent.click(screen.getByTestId('action-delete-send'));
    await waitFor(() => {
      expect(mockDeleteSendWithConfirm).toHaveBeenCalled();
      expect(onDeleted).toHaveBeenCalled();
      expect(mockPop).toHaveBeenCalled();
    });
  });

  it('updates the URL row from resolveSendUrl after mount', async () => {
    mockResolveSendUrl.mockResolvedValue('https://send/with-key');
    render(
      React.createElement(SendDetailView, {
        send: makeSend(),
        session: 'token',
        onDeleted: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('meta-URL-text').textContent).toBe('https://send/with-key');
    });
  });
});
