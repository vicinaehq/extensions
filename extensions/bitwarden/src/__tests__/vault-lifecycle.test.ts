import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { useVaultLifecycle } from '../vault-lifecycle';
import type { UIState } from '../vault-lifecycle';
import type { BwItem, BwFolder } from '../bitwarden-types';
import { makeItem, makeFolder, makeItems, makeFolders } from './__utils__/test-data';

const { mockLoadFaviconCache, mockResolveFavicons, mockExtractHostname } = vi.hoisted(() => ({
  mockLoadFaviconCache: vi.fn().mockResolvedValue({}),
  mockResolveFavicons: vi.fn().mockResolvedValue({}),
  mockExtractHostname: vi.fn().mockReturnValue(null),
}));

const { mockLoadCachedVault } = vi.hoisted(() => ({
  mockLoadCachedVault: vi.fn().mockResolvedValue(null),
}));

const mockCheckBwGate = vi.hoisted(() => vi.fn());

const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('../favicons', () => ({
  loadFaviconCache: mockLoadFaviconCache,
  resolveFavicons: mockResolveFavicons,
  extractHostname: mockExtractHostname,
}));

vi.mock('../vault-cache', () => ({
  loadCachedVault: mockLoadCachedVault,
}));

vi.mock('../unlock-gate', () => ({
  checkBwGate: mockCheckBwGate,
}));

vi.mock('@vicinae/api', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

type SetUIState = React.Dispatch<React.SetStateAction<UIState>>;
type SetFaviconMap = React.Dispatch<React.SetStateAction<Record<string, string>>>;

function makeParams(
  overrides: Partial<{
    session: string | null;
    state: UIState;
    setState: SetUIState;
    setVault: (items: BwItem[], folders: BwFolder[]) => void;
    syncVault: (token: string) => Promise<void>;
    handleLogin: () => Promise<void>;
    clearSession: () => Promise<void>;
    setFaviconMap: SetFaviconMap;
  }> = {},
) {
  return {
    session: null,
    state: { kind: 'checking-bw' } as const,
    setState: vi.fn<SetUIState>(),
    setVault: vi.fn<(items: BwItem[], folders: BwFolder[]) => void>(),
    syncVault: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined),
    handleLogin: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    clearSession: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setFaviconMap: vi.fn<SetFaviconMap>(),
    ...overrides,
  };
}

function renderSyncErrorCase(errorMessage: string) {
  const syncVault = vi
    .fn<(token: string) => Promise<void>>()
    .mockRejectedValue(new Error(errorMessage));
  const clearSession = vi.fn<() => Promise<void>>();
  const setState = vi.fn<SetUIState>();

  const params = makeParams({ session: 'token', syncVault, clearSession, setState });
  renderHook(() => useVaultLifecycle(params));

  return { clearSession, setState };
}

async function expectErrorScreen(setState: SetUIState, clearSession: SetUIState) {
  await waitFor(() => {
    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', title: 'Failed to load vault' }),
    );
  });
  expect(clearSession).not.toHaveBeenCalled();
}

const items = makeItems(1);
const folders = makeFolders(1);

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckBwGate.mockReset();
  mockCheckBwGate.mockResolvedValue({ kind: 'ready' });
  mockLoadCachedVault.mockResolvedValue(null);
  mockLoadFaviconCache.mockResolvedValue({});
  mockResolveFavicons.mockResolvedValue({});
  mockShowToast.mockClear();
});

