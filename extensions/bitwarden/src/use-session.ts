import { useCallback, useEffect, useState } from 'react';
import { getPreferences, getServerUrl } from './preferences';
import * as bw from './bw-executor';
import type { Session } from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { deleteSession, getSession, setSession as storeSession } from './session-store';
import {
  getApiCredentials,
  storeApiCredentials,
  clearApiCredentialsFromDisk,
} from './api-credential-store';
import { clearCachedSends, clearCachedVault, clearSendKeys, clearTotpSecrets } from './vault-cache';
import { logError } from './log';

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
      const cached = await getSession();
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

      const prefClientId = prefs.bitwardenApiClientId;
      const prefClientSecret = prefs.bitwardenApiClientSecret;
      const libsecretCreds = await getApiCredentials();

      if (libsecretCreds) {
        const isRotated =
          prefClientId &&
          prefClientSecret &&
          (prefClientId !== libsecretCreds.clientId ||
            prefClientSecret !== libsecretCreds.clientSecret);

        if (isRotated) {
          // Account/credential switch — wipe the previous account's cached
          // material before swapping in the new session, so a different
          // user's TOTP secrets, send keys, or cached vault never persist
          // beyond the credential rotation.
          await clearTotpSecrets();
          await clearSendKeys();
          await clearCachedVault();
          await clearCachedSends();
          await bw.login({
            clientId: prefClientId,
            clientSecret: prefClientSecret,
            serverUrl,
          });
          await storeApiCredentials(prefClientId, prefClientSecret);
        } else {
          await bw.login({
            clientId: libsecretCreds.clientId,
            clientSecret: libsecretCreds.clientSecret,
            serverUrl,
          });
        }
      } else {
        if (!prefClientId || !prefClientSecret) {
          throw new Error('No API credentials configured');
        }

        await bw.login({
          clientId: prefClientId,
          clientSecret: prefClientSecret,
          serverUrl,
        });

        try {
          await storeApiCredentials(prefClientId, prefClientSecret);
        } catch (err) {
          // Migration failure is non-fatal — login already succeeded
          logError('useSession.credentialMigration', err);
        }
      }

      void clearApiCredentialsFromDisk();
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
    await storeSession(token);
    setSession(token);
    return token;
  }, []);

  const clearSession = useCallback(async () => {
    await deleteSession();
    await clearCachedSends();
    setSession(null);
    if (session) {
      void bw.lock(session).catch((err) => {
        // Non-fatal — session already cleared client-side
        logError('useSession.lock', err);
      });
    }
  }, [session]);

  return { session, unlock, clearSession, loginIfNeeded, isLoggingIn, loginError };
}
