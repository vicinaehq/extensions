import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SearchTotp from '../search-totp';
import type { BwItem } from '../bitwarden-types';
import { ItemType } from '../bitwarden-types';
import { makeItem } from './__utils__/test-data';

const mockBw = vi.hoisted(() => ({
  getTotp: vi.fn(),
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

// fallow-ignore-next-line code-duplication
const mockClipboardCopy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => ({
  ...mockBw,
  getErrorMessage: mockBw.getErrorMessage,
}));

vi.mock('../item-utils', () => ({
  formatTotp: (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`,
  itemIcon: () => ({ source: 'icon.png' }),
  itemSubtitle: (item: BwItem) => item.login?.username ?? '',
  filterItems: (items: BwItem[], query: string) =>
    query ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())) : items,
  groupByFolder: (items: BwItem[]) => {
    const map = new Map();
    if (items.length > 0) map.set('f1', { folderName: 'Work', items });
    return map;
  },
}));

let mockGateRender: React.ReactElement | null = null;
let mockEmptyVault = false;

vi.mock('../use-vault-search', () => ({
  useVaultSearch: (preFilter?: (items: BwItem[]) => BwItem[]) => {
    const allItems: BwItem[] = [
      makeItem({
        id: '1',
        folderId: 'f1',
        name: 'GitHub',
        login: { username: 'gh-user', password: '', totp: 'JBSWY3DPEHPK3PXP' },
      }),
      makeItem({
        id: '2',
        folderId: 'f1',
        name: 'Email',
        login: { username: null, password: '', totp: null },
      }),
      makeItem({ id: '3', type: ItemType.SecureNote, name: 'My Note' }),
    ];
    const filtered = preFilter ? preFilter(allItems) : allItems;

    const base = {
      state: { kind: 'vault' as const, items: allItems, folders: [{ id: 'f1', name: 'Work' }] },
      session: 'token',
      searchText: '',
      setSearchText: vi.fn() as (text: string) => void,
      faviconMap: {} as Record<string, string>,
      handleSync: vi.fn(),
      handleCopyTotp: vi.fn(),
      gateRender: mockGateRender,
      isLoading: false,
    };

    return {
      ...base,
      sortedSections: mockEmptyVault
        ? []
        : filtered.length > 0
          ? [['f1', { folderName: 'Work', items: filtered }] as const]
          : [],
    };
  },
}));

vi.mock('@vicinae/api', () => ({
  Action: ({ title, onAction }: { title: string; onAction?: () => void }) =>
    React.createElement(
      'button',
      { 'data-testid': `action-${title.replace(/\s+/g, '-').toLowerCase()}`, onClick: onAction },
      title,
    ),
  ActionPanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children),
  Clipboard: { copy: (...args: unknown[]) => mockClipboardCopy(...args) },
  Icon: { ArrowClockwise: 'sync', CopyClipboard: 'copy' },
  List: Object.assign(
    ({
      children,
      isLoading,
      onSearchTextChange,
      searchBarPlaceholder,
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      onSearchTextChange?: (text: string) => void;
      searchBarPlaceholder?: string;
      throttle?: boolean;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'list',
          'data-isloading': isLoading,
          'data-placeholder': searchBarPlaceholder,
        },
        children,
      ),
    {
      Section: ({ children, title }: { children: React.ReactNode; title: string }) =>
        React.createElement('div', { 'data-testid': `section-${title}` }, children),
      Item: Object.assign(
        ({
          title,
          subtitle,
          accessories,
          icon,
          actions,
        }: {
          title: string;
          subtitle?: string;
          accessories?: { text: string }[];
          icon?: unknown;
          actions: React.ReactNode;
        }) =>
          React.createElement(
            'div',
            { 'data-testid': `item-${title}` },
            React.createElement('span', { 'data-testid': `item-title-${title}` }, title),
            subtitle
              ? React.createElement('span', { 'data-testid': `item-subtitle-${title}` }, subtitle)
              : null,
            accessories?.map((a, i) =>
              React.createElement(
                'span',
                { key: i, 'data-testid': `item-accessory-${title}-${i}` },
                a.text,
              ),
            ),
            actions,
          ),
        {
          Accessory: ({ text }: { text: string }) =>
            React.createElement('span', { 'data-testid': 'accessory' }, text),
        },
      ),
      EmptyView: ({ title, description }: { title: string; description?: string }) =>
        React.createElement(
          'div',
          { 'data-testid': 'empty-view' },
          React.createElement('div', null, title),
          description ? React.createElement('div', null, description) : null,
        ),
    },
  ),
  showToast: (...args: unknown[]) => mockShowToast(...args),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGateRender = null;
  mockEmptyVault = false;
  mockBw.getTotp.mockResolvedValue('123456');
});

afterEach(() => {
  mockGateRender = null;
  mockEmptyVault = false;
});

// ---------------------------------------------------------------------------
// SearchTotp
// ---------------------------------------------------------------------------
describe('SearchTotp', () => {
  it('renders section and items for totp accounts', async () => {
    render(React.createElement(SearchTotp));

    await waitFor(() => {
      expect(screen.getByTestId('section-Work')).toBeTruthy();
      expect(screen.getByTestId('item-GitHub')).toBeTruthy();
    });

    // GitHub has totp, should be shown
    expect(screen.getByTestId('item-subtitle-GitHub').textContent).toBe('gh-user');

    // Email has no totp, should not appear
    expect(screen.queryByTestId('item-Email')).toBeNull();

    // SecureNote should not appear
    expect(screen.queryByTestId('item-My Note')).toBeNull();
  });

  it('shows empty view when no totp items exist', async () => {
    mockEmptyVault = true;

    render(React.createElement(SearchTotp));

    await waitFor(() => {
      expect(screen.getByTestId('empty-view')).toBeTruthy();
    });
  });

  it('shows Loading... accessory before TOTP codes arrive', async () => {
    mockBw.getTotp.mockReturnValue(new Promise(() => {})); // never resolves

    render(React.createElement(SearchTotp));

    await waitFor(() => {
      expect(screen.getByTestId('item-GitHub')).toBeTruthy();
    });

    // Should show "Loading..." in accessories
    const accessory = screen.getByTestId('item-accessory-GitHub-0');
    expect(accessory.textContent).toBe('Loading...');
  });

  it('displays TOTP code and countdown when codes arrive', async () => {
    mockBw.getTotp.mockResolvedValue('123456');

    render(React.createElement(SearchTotp));

    await waitFor(() => {
      const accessory = screen.getByTestId('item-accessory-GitHub-0');
      expect(accessory.textContent).toBe('123 456');
    });
  });

  it('shows Copy TOTP and Sync Vault actions', async () => {
    render(React.createElement(SearchTotp));

    await waitFor(() => {
      expect(screen.getByTestId('action-copy-totp')).toBeTruthy();
      expect(screen.getByTestId('action-sync-vault')).toBeTruthy();
    });
  });
});
