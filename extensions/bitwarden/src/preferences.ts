import { getPreferenceValues } from '@vicinae/api';

interface Preferences {
  serverRegion: 'bitwarden.com' | 'bitwarden.eu' | 'self-hosted';
  customServerUrl: string;
  customCertPath: string;
  bitwardenApiClientId: string;
  bitwardenApiClientSecret: string;
  autoLockTimeout: string;
  downloadDir: string;
  passwordLength: string;
  passwordUppercase: boolean;
  passwordLowercase: boolean;
  passwordNumbers: boolean;
  passwordSymbols: boolean;
}

interface PasswordPrefs {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function getAutoLockSeconds(prefs: Preferences): number {
  return Math.max(0, Number(prefs.autoLockTimeout) || 0);
}

export function getServerUrl(prefs: Preferences): string {
  if (prefs.serverRegion === 'self-hosted') {
    const url = prefs.customServerUrl.trim();
    if (!url) {
      throw new Error(
        'Custom Server URL is required when using Self-hosted. Set it in extension preferences.',
      );
    }
    return url.replace(/\/+$/, '');
  }
  return `https://${prefs.serverRegion}`;
}

export function getDownloadDir(prefs: Preferences): string {
  const dir = (prefs.downloadDir ?? '').trim();
  if (dir) return dir.replace(/\/+$/, '');
  return `${process.env.HOME ?? '/tmp'}/Downloads`;
}

export function getPasswordPrefs(prefs: Preferences): PasswordPrefs {
  const length = Math.max(5, Math.min(128, Number(prefs.passwordLength) || 20));
  return {
    length,
    uppercase: prefs.passwordUppercase,
    lowercase: prefs.passwordLowercase,
    numbers: prefs.passwordNumbers,
    symbols: prefs.passwordSymbols,
  };
}
