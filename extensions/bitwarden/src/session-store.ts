import { getAutoLockSeconds, getPreferences } from './preferences';
import { secretStore, secretLookup, secretClear } from './secret-store';
import { safeJsonParse } from './json-utils';

export { checkSecretToolInstalled } from './secret-store';

const ACCOUNT = 'session';

interface SessionPayload {
  token: string;
  timestamp: number;
}

export async function getSession(): Promise<string | null> {
  try {
    const raw = await secretLookup(ACCOUNT);
    if (!raw) return null;

    const parsed = safeJsonParse<{ token: string; timestamp: number }>(raw, {
      strings: ['token'],
      numbers: ['timestamp'],
    });
    if (!parsed) return null;

    const timeout = getAutoLockSeconds(getPreferences());
    if (timeout > 0 && Date.now() - parsed.timestamp > timeout * 1000) {
      await deleteSession();
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export async function setSession(token: string): Promise<void> {
  const payload: SessionPayload = { token, timestamp: Date.now() };
  await secretStore(ACCOUNT, JSON.stringify(payload), 'Vicinae Bitwarden');
}

export async function deleteSession(): Promise<void> {
  await secretClear(ACCOUNT);
}
