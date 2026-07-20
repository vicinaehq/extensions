import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockExec, mockExecError, mockSpawnSuccess, mockSpawnError } from './__utils__/exec-mocks';

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  default: { execFile: mockExecFile, spawn: mockSpawn },
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock('node:util', () => ({
  default: { promisify: (fn: unknown) => fn },
  promisify: (fn: unknown) => fn,
}));

let secretStore: typeof import('../secret-store');

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  secretStore = await import('../secret-store');
});

describe('secretLookup', () => {
  it('returns trimmed stdout when secret-tool succeeds', async () => {
    mockExec(mockExecFile, 'my-secret-value\n');
    const result = await secretStore.secretLookup('test-account');
    expect(result).toBe('my-secret-value');
    expect(mockExecFile).toHaveBeenCalledWith(
      'secret-tool',
      ['lookup', 'service', 'vicinae-bitwarden', 'account', 'test-account'],
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('returns null when stdout is empty', async () => {
    mockExec(mockExecFile, '\n');
    const result = await secretStore.secretLookup('test-account');
    expect(result).toBeNull();
  });

  it('returns null when secret-tool fails', async () => {
    mockExecError(mockExecFile, 'Cannot find item');
    const result = await secretStore.secretLookup('test-account');
    expect(result).toBeNull();
  });
});

describe('secretStore', () => {
  it('stores data via secret-tool spawn', async () => {
    mockSpawnSuccess(mockSpawn);

    await secretStore.secretStore('test-account', '{"key":"val"}', 'My Label');

    expect(mockSpawn).toHaveBeenCalledWith(
      'secret-tool',
      ['store', '--label=My Label', 'service', 'vicinae-bitwarden', 'account', 'test-account'],
      expect.objectContaining({ stdio: ['pipe', 'ignore', 'ignore'] }),
    );
  });

  it('rejects when spawn exits with non-zero', async () => {
    mockSpawnError(mockSpawn, 1);
    await expect(secretStore.secretStore('test', 'data', 'Label')).rejects.toThrow(
      'secret-tool exited with code 1',
    );
  });
});

describe('secretClear', () => {
  it('clears secret from keychain', async () => {
    mockExec(mockExecFile, '');
    await secretStore.secretClear('test-account');
    expect(mockExecFile).toHaveBeenCalledWith(
      'secret-tool',
      ['clear', 'service', 'vicinae-bitwarden', 'account', 'test-account'],
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('does not throw when clear fails', async () => {
    mockExecError(mockExecFile, 'Cannot find item');
    await expect(secretStore.secretClear('test-account')).resolves.toBeUndefined();
  });
});

describe('checkSecretToolInstalled', () => {
  it('returns true when lookup succeeds', async () => {
    mockExec(mockExecFile, 'token\n');
    const result = await secretStore.checkSecretToolInstalled();
    expect(result).toBe(true);
  });

  it('returns false when binary not found', async () => {
    const err = new Error('ENOENT') as Error & { code: string };
    err.code = 'ENOENT';
    mockExecFile.mockRejectedValueOnce(err);
    const result = await secretStore.checkSecretToolInstalled();
    expect(result).toBe(false);
  });

  it('returns true when lookup fails for other reasons', async () => {
    mockExecError(mockExecFile, 'Cannot find item');
    const result = await secretStore.checkSecretToolInstalled();
    expect(result).toBe(true);
  });

  it('caches result after first call', async () => {
    mockExec(mockExecFile, 'token\n');
    await secretStore.checkSecretToolInstalled();
    await secretStore.checkSecretToolInstalled();
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });
});
