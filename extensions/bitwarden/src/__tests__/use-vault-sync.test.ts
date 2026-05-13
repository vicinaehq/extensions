import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVaultSync } from '../use-vault-sync';
import { makeItem, makeItems, makeFolders } from './__utils__/test-data';
import { ItemType } from '../bitwarden-types';

const { mockBw, mockSaveCachedVault, mockSaveTotpSecrets } = vi.hoisted(() => {
  const mockBw = {
    sync: vi.fn(),
    listItems: vi.fn(),
    listFolders: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  };

  const mockSaveCachedVault = vi.fn().mockResolvedValue(undefined);
  const mockSaveTotpSecrets = vi.fn().mockResolvedValue(undefined);

  return { mockBw, mockSaveCachedVault, mockSaveTotpSecrets };
});

const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => ({
  ...mockBw,
  getErrorMessage: mockBw.getErrorMessage,
}));

vi.mock('../vault-cache', () => ({
  saveCachedVault: mockSaveCachedVault,
  saveTotpSecrets: mockSaveTotpSecrets,
}));

vi.mock('@vicinae/api', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

function setupHandleSync() {
  mockBw.sync.mockResolvedValue(undefined);
  mockBw.listItems.mockResolvedValue(makeItems(1));
  mockBw.listFolders.mockResolvedValue(makeFolders(1));
  const setVault = vi.fn();
  const { result } = renderHook(() => useVaultSync('token', setVault));
  return { result, setVault };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useVaultSync', () => {
  describe('syncVault', () => {
    it('syncs, lists items/folders, caches, and sets vault', async () => {
      const items = makeItems(1);
      const folders = makeFolders(1);
      mockBw.sync.mockResolvedValue(undefined);
      mockBw.listItems.mockResolvedValue(items);
      mockBw.listFolders.mockResolvedValue(folders);
      const setVault = vi.fn();

      const { result } = renderHook(() => useVaultSync('token', setVault));

      await act(async () => {
        await result.current.syncVault('token');
      });

      expect(mockBw.sync).toHaveBeenCalledWith('token');
      expect(mockBw.listItems).toHaveBeenCalledWith('token');
      expect(mockBw.listFolders).toHaveBeenCalledWith('token');
      expect(mockSaveCachedVault).toHaveBeenCalledWith(items, folders);
      expect(setVault).toHaveBeenCalledWith(items, folders);
    });

    it('persists TOTP secrets only for Login items that have a totp', async () => {
      const items = [
        makeItem({
          id: 'a',
          type: ItemType.Login,
          login: { username: 'u', password: null, totp: 'JBSWY3DPEHPK3PXP' },
        }),
        makeItem({
          id: 'b',
          type: ItemType.Login,
          login: { username: 'u', password: null, totp: null },
        }),
        makeItem({ id: 'c', type: ItemType.SecureNote }),
      ];
      mockBw.sync.mockResolvedValue(undefined);
      mockBw.listItems.mockResolvedValue(items);
      mockBw.listFolders.mockResolvedValue(makeFolders(1));

      const { result } = renderHook(() => useVaultSync('token', vi.fn()));
      await act(async () => {
        await result.current.syncVault('token');
      });

      expect(mockSaveTotpSecrets).toHaveBeenCalledWith({ a: 'JBSWY3DPEHPK3PXP' });
    });

    it('throws when sync fails', async () => {
      mockBw.sync.mockRejectedValue(new Error('sync error'));
      const setVault = vi.fn();

      const { result } = renderHook(() => useVaultSync('token', setVault));

      await expect(act(() => result.current.syncVault('token'))).rejects.toThrow('sync error');
    });
  });

  describe('handleSync', () => {
    it('shows success toast on successful sync', async () => {
      const { result } = setupHandleSync();

      await act(async () => {
        await result.current.handleSync();
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'success', title: 'Vault synced' }),
      );
    });

    it('shows failure toast on sync error', async () => {
      mockBw.sync.mockRejectedValue(new Error('network error'));
      const setVault = vi.fn();
      const { result } = renderHook(() => useVaultSync('token', setVault));

      await act(async () => {
        await result.current.handleSync();
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'failure', title: 'Sync failed' }),
      );
    });

    it('resets isSyncing to false after completion', async () => {
      const { result } = setupHandleSync();

      expect(result.current.isSyncing).toBe(false);

      await act(async () => {
        await result.current.handleSync();
      });

      expect(result.current.isSyncing).toBe(false);
    });
  });
});
