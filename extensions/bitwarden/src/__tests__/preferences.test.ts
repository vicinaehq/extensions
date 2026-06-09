import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@vicinae/api', () => ({
  getPreferenceValues: vi.fn(),
  LocalStorage: {},
}));

import { getServerUrl, getAutoLockSeconds, getDownloadDir, getPasswordPrefs } from '../preferences';

function prefs(
  overrides: Partial<{
    serverRegion: 'bitwarden.com' | 'bitwarden.eu' | 'self-hosted';
    customServerUrl: string;
    customCertPath: string;
    autoLockTimeout: string;
    downloadDir: string;
    passwordLength: string;
    passwordUppercase: boolean;
    passwordLowercase: boolean;
    passwordNumbers: boolean;
    passwordSymbols: boolean;
  }> = {},
) {
  return {
    serverRegion: 'bitwarden.com' as const,
    customServerUrl: '',
    customCertPath: '',
    bitwardenApiClientId: 'x',
    bitwardenApiClientSecret: 'x',
    autoLockTimeout: '21600',
    downloadDir: '',
    passwordLength: '20',
    passwordUppercase: true,
    passwordLowercase: true,
    passwordNumbers: true,
    passwordSymbols: true,
    ...overrides,
  };
}

describe('getServerUrl', () => {
  it('returns https://bitwarden.com for US cloud region', () => {
    expect(getServerUrl(prefs({ serverRegion: 'bitwarden.com' }))).toBe('https://bitwarden.com');
  });

  it('returns https://bitwarden.eu for EU cloud region', () => {
    expect(getServerUrl(prefs({ serverRegion: 'bitwarden.eu' }))).toBe('https://bitwarden.eu');
  });

  it('returns custom server URL for self-hosted region', () => {
    expect(
      getServerUrl(
        prefs({ serverRegion: 'self-hosted', customServerUrl: 'https://vault.example.com' }),
      ),
    ).toBe('https://vault.example.com');
  });

  it('strips trailing slashes from self-hosted URL', () => {
    expect(
      getServerUrl(
        prefs({ serverRegion: 'self-hosted', customServerUrl: 'https://vault.example.com///' }),
      ),
    ).toBe('https://vault.example.com');
  });

  it('throws when self-hosted URL is empty', () => {
    expect(() => getServerUrl(prefs({ serverRegion: 'self-hosted', customServerUrl: '' }))).toThrow(
      'Custom Server URL is required',
    );
  });

  it('throws when self-hosted URL is whitespace only', () => {
    expect(() =>
      getServerUrl(prefs({ serverRegion: 'self-hosted', customServerUrl: '   ' })),
    ).toThrow('Custom Server URL is required');
  });
});

describe('getAutoLockSeconds', () => {
  it('returns 0 for "Never" (value "0")', () => {
    expect(getAutoLockSeconds(prefs({ autoLockTimeout: '0' }))).toBe(0);
  });

  it('returns 900 for 15 minutes', () => {
    expect(getAutoLockSeconds(prefs({ autoLockTimeout: '900' }))).toBe(900);
  });

  it('returns 21600 for 6 hours (default)', () => {
    expect(getAutoLockSeconds(prefs({ autoLockTimeout: '21600' }))).toBe(21600);
  });

  it('returns 0 for invalid values', () => {
    expect(getAutoLockSeconds(prefs({ autoLockTimeout: 'invalid' }))).toBe(0);
  });

  it('returns 0 for negative values', () => {
    expect(getAutoLockSeconds(prefs({ autoLockTimeout: '-500' }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDownloadDir
// ---------------------------------------------------------------------------
describe('getDownloadDir', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('returns the configured download directory when set', () => {
    process.env.HOME = '/home/user';
    expect(getDownloadDir(prefs({ downloadDir: '/custom/downloads' }))).toBe('/custom/downloads');
  });

  it('strips trailing slashes from configured download directory', () => {
    process.env.HOME = '/home/user';
    expect(getDownloadDir(prefs({ downloadDir: '/custom/downloads///' }))).toBe(
      '/custom/downloads',
    );
  });

  it('falls back to HOME/Downloads when downloadDir is empty', () => {
    process.env.HOME = '/home/user';
    expect(getDownloadDir(prefs({ downloadDir: '' }))).toBe('/home/user/Downloads');
  });

  it('falls back to HOME/Downloads when downloadDir is whitespace only', () => {
    process.env.HOME = '/home/user';
    expect(getDownloadDir(prefs({ downloadDir: '   ' }))).toBe('/home/user/Downloads');
  });

  it('falls back to /tmp/Downloads when HOME is unset', () => {
    delete process.env.HOME;
    expect(getDownloadDir(prefs({ downloadDir: '' }))).toBe('/tmp/Downloads');
  });
});

// ---------------------------------------------------------------------------
// getPasswordPrefs
// ---------------------------------------------------------------------------
describe('getPasswordPrefs', () => {
  it('extracts password preferences from full preferences object', () => {
    const result = getPasswordPrefs(
      prefs({
        passwordLength: '20',
        passwordUppercase: true,
        passwordLowercase: true,
        passwordNumbers: true,
        passwordSymbols: true,
      }),
    );
    expect(result).toEqual({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });
  });

  it('clamps length to minimum of 5', () => {
    const result = getPasswordPrefs(
      prefs({ passwordLength: '1', passwordUppercase: true, passwordLowercase: true }),
    );
    expect(result.length).toBe(5);
  });

  it('clamps length to maximum of 128', () => {
    const result = getPasswordPrefs(
      prefs({ passwordLength: '999', passwordUppercase: true, passwordLowercase: true }),
    );
    expect(result.length).toBe(128);
  });

  it('defaults length to 20 when value is invalid', () => {
    const result = getPasswordPrefs(
      prefs({
        passwordLength: 'not-a-number',
        passwordUppercase: true,
        passwordLowercase: true,
      }),
    );
    expect(result.length).toBe(20);
  });

  it('preserves boolean preferences correctly', () => {
    const result = getPasswordPrefs(
      prefs({
        passwordLength: '16',
        passwordUppercase: false,
        passwordLowercase: true,
        passwordNumbers: false,
        passwordSymbols: false,
      }),
    );
    expect(result).toEqual({
      length: 16,
      uppercase: false,
      lowercase: true,
      numbers: false,
      symbols: false,
    });
  });
});
