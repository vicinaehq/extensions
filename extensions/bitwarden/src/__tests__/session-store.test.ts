import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  mockExec,
  mockExecError,
  mockSpawnSuccess,
  mockSpawnError,
  createSpawnChild,
} from './__utils__/exec-mocks';

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const { mockGetPreferences, mockGetAutoLockSeconds } = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(),
  mockGetAutoLockSeconds: vi.fn(),
}));

// fallow-ignore-next-line code-duplication
vi.mock('node:child_process', () => ({
  default: { execFile: mockExecFile, spawn: mockSpawn },
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

// fallow-ignore-next-line code-duplication
vi.mock('node:util', () => ({
  default: { promisify: (fn: unknown) => fn },
  promisify: (fn: unknown) => fn,
}));

vi.mock('../preferences', () => ({
  getPreferences: mockGetPreferences,
  getAutoLockSeconds: mockGetAutoLockSeconds,
}));

let sessionStore: typeof import('../session-store');

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  mockGetAutoLockSeconds.mockReturnValue(0);
  mockGetPreferences.mockReturnValue({ autoLockTimeout: '0' });
  sessionStore = await import('../session-store');
});

describe('getSession', () => {
  it('returns null when secret-tool lookup fails', async () => {
    mockExecError(mockExecFile, 'secret-tool: Cannot find item');
    const result = await sessionStore.getSession();
    expect(result).toBeNull();
  });

  it('returns null when stdout is empty', async () => {
    mockExec(mockExecFile, '\n');
    const result = await sessionStore.getSession();
    expect(result).toBeNull();
  });

  it('returns token from valid session payload (new format)', async () => {
    const payload = JSON.stringify({ token: 'session-abc', timestamp: Date.now() });
    mockExec(mockExecFile, payload + '\n');

    const result = await sessionStore.getSession();
    expect(result).toBe('session-abc');
  });

  it('returns null for expired session', async () => {
    mockGetAutoLockSeconds.mockReturnValue(900);
    const oldTimestamp = Date.now() - 1000 * 1000;
    const payload = JSON.stringify({ token: 'expired-token', timestamp: oldTimestamp });
    mockExec(mockExecFile, payload + '\n');

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    const result = await sessionStore.getSession();
    expect(result).toBeNull();
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      'secret-tool',
      ['clear', 'service', 'vicinae-bitwarden', 'account', 'session'],
      expect.any(Object),
    );
  });

  it('does not expire when autoLockTimeout is 0', async () => {
    mockGetAutoLockSeconds.mockReturnValue(0);
    const oldTimestamp = Date.now() - 1000 * 1000;
    const payload = JSON.stringify({ token: 'still-valid', timestamp: oldTimestamp });
    mockExec(mockExecFile, payload + '\n');

    const result = await sessionStore.getSession();
    expect(result).toBe('still-valid');
  });

  it('returns null for unparseable data (old plain-text format)', async () => {
    mockExec(mockExecFile, 'legacy-session-token\n');

    const result = await sessionStore.getSession();
    expect(result).toBeNull();
  });

  it('passes correct args to secret-tool lookup', async () => {
    const payload = JSON.stringify({ token: 'tok', timestamp: Date.now() });
    mockExec(mockExecFile, payload + '\n');

    await sessionStore.getSession();

    expect(mockExecFile).toHaveBeenCalledWith(
      'secret-tool',
      ['lookup', 'service', 'vicinae-bitwarden', 'account', 'session'],
      expect.objectContaining({ timeout: 5000 }),
    );
  });
});

describe('setSession', () => {
  it('stores session with current timestamp via secret-tool spawn', async () => {
    const before = Date.now();
    mockSpawnSuccess(mockSpawn);

    await sessionStore.setSession('my-session-token');

    expect(mockSpawn).toHaveBeenCalledWith(
      'secret-tool',
      ['store', '--label=Vicinae Bitwarden', 'service', 'vicinae-bitwarden', 'account', 'session'],
      expect.objectContaining({ stdio: ['pipe', 'ignore', 'ignore'] }),
    );

    const child = mockSpawn.mock.results[0]!.value;
    const writtenData = child.stdin.write.mock.calls[0]![0];
    const parsed = JSON.parse(writtenData);
    expect(parsed.token).toBe('my-session-token');
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('rejects when spawn process exits with non-zero code', async () => {
    mockSpawnError(mockSpawn, 1);

    await expect(sessionStore.setSession('token')).rejects.toThrow(
      'secret-tool exited with code 1',
    );
  });

  it('rejects when spawn emits error', async () => {
    createSpawnChild(mockSpawn);

    await expect(sessionStore.setSession('token')).rejects.toThrow('spawn failed');
  });
});

describe('deleteSession', () => {
  it('calls secret-tool clear with correct args', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await sessionStore.deleteSession();

    expect(mockExecFile).toHaveBeenCalledWith(
      'secret-tool',
      ['clear', 'service', 'vicinae-bitwarden', 'account', 'session'],
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('does not throw when clear fails', async () => {
    mockExecError(mockExecFile, 'secret-tool: Cannot find item');

    await expect(sessionStore.deleteSession()).resolves.toBeUndefined();
  });
});
