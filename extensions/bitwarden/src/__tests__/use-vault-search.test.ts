import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { useVaultSearch } from '../use-vault-search';
import type { BwItem, BwFolder } from '../bitwarden-types';
import type { UIState } from '../vault-lifecycle';

const mockClipboardCopy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowToast = vi.hoisted(() => vi.fn());
const mockGetTotp = vi.hoisted(() => vi.fn());
const mockGetErrorMessage = vi.hoisted(() =>
  vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
);

vi.mock('../bw-executor', () => ({
  getTotp: mockGetTotp,
  getErrorMessage: mockGetErrorMessage,
}));

const mockComputeLocalTotp = vi.hoisted(() => vi.fn());
const mockIsSteamSecret = vi.hoisted(() =>
  vi.fn((s: string | null | undefined) => !!s && s.startsWith('steam://')),
);

vi.mock('../totp-compute', () => ({
  computeLocalTotp: mockComputeLocalTotp,
  isSteamSecret: mockIsSteamSecret,
}));

const mockUseTotpSecretsImpl = vi.hoisted(() => vi.fn(() => ({}) as Record<string, string>));

vi.mock('../use-totp-secrets', () => ({
  useTotpSecrets: () => mockUseTotpSecretsImpl(),
}));

vi.mock('../item-list', () => ({
  filterItems: (items: BwItem[]) => items,
  groupByFolder: (items: BwItem[]) => {
    const map = new Map();
    if (items.length > 0) {
      map.set('f1', { folderName: 'Work', items });
    }
    return map;
  },
}));

vi.mock('../toast', () => ({
  showFailureToast: async (_err: unknown, title: string) =>
    mockShowToast({ style: 'failure', title }),
}));

let mockSession: string | null = 'token';
let mockIsSyncing = false;
let mockGateRender: React.ReactElement | null = null;

vi.mock('../use-session', () => ({
  useSession: () => ({
    session: mockSession,
    unlock: vi.fn(),
    clearSession: vi.fn(),
    loginIfNeeded: vi.fn(),
    loginError: null,
  }),
}));

vi.mock('../use-vault-sync', () => ({
  useVaultSync: () => ({
    syncVault: vi.fn(),
    handleSync: vi.fn(),
    isSyncing: mockIsSyncing,
  }),
}));

vi.mock('../vault-lifecycle', () => ({
  useVaultLifecycle: vi.fn(),
}));

vi.mock('../unlock-gate', () => ({
  createUnlockCallbacks: () => ({
    onUnlockStart: vi.fn(),
    onUnlockReady: vi.fn(),
    onUnlockError: vi.fn(),
    onLoginReady: vi.fn(),
    onLoginError: vi.fn(),
  }),
  renderGate: () => mockGateRender,
  useUnlockGate: () => ({
    handleLogin: vi.fn(),
    handleUnlock: vi.fn(),
  }),
}));

vi.mock('@vicinae/api', async () => {
  const { createVicinaeApiMock } = await vi.importActual<
    typeof import('./__utils__/vicinae-mocks')
  >('./__utils__/vicinae-mocks');
  return createVicinaeApiMock(mockClipboardCopy, mockShowToast);
});

import { useVaultLifecycle as mockUseVaultLifecycle } from '../vault-lifecycle';
import { makeItem, makeFolder } from './__utils__/test-data';

