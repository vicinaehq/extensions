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
import { hasTotp } from './item-list';

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

  async function runInitialLoad(
    session: string | null,
    setState: React.Dispatch<React.SetStateAction<UIState>>,
    setVault: (items: BwItem[], folders: BwFolder[]) => void,
    setFaviconMap: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    handleLogin: () => Promise<void>,
    syncVault: (token: string) => Promise<void>,
    clearSession: () => Promise<void>,
  ) {
    const map = await loadFaviconCache();
    setFaviconMap(map);

    const cached = await loadCachedVault();
    let staleCache = false;
    if (cached) {
      staleCache = cached.items.some(hasTotp) && Object.keys(await loadTotpSecrets()).length === 0;
      if (!staleCache) {
        setVault(cached.items, cached.folders);
      }
    }

    const noUsableCache = !cached || staleCache;
    const optimistic = !session && noUsableCache;
    if (optimistic) {
      setState({ kind: 'needs-unlock' });
    }

    const gate = await checkBwGate(session);
    switch (gate.kind) {
      case 'bw-not-installed':
      case 'secret-tool-not-installed':
        setState({ kind: gate.kind });
        return;
      case 'logging-in':
        if (optimistic) {
          void handleLogin();
        } else {
          setState({ kind: gate.kind });
        }
        return;
      case 'needs-unlock':
        if (noUsableCache) setState({ kind: 'needs-unlock' });
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
  }

  useEffect(() => {
    void runInitialLoad(
      session,
      setState,
      setVault,
      setFaviconMap,
      handleLogin,
      syncVault,
      clearSession,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'needs-unlock') return;
    setState({ kind: 'loading' });
  }, [session, state.kind, setState]);

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
    // Intentionally only re-runs on session change, not state.kind/syncVault.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [state, setFaviconMap]);

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
  }, [session, state.kind, setVault, syncVault, clearSession, setState]);

  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind, handleLogin]);
}
