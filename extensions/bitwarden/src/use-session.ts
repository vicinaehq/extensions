import { LocalStorage } from '@vicinae/api';
import { useCallback, useEffect, useState } from 'react';
import { getPreferences, getServerUrl } from './preferences';
import * as bw from './bw-executor';
import type { Session } from './bw-executor';
import { getErrorMessage } from './bw-executor';

export const SESSION_KEY = 'vicinae-bitwarden-session';

interface SessionState {
  session: Session | null;
  unlock: (masterPassword: string) => Promise<Session>;
  clearSession: () => Promise<void>;
  loginIfNeeded: () => Promise<void>;
  isLoggingIn: boolean;
  loginError: string | null;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const cached = await LocalStorage.getItem<string>(SESSION_KEY);
      if (cached) {
        setSession(cached);
      }
    })();
  }, []);

  const loginIfNeeded = useCallback(async () => {
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const prefs = getPreferences();
      const serverUrl = getServerUrl(prefs);

      await bw.login({
        clientId: prefs.apiClientId,
        clientSecret: prefs.apiClientSecret,
        serverUrl,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      setLoginError(message);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const unlock = useCallback(async (masterPassword: string): Promise<Session> => {
    const token = await bw.unlock(masterPassword);
    await LocalStorage.setItem(SESSION_KEY, token);
    setSession(token);
    return token;
  }, []);

  const clearSession = useCallback(async () => {
    await LocalStorage.removeItem(SESSION_KEY);
    setSession(null);
    if (session) {
      void bw.lock(session).catch(() => {
        // Non-fatal — session already cleared client-side
      });
    }
  }, [session]);

  return { session, unlock, clearSession, loginIfNeeded, isLoggingIn, loginError };
}
