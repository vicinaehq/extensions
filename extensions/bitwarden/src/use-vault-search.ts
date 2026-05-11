import { useState, useCallback, useMemo } from 'react';
import { Clipboard, showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { showFailureToast } from './item-utils';
import { filterItems, groupByFolder } from './item-utils';
import { useSession } from './use-session';
import { createUnlockCallbacks, renderGate, useUnlockGate } from './unlock-gate';
import { useVaultSync } from './use-vault-sync';
import { useVaultLifecycle, type UIState } from './vault-lifecycle';
import type { BwFolder, BwItem } from './bitwarden-types';

export function useVaultSearch(preFilter?: (items: BwItem[]) => BwItem[]) {
  const { session, unlock, clearSession, loginIfNeeded, loginError } = useSession();
  const [state, setState] = useState<UIState>({ kind: 'checking-bw' });
  const [searchText, setSearchText] = useState('');
  const [faviconMap, setFaviconMap] = useState<Record<string, string>>({});

  const setVault = useCallback((items: BwItem[], folders: BwFolder[]) => {
    setState({ kind: 'vault', items, folders });
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

  const vaultItems = state.kind === 'vault' ? state.items : [];
  const vaultFolders = state.kind === 'vault' ? state.folders : [];

  const handleCopyTotp = useCallback(
    async (id: string) => {
      if (!session) return;
      try {
        const totp = await bw.getTotp(id, session);
        await Clipboard.copy(totp);
        await showToast({ style: Toast.Style.Success, title: 'Copied TOTP' });
      } catch (err) {
        await showFailureToast(err, 'Failed to get TOTP');
      }
    },
    [session],
  );

  const displayItems = useMemo(
    () => (preFilter ? preFilter(vaultItems) : vaultItems),
    [vaultItems, preFilter],
  );

  const filtered = useMemo(() => filterItems(displayItems, searchText), [displayItems, searchText]);
  const grouped = useMemo(() => groupByFolder(filtered, vaultFolders), [filtered, vaultFolders]);

  const gateRender = renderGate(state, handleUnlock, handleLogin);

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
    isSyncing,
    gateRender,
    isLoading,
    sortedSections,
    filtered,
    grouped,
  };
}
