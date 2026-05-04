import { getPreferenceValues } from '@vicinae/api';

interface Preferences {
  serverRegion: 'bitwarden.com' | 'bitwarden.eu' | 'self-hosted';
  customServerUrl: string;
  apiClientId: string;
  apiClientSecret: string;
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
