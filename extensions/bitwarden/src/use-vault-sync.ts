import { useCallback, useState } from 'react';
import { showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { saveCachedVault } from './item-utils';
import { clearFaviconCache } from './favicons';
import type { BwFolder, BwItem } from './bitwarden-types';

export function useVaultSync(
  session: string | null,
  setVault: (items: BwItem[], folders: BwFolder[]) => void,
  resetFavicons: () => void,
) {
  const [isSyncing, setIsSyncing] = useState(false);

  const syncVault = useCallback(
    async (token: string) => {
      await bw.sync(token);
      const [items, folders] = await Promise.all([bw.listItems(token), bw.listFolders(token)]);
      await saveCachedVault(items, folders);
      setVault(items, folders);
      clearFaviconCache();
      resetFavicons();
    },
    [setVault, resetFavicons],
  );

  const handleSync = useCallback(async () => {
    if (!session) return;
    setIsSyncing(true);
    try {
      await syncVault(session);
      await showToast({ style: Toast.Style.Success, title: 'Vault synced' });
    } catch (err) {
      const message = getErrorMessage(err);
      await showToast({
        style: Toast.Style.Failure,
        title: 'Sync failed',
        message,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [session, syncVault]);

  return { syncVault, handleSync, isSyncing };
}
