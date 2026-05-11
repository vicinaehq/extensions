import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { makeFormMock } from './__utils__/vicinae-mocks';

// ---------------------------------------------------------------------------
// Hoisted mock values
// ---------------------------------------------------------------------------
const { mockUseSession } = vi.hoisted(() => {
  const mockUseSession = {
    session: null as string | null,
    unlock: vi.fn(),
    clearSession: vi.fn(),
    loginIfNeeded: vi.fn(),
    isLoggingIn: false,
    loginError: null as string | null,
  };
  return { mockUseSession };
});

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------
vi.mock('@vicinae/api', () => ({
  Action: {
    SubmitForm: 'Action.SubmitForm',
    CopyToClipboard: 'Action.CopyToClipboard',
    OpenInBrowser: 'Action.OpenInBrowser',
    Style: { Destructive: 'destructive' },
  },
  ActionPanel: 'ActionPanel',
  Clipboard: { copy: vi.fn() },
  Icon: {
    ArrowClockwise: 'icon-arrow',
    Lock: 'icon-lock',
    Eye: 'icon-eye',
    CopyClipboard: 'icon-copy',
    Globe01: 'icon-globe',
    Key: 'icon-key',
    Person: 'icon-person',
    CreditCard: 'icon-cc',
    Envelope: 'icon-envelope',
    Phone: 'icon-phone',
    Trash: 'icon-trash',
  },
  List: Object.assign(
    function List({ children }: { children: React.ReactNode }) {
      return React.createElement('div', { 'data-testid': 'list' }, children);
    },
    {
      Item(props: { title: string }) {
        return React.createElement('div', { 'data-testid': 'list-item' }, props.title);
      },
      Section(props: { children: React.ReactNode }) {
        return React.createElement('div', { 'data-testid': 'list-section' }, props.children);
      },
      EmptyView(props: { title: string }) {
        return React.createElement('div', { 'data-testid': 'list-empty' }, props.title);
      },
    },
  ),
  Form: makeFormMock(),
  showToast: vi.fn(),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
  useNavigation: () => ({ push: vi.fn() }),
}));

vi.mock('../bw-executor', () => ({
  checkInstalled: () => true,
  status: () => ({ status: 'unlocked' }),
  unlock: vi.fn(),
  login: vi.fn(),
  sync: vi.fn(),
  listItems: () => [],
  listFolders: () => [],
  getItem: vi.fn(),
  getTotp: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  logout: vi.fn(),
  lock: vi.fn(),
}));

vi.mock('../vault-cache', () => ({
  loadCachedVault: () => null,
  saveCachedVault: vi.fn(),
  clearCachedVault: vi.fn(),
}));

vi.mock('../item-utils', () => ({
  buildItemDetailMarkdown: () => '',
  filterItems: (items: unknown[]) => items,
  itemActions: () => [],
  groupByFolder: () => new Map(),
  itemIcon: () => 'key',
  itemSubtitle: () => undefined,
  itemTypeLabel: () => 'Login',
}));

vi.mock('../use-session', () => ({
  useSession: () => mockUseSession,
}));

vi.mock('../unlock-gate', () => ({
  checkBwGate: (session: string | null) => (session ? { kind: 'ready' } : { kind: 'needs-unlock' }),
  createUnlockCallbacks: (_setState: unknown, onUnlockReady: () => void) => ({
    onUnlockStart: vi.fn(),
    onUnlockReady,
    onUnlockError: vi.fn(),
    onLoginReady: vi.fn(),
    onLoginError: vi.fn(),
  }),
  renderUnlockGate: (kind: string) => {
    if (kind === 'bw-not-installed')
      return React.createElement('div', { 'data-testid': 'bw-not-installed' }, 'BW Not Installed');
    if (kind === 'secret-tool-not-installed')
      return React.createElement(
        'div',
        { 'data-testid': 'secret-tool-not-installed' },
        'Install libsecret',
      );
    if (kind === 'needs-unlock' || kind === 'unlocking') {
      return React.createElement(
        'form',
        { 'data-testid': 'unlock-form' },
        React.createElement('h2', null, 'Unlock'),
      );
    }
    return null;
  },
  renderGate: (state: { kind: string; error?: string }) => {
    if (state.kind === 'bw-not-installed')
      return React.createElement('div', { 'data-testid': 'bw-not-installed' }, 'BW Not Installed');
    if (state.kind === 'secret-tool-not-installed')
      return React.createElement(
        'div',
        { 'data-testid': 'secret-tool-not-installed' },
        'Install libsecret',
      );
    if (state.kind === 'login-failed')
      return React.createElement('div', { 'data-testid': 'login-failed' }, 'Login failed');
    if (state.kind === 'needs-unlock' || state.kind === 'unlocking') {
      return React.createElement(
        'form',
        { 'data-testid': 'unlock-form' },
        React.createElement('h2', null, 'Unlock'),
      );
    }
    return null;
  },
  useUnlockGate: () => ({ handleLogin: vi.fn(), handleUnlock: vi.fn() }),
}));

vi.mock('../use-vault-sync', () => ({
  useVaultSync: () => ({ syncVault: vi.fn(), handleSync: vi.fn(), isSyncing: false }),
}));

vi.mock('../favicons', () => ({
  loadFaviconCache: () => ({}),
  resolveFavicons: () => ({}),
  clearFaviconCache: vi.fn(),
}));

vi.mock('../item-detail-view', () => ({
  default: () => React.createElement('div', null, 'ItemDetailView'),
  renderItemActionElements: () => [],
}));

vi.mock('../bw-not-installed', () => ({
  BwNotInstalled: () =>
    React.createElement('div', { 'data-testid': 'bw-not-installed-comp' }, 'Install BW'),
  SecretToolNotInstalled: () =>
    React.createElement(
      'div',
      { 'data-testid': 'secret-tool-not-installed-comp' },
      'Install libsecret',
    ),
}));

import SearchVault from '../search-vault';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SearchVault', () => {
  it('renders the unlock form when no session and no cache', async () => {
    render(React.createElement(SearchVault));
    await waitFor(() => {
      expect(screen.getByTestId('unlock-form')).toBeTruthy();
    });
  });

  it('renders loading state once session resolves', async () => {
    mockUseSession.session = 'loaded-session';
    render(React.createElement(SearchVault));
    await waitFor(() => {
      expect(screen.getByTestId('list')).toBeTruthy();
    });
  });
});
