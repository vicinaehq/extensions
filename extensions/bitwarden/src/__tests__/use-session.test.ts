import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession } from '../use-session';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted for vi.mock factories
// ---------------------------------------------------------------------------

const { mockBw, mockLocalStorage } = vi.hoisted(() => {
  const mockBw = {
    login: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue('default-token'),
    lock: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
  };

  const mockLocalStorage = {
    getItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  };

  return { mockBw, mockLocalStorage };
});

vi.mock('@vicinae/api', () => ({
  LocalStorage: {
    getItem: (key: string) => mockLocalStorage.getItem(key),
    setItem: (key: string, value: string) => mockLocalStorage.setItem(key, value),
    removeItem: (key: string) => mockLocalStorage.removeItem(key),
  },
  showToast: vi.fn(),
  Toast: { Style: { Success: 'success', Failure: 'failure', Animated: 'animated' } },
}));

vi.mock('../bw-executor', () => mockBw);

vi.mock('../preferences', () => ({
  getPreferences: () => ({
    serverRegion: 'bitwarden.com' as const,
    customServerUrl: '',
    apiClientId: 'test-client-id',
    apiClientSecret: 'test-client-secret',
    passwordLength: '20',
    passwordUppercase: true,
    passwordLowercase: true,
    passwordNumbers: true,
    passwordSymbols: true,
  }),
  getServerUrl: () => 'https://bitwarden.com',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockLocalStorage.getItem.mockResolvedValue(undefined);
  mockBw.sync.mockResolvedValue(undefined);
  mockBw.unlock.mockResolvedValue('default-token');
  mockBw.lock.mockResolvedValue(undefined);
  mockBw.login.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSession', () => {
  describe('initial mount', () => {
    it('has null session when no cached session exists', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      expect(result.current.session).toBeNull();
    });

    it('loads cached session directly from LocalStorage', async () => {
      mockLocalStorage.getItem.mockResolvedValue('cached-token');

      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.session).toBe('cached-token');
      });
    });
  });

  describe('unlock', () => {
    it('calls bw.unlock, stores session, and updates state', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);
      mockBw.unlock.mockResolvedValue('new-session-token');

      const { result } = renderHook(() => useSession());

      await act(async () => {
        const token = await result.current.unlock('mypassword');
        expect(token).toBe('new-session-token');
      });

      expect(mockBw.unlock).toHaveBeenCalledWith('mypassword');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'vicinae-bitwarden-session',
        'new-session-token',
      );
      expect(result.current.session).toBe('new-session-token');
    });

    it('propagates unlock errors', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);
      mockBw.unlock.mockRejectedValue(new Error('Invalid master password'));

      const { result } = renderHook(() => useSession());

      await expect(act(() => result.current.unlock('wrong'))).rejects.toThrow(
        'Invalid master password',
      );

      expect(result.current.session).toBeNull();
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    async function renderAndClear() {
      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.session).toBe('active-token');
      });

      await act(async () => {
        await result.current.clearSession();
      });

      return result;
    }

    it('calls bw.lock, removes from LocalStorage, and sets session to null', async () => {
      mockLocalStorage.getItem.mockResolvedValue('active-token');
      mockBw.sync.mockResolvedValue(undefined);

      const result = await renderAndClear();

      expect(mockBw.lock).toHaveBeenCalledWith('active-token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('vicinae-bitwarden-session');
      expect(result.current.session).toBeNull();
    });

    it('clears session even when bw.lock fails', async () => {
      mockLocalStorage.getItem.mockResolvedValue('active-token');
      mockBw.sync.mockResolvedValue(undefined);
      mockBw.lock.mockRejectedValue(new Error('already locked'));

      const result = await renderAndClear();

      expect(result.current.session).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });

    it('removes from LocalStorage even when session is null', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.clearSession();
      });

      expect(mockBw.lock).not.toHaveBeenCalled();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('vicinae-bitwarden-session');
      expect(result.current.session).toBeNull();
    });
  });

  describe('loginIfNeeded', () => {
    it('calls bw.login with preferences', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loginIfNeeded();
      });

      expect(mockBw.login).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          serverUrl: 'https://bitwarden.com',
        }),
      );
    });

    it('isLoggingIn is false after login completes', async () => {
      mockLocalStorage.getItem.mockResolvedValue(undefined);
      mockBw.login.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loginIfNeeded();
      });

      expect(result.current.isLoggingIn).toBe(false);
    });
  });
});
