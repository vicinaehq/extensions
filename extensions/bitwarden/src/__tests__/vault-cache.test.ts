import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockSecretLookup = vi.hoisted(() => vi.fn());
const mockSecretStore = vi.hoisted(() => vi.fn());
const mockSecretClear = vi.hoisted(() => vi.fn());

vi.mock('../secret-store', () => ({
  secretLookup: mockSecretLookup,
  secretStore: mockSecretStore,
  secretClear: mockSecretClear,
}));

vi.mock('@vicinae/api', () => ({
  LocalStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { clearSendKeys, clearTotpSecrets, loadTotpSecrets, saveTotpSecrets } from '../vault-cache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadTotpSecrets', () => {
  it('parses the stored JSON blob', async () => {
    mockSecretLookup.mockResolvedValue('{"a":"ONE","b":"TWO"}');
    await expect(loadTotpSecrets()).resolves.toEqual({ a: 'ONE', b: 'TWO' });
    expect(mockSecretLookup).toHaveBeenCalledWith('totp-secrets');
  });

  it('returns {} when the keyring has no entry', async () => {
    mockSecretLookup.mockResolvedValue(null);
    await expect(loadTotpSecrets()).resolves.toEqual({});
  });

  it('returns {} when JSON parsing fails', async () => {
    mockSecretLookup.mockResolvedValue('not-json');
    await expect(loadTotpSecrets()).resolves.toEqual({});
  });
});

describe('saveTotpSecrets', () => {
  it('serializes the map and stores it under the totp-secrets account', async () => {
    await saveTotpSecrets({ a: 'ONE' });
    expect(mockSecretStore).toHaveBeenCalledWith(
      'totp-secrets',
      JSON.stringify({ a: 'ONE' }),
      'Vicinae Bitwarden TOTP',
    );
  });
});

describe('clearTotpSecrets', () => {
  it('clears the totp-secrets keyring entry', async () => {
    await clearTotpSecrets();
    expect(mockSecretClear).toHaveBeenCalledWith('totp-secrets');
  });
});

describe('clearSendKeys', () => {
  it('clears the sends-keys keyring entry', async () => {
    await clearSendKeys();
    expect(mockSecretClear).toHaveBeenCalledWith('sends-keys');
  });
});