describe('useVaultLifecycle', () => {
  // -------------------------------------------------------------------------
  // Initial mount (checking-bw → ready path)
  // -------------------------------------------------------------------------
  describe('initial mount: ready path', () => {
    it('loads favicon cache on mount', async () => {
      const setFaviconMap = vi.fn<SetFaviconMap>();
      mockLoadFaviconCache.mockResolvedValue({ 'test.com': 'data:...' });

      const params = makeParams({ session: 'token', setFaviconMap });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(mockLoadFaviconCache).toHaveBeenCalled();
        expect(setFaviconMap).toHaveBeenCalledWith({ 'test.com': 'data:...' });
      });
    });

    it('caches vault data when cached in storage', async () => {
      const cached = { items, folders };
      mockLoadCachedVault.mockResolvedValue(cached);
      const setVault = vi.fn<(items: BwItem[], folders: BwFolder[]) => void>();

      const params = makeParams({ session: 'token', setVault });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(setVault).toHaveBeenCalledWith(cached.items, cached.folders);
      });
    });

    it('syncs vault after gate ready', async () => {
      const syncVault = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);

      const params = makeParams({ session: 'token', syncVault });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(syncVault).toHaveBeenCalledWith('token');
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({ style: 'success', title: 'Vault synced' }),
        );
      });
    });

    it('falls back to cached vault on sync failure', async () => {
      const cached = { items, folders };
      mockLoadCachedVault.mockResolvedValue(cached);
      const syncVault = vi
        .fn<(token: string) => Promise<void>>()
        .mockRejectedValue(new Error('network'));
      const setVault = vi.fn<(items: BwItem[], folders: BwFolder[]) => void>();
      const clearSession = vi.fn<() => Promise<void>>();

      const params = makeParams({ session: 'token', syncVault, setVault, clearSession });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(setVault).toHaveBeenCalledWith(cached.items, cached.folders);
      });
      expect(clearSession).not.toHaveBeenCalled();
    });

    it('clears session and sets needs-unlock on auth-related sync failure with no cache', async () => {
      mockLoadCachedVault.mockResolvedValue(null);
      const { clearSession, setState } = renderSyncErrorCase('Not logged in');

      await waitFor(() => {
        expect(clearSession).toHaveBeenCalled();
        expect(setState).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'needs-unlock', error: 'Session expired' }),
        );
      });
    });

    it('shows error screen on non-auth sync failure with no cache', async () => {
      mockLoadCachedVault.mockResolvedValue(null);
      const { clearSession, setState } = renderSyncErrorCase('Cannot reach Bitwarden server');
      await expectErrorScreen(setState, clearSession);
    });
  });

  // -------------------------------------------------------------------------
  // Initial mount: gate states
  // -------------------------------------------------------------------------
  describe('initial mount: gate states', () => {
    it.each([
      'bw-not-installed' as const,
      'secret-tool-not-installed' as const,
      'logging-in' as const,
      'needs-unlock' as const,
    ])('sets %s state', async (kind) => {
      mockCheckBwGate.mockResolvedValue({ kind });
      const setState = vi.fn<SetUIState>();

      const params = makeParams({ setState });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(setState).toHaveBeenCalledWith({ kind });
      });
    });

    it('suppresses needs-unlock when cache exists (shows stale data)', async () => {
      mockCheckBwGate.mockResolvedValue({ kind: 'needs-unlock' });
      const cached = { items, folders };
      mockLoadCachedVault.mockResolvedValue(cached);
      const setState = vi.fn<SetUIState>();
      const setVault = vi.fn<(items: BwItem[], folders: BwFolder[]) => void>();

      const params = makeParams({ setState, setVault });
      renderHook(() => useVaultLifecycle(params));

      await waitFor(() => {
        expect(setVault).toHaveBeenCalledWith(cached.items, cached.folders);
      });
      expect(setState).not.toHaveBeenCalledWith({ kind: 'needs-unlock' });
    });
  });

  // -------------------------------------------------------------------------
  // Session arrival transitions needs-unlock → loading
  // -------------------------------------------------------------------------
  it('transitions needs-unlock to loading when session arrives', () => {
    mockCheckBwGate.mockResolvedValue({ kind: 'needs-unlock' });
    mockLoadCachedVault.mockResolvedValue(null);
    const setState = vi.fn<SetUIState>();

    const { rerender } = renderHook(
      (state: UIState) => useVaultLifecycle(makeParams({ session: 'token', state, setState })),
      { initialProps: { kind: 'checking-bw' } },
    );

    rerender({ kind: 'needs-unlock' });

    expect(setState).toHaveBeenCalledWith({ kind: 'loading' });
  });

  it('does not transition non-needs-unlock states on session arrival', () => {
    mockLoadCachedVault.mockResolvedValue({ items, folders });
    const setState = vi.fn<SetUIState>();

    const { rerender } = renderHook(
      (state: UIState) => useVaultLifecycle(makeParams({ session: 'token', state, setState })),
      { initialProps: { kind: 'vault', items: [], folders: [] } },
    );

    rerender({ kind: 'vault', items, folders });

    expect(setState).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // loading state → sync vault
  // -------------------------------------------------------------------------
  it('syncs vault when state transitions to loading with session', async () => {
    mockLoadCachedVault.mockResolvedValue(null);
    const syncVault = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    const setVault = vi.fn<(items: BwItem[], folders: BwFolder[]) => void>();
    const cached = { items, folders };
    mockLoadCachedVault.mockImplementationOnce(async () => null).mockResolvedValueOnce(cached);

    const { rerender } = renderHook(
      (state: UIState) =>
        useVaultLifecycle(makeParams({ session: 'token', state, setVault, syncVault })),
      { initialProps: { kind: 'needs-unlock' } },
    );

    rerender({ kind: 'loading' });

    await waitFor(() => {
      expect(syncVault).toHaveBeenCalledWith('token');
    });
  });

  it('shows error screen on loading sync failure without cache', async () => {
    mockLoadCachedVault.mockResolvedValue(null);
    const syncVault = vi
      .fn<(token: string) => Promise<void>>()
      .mockRejectedValue(new Error('network down'));
    const setState = vi.fn<SetUIState>();
    const clearSession = vi.fn<() => Promise<void>>();

    const { rerender } = renderHook(
      (state: UIState) =>
        useVaultLifecycle(
          makeParams({ session: 'token', state, syncVault, clearSession, setState }),
        ),
      { initialProps: { kind: 'checking-bw' } },
    );

    rerender({ kind: 'loading' });
    await expectErrorScreen(setState, clearSession);
  });

  // -------------------------------------------------------------------------
  // logging-in state triggers handleLogin
  // -------------------------------------------------------------------------
  it('calls handleLogin when state transitions to logging-in', async () => {
    const handleLogin = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      (state: UIState) => useVaultLifecycle(makeParams({ state, handleLogin })),
      { initialProps: { kind: 'checking-bw' } },
    );

    rerender({ kind: 'logging-in' });

    await waitFor(() => {
      expect(handleLogin).toHaveBeenCalled();
    });
  });

  it('does not call handleLogin when state is not logging-in', async () => {
    const handleLogin = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderHook(() =>
      useVaultLifecycle(makeParams({ state: { kind: 'needs-unlock' }, handleLogin })),
    );

    expect(handleLogin).not.toHaveBeenCalled();
  });
});
