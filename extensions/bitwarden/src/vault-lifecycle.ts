import { useEffect } from 'react';
import { showToast, Toast } from '@vicinae/api';
import { showFailureToast } from './item-utils';
import { loadCachedVault } from './vault-cache';
import { extractHostname, loadFaviconCache, resolveFavicons } from './favicons';
import { checkBwGate } from './unlock-gate';
import type { GateUIState } from './unlock-gate';
import { ItemType } from './bitwarden-types';
import type { BwFolder, BwItem } from './bitwarden-types';

export type UIState =
  | GateUIState
  | { kind: 'loading' }
  | { kind: 'vault'; items: BwItem[]; folders: BwFolder[] };

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
      if (cached) {
        setVault(cached.items, cached.folders);
      }

      const gate = await checkBwGate(session);
      switch (gate.kind) {
        case 'bw-not-installed':
        case 'secret-tool-not-installed':
        case 'logging-in':
          setState({ kind: gate.kind });
          return;
        case 'needs-unlock':
          if (!cached) setState({ kind: 'needs-unlock' });
          return;
        case 'ready':
          break;
      }

      try {
        await syncVault(session!);
        await showToast({ style: Toast.Style.Success, title: 'Vault synced' });
      } catch {
        if (!cached) {
          await clearSession();
          setState({ kind: 'needs-unlock', error: 'Session expired' });
        }
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
      } catch {
        // Cache already showing — silent fail
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
        if (!cached) {
          const message = await showFailureToast(err, 'Failed to load vault');
          await clearSession();
          setState({ kind: 'needs-unlock', error: message });
        }
      }
    })();
  }, [session, state.kind]);

  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind]);
}
