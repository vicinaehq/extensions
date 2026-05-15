import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ItemDetailView, { renderItemActionElements } from '../item-detail-view';
import type { BwItem } from '../bitwarden-types';
import type { ItemAction } from '../bw-executor';
import { makeItem } from './__utils__/test-data';

const { mockBw, mockPop } = vi.hoisted(() => {
  const mockBw = {
    getItem: vi.fn(),
    getTotp: vi.fn(),
    downloadAttachment: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  };

  const mockPop = vi.fn();

  return { mockBw, mockPop };
});

const mockClipboardCopy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowToast = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => ({
  ...mockBw,
  getErrorMessage: mockBw.getErrorMessage,
}));

vi.mock('../use-totp-secrets', () => ({
  useTotpSecrets: () => ({}),
}));

vi.mock('../totp-compute', () => ({
  computeLocalTotp: () => null,
  isSteamSecret: () => false,
}));

vi.mock('../item-form', () => ({
  buildItemDetailMarkdown: (item: BwItem) => (item.notes ? item.notes : ''),
}));

vi.mock('../item-list', () => ({
  formatTotp: (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`,
  itemTypeLabel: () => 'Login',
}));

vi.mock('../item-actions', () => ({
  itemActions: (item: BwItem): ItemAction[] => {
    const actions: ItemAction[] = [];
    if (item.login?.username) actions.push({ label: 'Copy Username', value: item.login.username });
    if (item.login?.password) actions.push({ label: 'Copy Password', value: item.login.password });
    if (item.login?.totp)
      actions.push({ label: 'Copy Verification Code', value: '', fetchKind: 'totp' });
    return actions;
  },
  actionIcon: () => undefined,
}));

// fallow-ignore-next-line unresolved-import
vi.mock('./edit-item', () => ({
  default: () => React.createElement('div', { 'data-testid': 'edit-item' }),
}));

vi.mock('@vicinae/api', () => ({
  Action: Object.assign(
    ({ title, icon, onAction }: { title: string; icon?: string; onAction?: () => void }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': `action-${title.replace(/\s+/g, '-').toLowerCase()}`,
          onClick: onAction,
        },
        title,
      ),
    {
      CopyToClipboard: ({ title, content }: { title: string; content: string }) =>
        React.createElement(
          'button',
          { 'data-testid': `copy-${title.replace(/\s+/g, '-').toLowerCase()}`, title: content },
          title,
        ),
      OpenInBrowser: ({ title, url }: { title: string; url: string }) =>
        React.createElement('a', { 'data-testid': 'open-url', href: url }, title),
      SubmitForm: () => null,
      Style: { Destructive: 'destructive' },
    },
  ),
  ActionPanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children),
  Clipboard: { copy: (...args: unknown[]) => mockClipboardCopy(...args) },
  Detail: Object.assign(
    ({
      markdown,
      actions,
      metadata,
    }: {
      markdown: string;
      actions: React.ReactNode;
      metadata: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'detail-view' },
        React.createElement('div', { 'data-testid': 'markdown' }, markdown),
        React.createElement('div', { 'data-testid': 'metadata-wrapper' }, metadata),
        actions,
      ),
    {
      Metadata: Object.assign(
        ({ children }: { children: React.ReactNode }) =>
          React.createElement('div', { 'data-testid': 'metadata' }, children),
        {
          Label: ({ title, text }: { title: string; text: string }) =>
            React.createElement(
              'span',
              { 'data-testid': `metadata-${title.replace(/\s+/g, '-').toLowerCase()}` },
              `${title}: ${text}`,
            ),
          Separator: () => React.createElement('hr', { 'data-testid': 'metadata-separator' }),
        },
      ),
    },
  ),
  Icon: {
    ArrowLeft: 'arrow-left',
    CopyClipboard: 'copy',
    Eye: 'eye',
    Globe01: 'globe',
    Pencil: 'pencil',
    SaveDocument: 'save',
  },
  showToast: (...args: unknown[]) => mockShowToast(...args),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
  useNavigation: () => ({ pop: mockPop, push: mockPush }),
}));

function loginItem(overrides: Partial<BwItem> = {}): BwItem {
  return makeItem({
    login: { username: 'user', password: 'pass', totp: 'JBSWY3DPEHPK3PXP' },
    ...overrides,
  });
}

function renderDetail(session: string | null = 'token', notes?: string) {
  const item = loginItem(notes ? { notes } : {});
  mockBw.getItem.mockResolvedValue(item);
  render(
    React.createElement(ItemDetailView, {
      item: loginItem(),
      session,
      onCopyTotp: vi.fn(),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPop.mockReset();
  mockPush.mockReset();
});

// ---------------------------------------------------------------------------
// renderItemActionElements
// ---------------------------------------------------------------------------
describe('renderItemActionElements', () => {
  const simpleItems: ItemAction[] = [
    { label: 'Copy Username', value: 'alice' },
    { label: 'Copy Password', value: 'secret' },
  ];

  it('renders CopyToClipboard actions for simple values', () => {
    const elements = renderItemActionElements(simpleItems, vi.fn(), 'item-1', null);
    expect(elements).toHaveLength(2);
  });

  it('renders TOTP action that calls onCopyTotp', () => {
    const onCopyTotp = vi.fn();
    const totpItem: ItemAction = { label: 'Copy Verification Code', value: '', fetchKind: 'totp' };
    const elements = renderItemActionElements([totpItem], onCopyTotp, 'item-1', 'session');
    expect(elements).toHaveLength(1);
  });

  it('renders OpenInBrowser action', () => {
    const urlItem: ItemAction = { label: 'Open URL', value: 'https://example.com' };
    const elements = renderItemActionElements([urlItem], vi.fn(), 'item-1', null);
    expect(elements).toHaveLength(1);
  });

  it('renders fetch-based actions that resolve with getItem', () => {
    const fetchItem: ItemAction = { label: 'Copy Card Number', value: '', fetchKind: 'cardNumber' };
    const elements = renderItemActionElements([fetchItem], vi.fn(), 'item-1', 'token');
    expect(elements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ItemDetailView component
// ---------------------------------------------------------------------------
describe('ItemDetailView', () => {
  it('shows loading state with only Back action', async () => {
    mockBw.getItem.mockReturnValue(new Promise(() => {}));

    render(
      React.createElement(ItemDetailView, {
        item: loginItem(),
        session: 'token',
        onCopyTotp: vi.fn(),
      }),
    );

    expect(screen.getByTestId('markdown').textContent).toBe('Loading...');
    expect(screen.getByTestId('action-back')).toBeTruthy();
    expect(screen.queryByTestId('action-edit-item')).toBeNull();
  });

  it('shows content immediately when session is null', async () => {
    const item = loginItem({ notes: 'some note' });

    render(
      React.createElement(ItemDetailView, {
        item,
        session: null,
        onCopyTotp: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('markdown').textContent).toBe('some note');
    });
  });

  it('fetches item and shows content after loading', async () => {
    renderDetail('token', 'My notes');

    await waitFor(() => {
      expect(mockBw.getItem).toHaveBeenCalledWith('item-1', 'token');
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown').textContent).toBe('My notes');
    });
  });

  it('falls back to partial item when getItem fails', async () => {
    mockBw.getItem.mockRejectedValue(new Error('not found'));
    render(
      React.createElement(ItemDetailView, {
        item: loginItem(),
        session: 'token',
        onCopyTotp: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-view')).toBeTruthy();
    });
    expect(screen.getByTestId('markdown').textContent).not.toBe('Loading...');
  });

  it('shows full action panel after loading', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('action-edit-item')).toBeTruthy();
    });
  });

  it('fetches TOTP codes when item has totp', async () => {
    mockBw.getTotp.mockResolvedValue('123456');
    renderDetail();

    await waitFor(() => {
      expect(mockBw.getTotp).toHaveBeenCalledWith('item-1', 'token');
    });
  });

  it('navigates to edit view', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('action-edit-item')).toBeTruthy();
    });

    screen.getByTestId('action-edit-item').click();

    expect(mockPush).toHaveBeenCalled();
  });
});
