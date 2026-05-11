import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession } from '../use-session';

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: { execFile: execFileMock, spawn: spawnMock },
  execFile: execFileMock,
  spawn: spawnMock,
}));

vi.mock('node:util', () => {
  const identity = (fn: unknown) => fn;
  return {
    default: { promisify: identity },
    promisify: identity,
  };
});

vi.mock('node:fs', () => {
  const mockWrite = vi.fn();
  return {
    default: { readFileSync: () => '', writeFileSync: mockWrite },
    readFileSync: () => '',
    writeFileSync: mockWrite,
  };
});

vi.mock('better-sqlite3', () => {
  const mockDb = () => ({
    prepare: () => ({ run: vi.fn() }),
    close: vi.fn(),
  });
  return { default: mockDb };
});

vi.mock('@vicinae/api', () => ({
  getPreferenceValues: () => ({
    serverRegion: 'bitwarden.com' as const,
    customServerUrl: '',
    customCertPath: '',
    bitwardenApiClientId: 'test-client-id',
    bitwardenApiClientSecret: 'test-client-secret',
    autoLockTimeout: '21600',
    downloadDir: '',
    passwordLength: '20',
    passwordUppercase: true,
    passwordLowercase: true,
    passwordNumbers: true,
    passwordSymbols: true,
  }),
  showToast: vi.fn(),
  Toast: { Style: { Success: 'success', Failure: 'failure', Animated: 'animated' } },
}));

vi.mock('../vault-cache', () => ({
  clearCachedSends: vi.fn().mockResolvedValue(undefined),
  clearCachedVault: vi.fn().mockResolvedValue(undefined),
  loadCachedVault: vi.fn().mockResolvedValue(null),
  saveCachedVault: vi.fn().mockResolvedValue(undefined),
  loadCachedSends: vi.fn().mockResolvedValue(null),
  saveCachedSends: vi.fn().mockResolvedValue(undefined),
}));

const sessionLookupArgs = ['lookup', 'service', 'vicinae-bitwarden', 'account', 'session'];
const sessionStoreArgs = [
  'store',
  '--label=Vicinae Bitwarden',
  'service',
  'vicinae-bitwarden',
  'account',
  'session',
];
const sessionClearArgs = ['clear', 'service', 'vicinae-bitwarden', 'account', 'session'];
const apiCredsLookupArgs = ['lookup', 'service', 'vicinae-bitwarden', 'account', 'api-creds'];
const apiCredsStoreArgs = [
  'store',
  '--label=Vicinae Bitwarden API Key',
  'service',
  'vicinae-bitwarden',
  'account',
  'api-creds',
];
const bwUnlockArgs = ['unlock', '--passwordenv', 'BW_PASSWORD', '--raw'];
const bwLockArgs = ['lock'];
const bwConfigArgs = (url: string) => ['config', 'server', url];
const bwLoginArgs = ['login', '--apikey'];

function tokenPayload(token: string) {
  return { stdout: `${JSON.stringify({ token, timestamp: Date.now() })}\n`, stderr: '' };
}

function apiCredsPayload(clientId: string, clientSecret: string) {
  return { stdout: `${JSON.stringify({ clientId, clientSecret })}\n`, stderr: '' };
}

function execResolves(value: { stdout: string; stderr?: string }) {
  execFileMock.mockResolvedValueOnce({ stdout: value.stdout, stderr: value.stderr ?? '' });
}

function execRejects(message: string) {
  const err = new Error(message) as Error & { stderr: string; code: number };
  err.stderr = message;
  err.code = 1;
  execFileMock.mockRejectedValueOnce(err);
}

function spawnSucceeds() {
  const child = {
    stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
  child.stdin.on.mockImplementation((_event: string, _cb: () => void) => child.stdin);
  child.on.mockImplementation((event: string, cb: (code?: number) => void) => {
    if (event === 'close') queueMicrotask(() => cb(0));
    return child;
  });
  spawnMock.mockReturnValueOnce(child);
}

const originalHome = process.env.HOME;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HOME = '/home/test';
});

afterEach(() => {
  process.env.HOME = originalHome;
});

