import { useEffect } from 'react';
import { showToast, Toast } from '@vicinae/api';
import { getErrorMessage } from './bw-executor';
import { logError } from './log';
import { loadCachedVault, loadTotpSecrets } from './vault-cache';
import { extractHostname, loadFaviconCache, resolveFavicons } from './favicons';
import { checkBwGate } from './unlock-gate';
import type { GateUIState } from './unlock-gate';
import { ItemType } from './bitwarden-types';
import type { BwFolder, BwItem } from './bitwarden-types';

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not logged in') ||
    lower.includes('session') ||
    lower.includes('locked') ||
    lower.includes('invalid master password') ||
    lower.includes('unauthorized')
  );
}

export type UIState =
  | GateUIState
  | { kind: 'loading' }
  | { kind: 'vault'; items: BwItem[]; folders: BwFolder[] }
  | { kind: 'error'; title: string; message: string; retry?: () => void };

function hasTotpItem(items: BwItem[]): boolean {
  return items.some(
    (i) => i.type === ItemType.Login && i.login?.totp !== null && i.login?.totp !== undefined,
  );
}

async function handleSyncError(
  err: unknown,
  clearSession: () => Promise<void>,
  setState: React.Dispatch<React.SetStateAction<UIState>>,
  authErrorText?: string,
): Promise<void> {
  const message = getErrorMessage(err);
  if (isAuthError(message)) {
    await clearSession();
    setState({ kind: 'needs-unlock', error: authErrorText ?? message });
  } else {
    setState({
      kind: 'error',
      title: 'Failed to load vault',
      message,
      retry: () => setState({ kind: 'loading' }),
    });
  }
}

interface VaultLifecycleParams {
  session: string | null;
  state: UIState;
  setState: React.Dispatch<React.SetStateAction<UIState>>;
  setVault: (items: BwItem[], folders: BwFolder[]) => void;
  syncVault: (token: string) => Promise<void>;
  handleLogin: () => Promise<void>;
  clearSession: () => Promise<void>;
  setFaviconMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function useVaultLifecycle(params: VaultLifecycleParams) {
  const {
    session,
    state,
    setState,
    setVault,
    syncVault,
    handleLogin,
    clearSession,
    setFaviconMap,
  } = params;

  useEffect(() => {
    void (async () => {
      const map = await loadFaviconCache();
      setFaviconMap(map);

      const cached = await loadCachedVault();
      let staleCache = false;
      if (cached) {
        staleCache = hasTotpItem(cached.items) && Object.keys(await loadTotpSecrets()).length === 0;
        if (!staleCache) {
          setVault(cached.items, cached.folders);
        }
      }

      const gate = await checkBwGate(session);
      switch (gate.kind) {
        case 'bw-not-installed':
        case 'secret-tool-not-installed':
        case 'logging-in':
          setState({ kind: gate.kind });
          return;
        case 'needs-unlock':
          if (!cached || staleCache) setState({ kind: 'needs-unlock' });
          return;
        case 'error':
          setState({
            kind: 'error',
            title: gate.title,
            message: gate.message,
            retry: () => setState({ kind: 'loading' }),
          });
          return;
        case 'ready':
          break;
      }

      try {
        await syncVault(session!);
        await showToast({ style: Toast.Style.Success, title: 'Vault synced' });
      } catch (err) {
        logError('vault-lifecycle.initialSync', err);
        if (!cached || staleCache)
          await handleSyncError(err, clearSession, setState, 'Session expired');
      }
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'needs-unlock') return;
    setState({ kind: 'loading' });
  }, [session, state.kind]);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'vault') return;
    void (async () => {
      try {
        await syncVault(session);
        await showToast({ style: Toast.Style.Success, title: 'Vault synced' });
      } catch (err) {
        logError('vault-lifecycle.backgroundSync', err);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (state.kind !== 'vault') return;
    const domains: string[] = [];
    for (const item of state.items) {
      if (item.type !== ItemType.Login) continue;
      const hostname = extractHostname(item.login?.uris);
      if (hostname) domains.push(hostname);
    }
    if (domains.length === 0) return;
    let mounted = true;
    void (async () => {
      const map = await resolveFavicons(domains);
      if (mounted) setFaviconMap(map);
    })();
    return () => {
      mounted = false;
    };
  }, [state]);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'loading') return;
    void (async () => {
      const cached = await loadCachedVault();
      if (cached) {
        setVault(cached.items, cached.folders);
      }
      try {
        await syncVault(session);
      } catch (err) {
        logError('vault-lifecycle.cachedSync', err);
        if (!cached) await handleSyncError(err, clearSession, setState);
      }
    })();
  }, [session, state.kind]);

  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind]);
}