function defaultLifecycle() {
  const items: BwItem[] = [
    makeItem({ login: { username: 'user', password: null, totp: null }, name: 'GitHub' }),
  ];
  const folders: BwFolder[] = [makeFolder()];

  vi.mocked(mockUseVaultLifecycle).mockImplementation(
    (params: {
      setState: React.Dispatch<React.SetStateAction<UIState>>;
      setVault: (items: BwItem[], folders: BwFolder[]) => void;
      setFaviconMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    }) => {
      useEffect(() => {
        params.setFaviconMap({});
        params.setState({ kind: 'vault', items, folders });
        params.setVault(items, folders);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession = 'token';
  mockIsSyncing = false;
  mockGateRender = null;
  mockComputeLocalTotp.mockReturnValue(null);
  mockUseTotpSecretsImpl.mockReturnValue({});
  defaultLifecycle();
});

describe('useVaultSearch', () => {
  describe('handleCopyTotp', () => {
    it('copies TOTP and shows success toast', async () => {
      mockGetTotp.mockResolvedValue('123456');

      const { result } = renderHook(() => useVaultSearch());

      await act(async () => {
        await result.current.handleCopyTotp('item-1');
      });

      expect(mockGetTotp).toHaveBeenCalledWith('item-1', 'token');
      expect(mockClipboardCopy).toHaveBeenCalledWith('123456');
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'success', title: 'Copied TOTP' }),
      );
    });

    it('uses the provided cached code without calling bw.getTotp', async () => {
      const { result } = renderHook(() => useVaultSearch());

      await act(async () => {
        await result.current.handleCopyTotp('item-1', '654321');
      });

      expect(mockGetTotp).not.toHaveBeenCalled();
      expect(mockClipboardCopy).toHaveBeenCalledWith('654321');
    });

    it('computes locally from a keyring secret when the vault item has no totp', async () => {
      // Lifecycle sets state.items to one item without totp; provide the secret via the keyring map.
      mockUseTotpSecretsImpl.mockReturnValue({ 'item-1': 'JBSWY3DPEHPK3PXP' });
      mockComputeLocalTotp.mockReturnValue({ code: '424242', remainingMs: 12_000, periodSec: 30 });

      const { result } = renderHook(() => useVaultSearch());

      await act(async () => {
        await result.current.handleCopyTotp('item-1');
      });

      expect(mockComputeLocalTotp).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP', expect.any(Number));
      expect(mockGetTotp).not.toHaveBeenCalled();
      expect(mockClipboardCopy).toHaveBeenCalledWith('424242');
    });

    it('falls back to bw.getTotp for steam secrets', async () => {
      mockUseTotpSecretsImpl.mockReturnValue({ 'item-1': 'steam://ABC' });
      mockGetTotp.mockResolvedValue('STEAM5');

      const { result } = renderHook(() => useVaultSearch());

      await act(async () => {
        await result.current.handleCopyTotp('item-1');
      });

      expect(mockComputeLocalTotp).not.toHaveBeenCalled();
      expect(mockGetTotp).toHaveBeenCalledWith('item-1', 'token');
      expect(mockClipboardCopy).toHaveBeenCalledWith('STEAM5');
    });

    it('shows failure toast when getTotp fails', async () => {
      mockGetTotp.mockRejectedValue(new Error('TOTP error'));

      const { result } = renderHook(() => useVaultSearch());

      await act(async () => {
        await result.current.handleCopyTotp('item-1');
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'failure', title: 'Failed to get TOTP' }),
      );
    });
  });

  describe('isLoading', () => {
    it('is true when state kind is checking-bw', () => {
      vi.mocked(mockUseVaultLifecycle).mockImplementation(() => {});
      const { result } = renderHook(() => useVaultSearch());
      expect(result.current.isLoading).toBe(true);
    });

    it('is true when syncing', async () => {
      mockIsSyncing = true;
      const { result } = renderHook(() => useVaultSearch());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });
    });

    it('is false when vault is loaded and not syncing', async () => {
      const { result } = renderHook(() => useVaultSearch());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('preFilter', () => {
    it('applies preFilter to vault items before search', async () => {
      const preFilter = (items: BwItem[]) => items.filter((i) => i.login?.username === 'user');

      const { result } = renderHook(() => useVaultSearch(preFilter));

      await waitFor(() => {
        expect(result.current.filtered).toHaveLength(1);
      });
    });

    it('returns all items when no preFilter provided', async () => {
      const { result } = renderHook(() => useVaultSearch());

      await waitFor(() => {
        expect(result.current.filtered).toHaveLength(1);
      });
    });
  });

  describe('sortedSections', () => {
    it('returns sorted sections by folder name', async () => {
      const { result } = renderHook(() => useVaultSearch());

      await waitFor(() => {
        expect(result.current.sortedSections).toHaveLength(1);
        expect(result.current.sortedSections[0]![0]).toBe('f1');
        expect(result.current.sortedSections[0]![1]!.folderName).toBe('Work');
      });
    });
  });
});
