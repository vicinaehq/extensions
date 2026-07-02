import { describe, expect, it, vi } from 'vitest';

const { mockBw, mockPrefs } = vi.hoisted(() => {
  const mockBw = {
    generatePassword: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  };

  const mockPrefs = {
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
  };

  return { mockBw, mockPrefs };
});

// fallow-ignore-next-line code-duplication
const mockClipboardCopy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => mockBw);

vi.mock('../preferences', () => ({
  getPreferences: () => mockPrefs,
  getPasswordPrefs: (prefs: typeof mockPrefs) => ({
    length: Number(prefs.passwordLength) || 20,
    uppercase: prefs.passwordUppercase,
    lowercase: prefs.passwordLowercase,
    numbers: prefs.passwordNumbers,
    symbols: prefs.passwordSymbols,
  }),
}));

vi.mock('@vicinae/api', async () => {
  const { createVicinaeApiMock } = await vi.importActual<
    typeof import('./__utils__/vicinae-mocks')
  >('./__utils__/vicinae-mocks');
  return createVicinaeApiMock(mockClipboardCopy, mockShowToast);
});

import GeneratePassword from '../generate-password';

describe('GeneratePassword', () => {
  it('generates a password and copies to clipboard', async () => {
    mockBw.generatePassword.mockResolvedValue('aB3$xY9!pQ2&wE5!rT');

    await GeneratePassword();

    expect(mockClipboardCopy).toHaveBeenCalledWith('aB3$xY9!pQ2&wE5!rT');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'success', title: 'Password generated' }),
    );
  });

  it('shows failure toast on generation error', async () => {
    mockBw.generatePassword.mockRejectedValue(new Error('CLI error'));

    await GeneratePassword();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'failure', title: 'Generation failed' }),
    );
  });
});
