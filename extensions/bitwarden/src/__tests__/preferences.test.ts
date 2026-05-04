import { describe, expect, it, vi } from 'vitest';

vi.mock('@vicinae/api', () => ({
  getPreferenceValues: vi.fn(),
  LocalStorage: {},
}));

import { getServerUrl } from '../preferences';

function prefs(
  overrides: Partial<{
    serverRegion: 'bitwarden.com' | 'bitwarden.eu' | 'self-hosted';
    customServerUrl: string;
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
    apiClientId: 'x',
    apiClientSecret: 'x',
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
