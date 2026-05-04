import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from '@vicinae/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import {
  clearCachedVault,
  filterItems,
  itemActions as getItemActions,
  groupByFolder,
  itemIcon,
  itemSubtitle,
  itemTypeLabel,
  loadCachedVault,
} from './item-utils';
import { useSession } from './use-session';
import { checkBwGate, renderUnlockGate, useUnlockGate } from './unlock-gate';
import { useVaultSync } from './use-vault-sync';
import ItemDetailView, { renderItemActionElements } from './item-detail-view';
import EditItem from './edit-item';
import { loadFaviconCache, resolveFavicons } from './favicons';
import type { BwFolder, BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';

type UIState =
  | { kind: 'checking-bw' }
  | { kind: 'bw-not-installed' }
  | { kind: 'logging-in' }
  | { kind: 'needs-unlock'; error?: string }
  | { kind: 'unlocking' }
  | { kind: 'loading' }
  | { kind: 'vault'; items: BwItem[]; folders: BwFolder[] };

// Module-level cache for instant synchronous initial render
let memoryVault: { items: BwItem[]; folders: BwFolder[] } | null = null;

export default function SearchVault() {
  const { session, unlock, clearSession, loginIfNeeded, loginError } = useSession();
  const [state, setState] = useState<UIState>(() => {
    if (memoryVault) {
      return { kind: 'vault', items: memoryVault.items, folders: memoryVault.folders };
    }
    return { kind: 'checking-bw' };
  });

  const setVault = (items: BwItem[], folders: BwFolder[]) => {
    memoryVault = { items, folders };
    setState({ kind: 'vault', items, folders });
  };

  const [searchText, setSearchText] = useState('');
  const [faviconMap, setFaviconMap] = useState<Record<string, string>>({});
  const { push } = useNavigation();

  const { handleLogin, handleUnlock } = useUnlockGate({
    loginIfNeeded,
    loginError,
    unlock,
    onUnlockStart: () => setState({ kind: 'unlocking' }),
    onUnlockReady: () => setState({ kind: 'loading' }),
    onUnlockError: (error) => setState({ kind: 'needs-unlock', error }),
    onLoginReady: () => setState({ kind: 'needs-unlock' }),
    onLoginError: (error) => setState({ kind: 'needs-unlock', error }),
  });

  const { syncVault, handleSync, isSyncing } = useVaultSync(session, setVault, () =>
    setFaviconMap({}),
  );

  // Step 1: Load cached vault immediately, run bw checks in parallel
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
        case 'logging-in':
          setState({ kind: gate.kind });
          return;
        case 'needs-unlock':
          if (!cached) setState({ kind: 'needs-unlock' });
          return;
        case 'ready':
          break;
      }

      // Sync in background (cache already shown above) — session is non-null at this point
      try {
        await syncVault(session!);
      } catch {
        if (!cached) {
          await clearSession();
          setState({ kind: 'needs-unlock', error: 'Session expired' });
        }
      }
    })();
  }, []);

  // Step 1b: when session resolves after mount, try loading
  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'needs-unlock') return;

    setState({ kind: 'loading' });
  }, [session, state.kind]);

  // Step 1c: when session appears while vault is already showing (cache loaded first)
  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'vault') return;

    void (async () => {
      try {
        await syncVault(session);
      } catch {
        // Cache already showing — silent fail
      }
    })();
  }, [session]);

  // Resolve favicons after vault appears (catches both cached and fresh loads)
  useEffect(() => {
    if (state.kind !== 'vault') return;

    const domains: string[] = [];
    for (const item of state.items) {
      if (item.type === ItemType.Login && item.login?.uris?.[0]?.uri) {
        try {
          domains.push(new URL(item.login.uris[0].uri).hostname);
        } catch {
          // skip
        }
      }
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

  // Step 2: When state becomes "loading" and session is available, load vault
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
          const message = getErrorMessage(err);
          await showToast({ style: Toast.Style.Failure, title: 'Failed to load vault', message });
          await clearSession();
          setState({ kind: 'needs-unlock', error: message });
        }
      }
    })();
  }, [session, state.kind]);

  // Step 2: When login is needed, attempt login
  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind]);

  // Lock handler
  const handleLock = useCallback(async () => {
    await clearSession();
    await clearCachedVault();
    setState({ kind: 'needs-unlock' });
  }, [clearSession]);

  // --- Derived data (must be unconditional — hooks rules) ---
  const vaultItems = state.kind === 'vault' ? state.items : [];
  const vaultFolders = state.kind === 'vault' ? state.folders : [];

  const filtered = useMemo(() => filterItems(vaultItems, searchText), [vaultItems, searchText]);
  const grouped = useMemo(() => groupByFolder(filtered, vaultFolders), [filtered, vaultFolders]);

  const handleCopyTotp = useCallback(
    async (id: string) => {
      if (!session) return;
      try {
        const totp = await bw.getTotp(id, session);
        await Clipboard.copy(totp);
        await showToast({ style: Toast.Style.Success, title: 'Copied TOTP' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await showToast({
          style: Toast.Style.Failure,
          title: 'Failed to get TOTP',
          message,
        });
      }
    },
    [session],
  );

  // --- Render based on state ---

  const gateRender = renderUnlockGate(
    state.kind,
    state.kind === 'needs-unlock' ? state.error : undefined,
    handleUnlock,
  );
  if (gateRender) return gateRender;

  // All vault states share a single persistent List to keep handler IDs stable
  const isLoading =
    state.kind === 'checking-bw' ||
    state.kind === 'logging-in' ||
    state.kind === 'loading' ||
    isSyncing;

  const sortedSections = [...grouped.entries()].sort(([, a], [, b]) =>
    a.folderName.localeCompare(b.folderName),
  );

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search vault by name..."
      throttle
    >
      {state.kind === 'vault' ? (
        sortedSections.length === 0 ? (
          <List.EmptyView
            title={searchText ? 'No matching items' : 'No items in vault'}
            description={
              searchText
                ? 'Try a different search or Sync to refresh your vault'
                : 'Sync to pull your vault data, or create an item'
            }
          />
        ) : (
          sortedSections.map(([folderId, { folderName, items: sectionItems }]) => (
            <List.Section key={folderId ?? 'unfiled'} title={folderName}>
              {sectionItems.map((item) => (
                <List.Item
                  key={item.id}
                  icon={itemIcon(item, faviconMap)}
                  title={item.name}
                  subtitle={itemSubtitle(item)}
                  accessories={[{ text: itemTypeLabel(item) }]}
                  actions={
                    <ActionPanel>
                      {renderItemActions(
                        item,
                        session,
                        handleCopyTotp,
                        push,
                        vaultFolders,
                        handleSync,
                      )}
                      <Action title="Sync Vault" icon={Icon.ArrowClockwise} onAction={handleSync} />
                      <Action title="Lock Vault" icon={Icon.Lock} onAction={handleLock} />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          ))
        )
      ) : (
        <List.EmptyView title="Loading..." />
      )}
    </List>
  );
}

function renderItemActions(
  item: BwItem,
  session: bw.Session | null,
  onCopyTotp: (id: string) => Promise<void>,
  push: ReturnType<typeof useNavigation>['push'],
  folders: BwFolder[],
  onSync: () => Promise<void>,
) {
  const actions = getItemActions(item);
  const folderName = item.folderId
    ? (folders.find((f) => f.id === item.folderId)?.name ?? item.folderId)
    : undefined;

  return (
    <>
      <Action
        title="View Details"
        icon={Icon.Eye}
        onAction={() => {
          push(
            <ItemDetailView
              item={item}
              session={session}
              onCopyTotp={onCopyTotp}
              folderName={folderName}
            />,
          );
        }}
      />
      {renderItemActionElements(actions, onCopyTotp, item.id)}
      {session && (
        <Action
          title="Edit Item"
          icon={Icon.Pencil}
          onAction={() => {
            push(<EditItem item={item} session={session} onSaved={() => void onSync()} />);
          }}
        />
      )}
    </>
  );
}
