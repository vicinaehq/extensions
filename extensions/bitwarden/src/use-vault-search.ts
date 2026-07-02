import { useState, useCallback, useMemo } from 'react';
import { Clipboard, showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { showFailureToast } from './toast';
import { filterItems, groupByFolder } from './item-list';
import { useSession } from './use-session';
import { createUnlockCallbacks, renderGate, useUnlockGate } from './unlock-gate';
import { useVaultSync } from './use-vault-sync';
import { useVaultLifecycle, type UIState } from './vault-lifecycle';
import { useTotpSecrets } from './use-totp-secrets';
import { computeLocalTotp, isSteamSecret } from './totp-compute';
import type { BwFolder, BwItem } from './bitwarden-types';

export function useVaultSearch(preFilter?: (items: BwItem[]) => BwItem[]) {
  const { session, unlock, clearSession, loginIfNeeded, loginError } = useSession();
  const [state, setState] = useState<UIState>({ kind: 'checking-bw' });
  const [searchText, setSearchText] = useState('');
  const [faviconMap, setFaviconMap] = useState<Record<string, string>>({});

  const setVault = useCallback((items: BwItem[], folders: BwFolder[]) => {
    setState({ kind: 'vault', items, folders });
  }, []);

  const setError = useCallback((title: string, message: string, retry?: () => void) => {
    setState({ kind: 'error', title, message, retry });
  }, []);

  const { handleLogin, handleUnlock } = useUnlockGate({
    loginIfNeeded,
    loginError,
    unlock,
    ...createUnlockCallbacks(setState, () => setState({ kind: 'loading' })),
  });

  const { syncVault, handleSync, isSyncing } = useVaultSync(session, setVault);

  useVaultLifecycle({
    session,
    state,
    setState,
    setVault,
    syncVault,
    handleLogin,
    clearSession,
    setFaviconMap,
  });

  const vaultItems = useMemo(() => (state.kind === 'vault' ? state.items : []), [state]);
  const vaultFolders = useMemo(() => (state.kind === 'vault' ? state.folders : []), [state]);
  const totpSecrets = useTotpSecrets();

  const handleCopyTotp = useCallback(
    async (id: string, cachedCode?: string) => {
      if (!session) return;
      try {
        if (cachedCode) {
          await Clipboard.copy(cachedCode);
          await showToast({ style: Toast.Style.Success, title: 'Copied TOTP' });
          return;
        }
        const item = vaultItems.find((i) => i.id === id);
        const secret = item ? item.login?.totp || totpSecrets[id] || '' : '';
        const localCode =
          secret && !isSteamSecret(secret) ? computeLocalTotp(secret, Date.now())?.code : undefined;
        const code = localCode ?? (await bw.getTotp(id, session));
        await Clipboard.copy(code);
        await showToast({ style: Toast.Style.Success, title: 'Copied TOTP' });
      } catch (err) {
        await showFailureToast(err, 'Failed to get TOTP');
      }
    },
    [session, vaultItems, totpSecrets],
  );

  const displayItems = useMemo(
    () => (preFilter ? preFilter(vaultItems) : vaultItems),
    [vaultItems, preFilter],
  );

  const filtered = useMemo(() => filterItems(displayItems, searchText), [displayItems, searchText]);
  const grouped = useMemo(() => groupByFolder(filtered, vaultFolders), [filtered, vaultFolders]);

  const clearGateError = useCallback(() => {
    setState({ kind: 'needs-unlock' });
  }, []);

  const gateRender = renderGate(state, handleUnlock, handleLogin, clearGateError);

  const isLoading =
    state.kind === 'checking-bw' ||
    state.kind === 'logging-in' ||
    state.kind === 'loading' ||
    isSyncing;

  const sortedSections = useMemo(
    () => [...grouped.entries()].sort(([, a], [, b]) => a.folderName.localeCompare(b.folderName)),
    [grouped],
  );

  return {
    state,
    session,
    searchText,
    setSearchText,
    faviconMap,
    setFaviconMap,
    vaultItems,
    vaultFolders,
    handleUnlock,
    handleLogin,
    handleSync,
    handleCopyTotp,
    totpSecrets,
    isSyncing,
    gateRender,
    isLoading,
    sortedSections,
    filtered,
    grouped,
    setError,
  };
}
