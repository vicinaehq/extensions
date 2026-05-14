import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useEffect, useRef, useState } from 'react';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { formatTotp, itemIcon, itemSubtitle } from './item-utils';
import { useVaultSearch } from './use-vault-search';
import type { BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import { computeLocalTotp, isSteamSecret } from './totp-compute';

function totpItems(items: BwItem[]): BwItem[] {
  return items.filter(
    (item) =>
      item.type === ItemType.Login && item.login?.totp !== null && item.login?.totp !== undefined,
  );
}

const WINDOW_MS = 30_000;
const CLI_FETCH_CONCURRENCY = 5;

interface CachedCode {
  code: string;
  window: number;
}

function currentWindow(now: number): number {
  return Math.floor(now / WINDOW_MS);
}

function countdownFor(now: number): number {
  return 30 - Math.floor((now / 1000) % 30);
}

function needsCliFetch(
  item: BwItem,
  win: number,
  totpSecrets: Record<string, string>,
  cliCache: Record<string, CachedCode>,
): boolean {
  if (cliCache[item.id]?.window === win) return false;
  const secret = item.login?.totp || totpSecrets[item.id] || '';
  if (isSteamSecret(secret)) return true;
  return computeLocalTotp(secret, Date.now()) === null;
}

export default function SearchTotp() {
  const {
    state,
    session,
    searchText,
    setSearchText,
    faviconMap,
    handleSync,
    handleCopyTotp,
    totpSecrets,
    gateRender,
    isLoading,
    sortedSections,
    setError,
  } = useVaultSearch(totpItems);

  const [now, setNow] = useState(() => Date.now());
  const [cliCache, setCliCache] = useState<Record<string, CachedCode>>({});
  const errorRaisedRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const win = currentWindow(now);
  const countdown = countdownFor(now);

  // Fetch only the items that can't be computed locally (Steam/unparseable).
  useEffect(() => {
    if (!session || state.kind !== 'vault') return;
    const cliStale = totpItems(state.items)
      .filter((item) => needsCliFetch(item, win, totpSecrets, cliCache))
      .map((i) => i.id);
    if (cliStale.length === 0) return;

    let cancelled = false;
    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const i = cursor++;
        if (i >= cliStale.length) return;
        const id = cliStale[i];
        try {
          const code = await bw.getTotp(id, session);
          if (cancelled) return;
          setCliCache((prev) => ({
            ...prev,
            [id]: { code, window: currentWindow(Date.now()) },
          }));
        } catch (err) {
          if (cancelled || errorRaisedRef.current) continue;
          errorRaisedRef.current = true;
          cancelled = true;
          setError('Unable to load TOTP codes', getErrorMessage(err), () => {
            errorRaisedRef.current = false;
            setCliCache({});
            setRetryNonce((n) => n + 1);
            void handleSync();
          });
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(CLI_FETCH_CONCURRENCY, cliStale.length) }, worker),
    );
    return () => {
      cancelled = true;
    };
  }, [session, win, state.kind === 'vault' ? state.items.length : 0, totpSecrets, retryNonce]);

  if (gateRender) return gateRender;

  function renderVaultContent() {
    if (sortedSections.length === 0) {
      return (
        <List.EmptyView
          title={searchText ? 'No matching items' : 'No TOTP accounts'}
          description={
            searchText
              ? 'Try a different search or Sync to refresh'
              : 'No accounts with TOTP set up in your vault'
          }
        />
      );
    }

    return sortedSections.map(([folderId, { folderName, items: sectionItems }]) => (
      <List.Section key={folderId ?? 'unfiled'} title={folderName}>
        {sectionItems.map((item) => {
          const secret = item.login?.totp || totpSecrets[item.id] || '';
          const local = isSteamSecret(secret) ? null : computeLocalTotp(secret, now);
          const cached = cliCache[item.id];
          const fresh = local?.code ?? (cached?.window === win ? cached.code : undefined);
          const localCountdown = local
            ? Math.max(0, Math.ceil(local.remainingMs / 1000))
            : countdown;
          return (
            <List.Item
              key={item.id}
              icon={itemIcon(item, faviconMap)}
              title={item.name}
              subtitle={itemSubtitle(item)}
              accessories={
                fresh
                  ? [{ text: formatTotp(fresh) }, { icon: Icon.Clock, text: `${localCountdown}s` }]
                  : [{ text: 'Loading...' }]
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Copy TOTP"
                    icon={Icon.CopyClipboard}
                    onAction={() => handleCopyTotp(item.id, local?.code ?? fresh)}
                  />
                  <Action title="Sync Vault" icon={Icon.ArrowClockwise} onAction={handleSync} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    ));
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={state.kind === 'vault' ? setSearchText : undefined}
      searchBarPlaceholder="Search accounts with TOTP..."
      throttle
    >
      {state.kind === 'vault' ? renderVaultContent() : <List.EmptyView title="Loading..." />}
    </List>
  );
}