describe('useSession', () => {
  describe('initial mount', () => {
    it('has null session when no cached session exists', async () => {
      execRejects('Cannot find item');

      const { result } = renderHook(() => useSession());

      expect(result.current.session).toBeNull();
      await waitFor(() => {
        expect(execFileMock).toHaveBeenCalledWith(
          'secret-tool',
          sessionLookupArgs,
          expect.objectContaining({ timeout: 5000 }),
        );
      });
    });

    it('loads cached session from session store', async () => {
      execResolves(tokenPayload('cached-token'));

      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.session).toBe('cached-token');
      });
    });
  });

  describe('unlock', () => {
    it('calls bw.unlock, stores session, and updates state', async () => {
      execRejects('Cannot find item');
      execResolves({ stdout: 'new-session-token\n', stderr: '' });
      spawnSucceeds();

      const { result } = renderHook(() => useSession());

      await act(async () => {
        const token = await result.current.unlock('mypassword');
        expect(token).toBe('new-session-token');
      });

      expect(execFileMock).toHaveBeenCalledWith(
        'bw',
        bwUnlockArgs,
        expect.objectContaining({ env: expect.objectContaining({ BW_PASSWORD: 'mypassword' }) }),
      );
      expect(result.current.session).toBe('new-session-token');
    });

    it('propagates unlock errors', async () => {
      execRejects('Cannot find item');
      execRejects('Invalid master password');

      const { result } = renderHook(() => useSession());

      await expect(act(() => result.current.unlock('wrong'))).rejects.toThrow(
        'Invalid master password',
      );

      expect(result.current.session).toBeNull();
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

    it('calls bw.lock, deletes session, and sets session to null', async () => {
      execResolves(tokenPayload('active-token'));
      execResolves({ stdout: '', stderr: '' });
      execResolves({ stdout: '', stderr: '' });

      const result = await renderAndClear();

      expect(execFileMock).toHaveBeenCalledWith(
        'bw',
        bwLockArgs,
        expect.objectContaining({ env: expect.objectContaining({ BW_SESSION: 'active-token' }) }),
      );
      expect(execFileMock).toHaveBeenCalledWith(
        'secret-tool',
        sessionClearArgs,
        expect.objectContaining({ timeout: 5000 }),
      );
      expect(result.current.session).toBeNull();
    });

    it('clears session even when bw.lock fails', async () => {
      execResolves(tokenPayload('active-token'));
      execResolves({ stdout: '', stderr: '' });
      execRejects('already locked');

      const result = await renderAndClear();

      expect(result.current.session).toBeNull();
      expect(execFileMock).toHaveBeenCalledWith(
        'secret-tool',
        sessionClearArgs,
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('deletes session even when session is null', async () => {
      execRejects('Cannot find item');
      execResolves({ stdout: '', stderr: '' });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.clearSession();
      });

      expect(execFileMock).toHaveBeenCalledWith(
        'secret-tool',
        sessionClearArgs,
        expect.any(Object),
      );
      expect(result.current.session).toBeNull();
    });
  });

  describe('loginIfNeeded', () => {
    async function renderAndLogin() {
      const { result } = renderHook(() => useSession());
      await act(async () => {
        await result.current.loginIfNeeded();
      });
      return result;
    }

    function expectBwLoginCalled() {
      expect(execFileMock).toHaveBeenCalledWith(
        'bw',
        bwLoginArgs,
        expect.objectContaining({
          env: expect.objectContaining({
            BW_CLIENTID: 'test-client-id',
            BW_CLIENTSECRET: 'test-client-secret',
          }),
        }),
      );
    }

    function expectSpawnStoreCalled() {
      expect(spawnMock).toHaveBeenCalledWith(
        'secret-tool',
        apiCredsStoreArgs,
        expect.objectContaining({ stdio: ['pipe', 'ignore', 'ignore'] }),
      );
    }

    it('uses libsecret credentials when available and prefs unchanged', async () => {
      execRejects('Cannot find item');
      execResolves(apiCredsPayload('test-client-id', 'test-client-secret'));
      execResolves({ stdout: '', stderr: '' });
      execResolves({ stdout: '', stderr: '' });

      await renderAndLogin();
      expectBwLoginCalled();
    });

    it('uses preferences and migrates to libsecret when no libsecret creds exist', async () => {
      execRejects('Cannot find item');
      execRejects('Cannot find item');
      execResolves({ stdout: '', stderr: '' });
      execResolves({ stdout: '', stderr: '' });
      spawnSucceeds();

      await renderAndLogin();
      expectSpawnStoreCalled();
    });

    it('detects credential rotation and re-migrates', async () => {
      execRejects('Cannot find item');
      execResolves(apiCredsPayload('old-rotated-id', 'old-rotated-secret'));
      execResolves({ stdout: '', stderr: '' });
      execResolves({ stdout: '', stderr: '' });
      spawnSucceeds();

      await renderAndLogin();
      expectBwLoginCalled();
      expectSpawnStoreCalled();
    });

    it('isLoggingIn is false after login completes', async () => {
      execRejects('Cannot find item');
      execRejects('Cannot find item');
      execResolves({ stdout: '', stderr: '' });
      execResolves({ stdout: '', stderr: '' });
      spawnSucceeds();

      const result = await renderAndLogin();
      expect(result.current.isLoggingIn).toBe(false);
    });
  });
});
