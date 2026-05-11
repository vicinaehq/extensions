// fallow-ignore-file unused-file
import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useEffect, useState } from 'react';
import * as bw from './bw-executor';
import { formatTotp, itemIcon, itemSubtitle } from './item-utils';
import { useVaultSearch } from './use-vault-search';
import type { BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';

function totpItems(items: BwItem[]): BwItem[] {
  return items.filter(
    (item) =>
      item.type === ItemType.Login && item.login?.totp !== null && item.login?.totp !== undefined,
  );
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
    gateRender,
    isLoading,
    sortedSections,
  } = useVaultSearch(totpItems);

  const [totpMap, setTotpMap] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(30 - (Math.floor(Date.now() / 1000) % 30));

  // TOTP countdown tick
  useEffect(() => {
    const tick = () => setCountdown(30 - (Math.floor(Date.now() / 1000) % 30));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch TOTP codes when session is available and vault is loaded
  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'vault') return;
    const ids = totpItems(state.items).map((i) => i.id);

    const fetchCodes = async () => {
      const results = await Promise.allSettled(ids.map((id) => bw.getTotp(id, session)));
      const map: Record<string, string> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') map[ids[i]] = r.value;
      });
      setTotpMap(map);
    };

    fetchCodes();
    const interval = setInterval(fetchCodes, 30_000);
    return () => clearInterval(interval);
  }, [session, state.kind === 'vault' ? state.items.length : 0]);

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
          const code = totpMap[item.id];
          return (
            <List.Item
              key={item.id}
              icon={itemIcon(item, faviconMap)}
              title={item.name}
              subtitle={itemSubtitle(item)}
              accessories={
                code
                  ? [{ text: formatTotp(code) }, { icon: Icon.Clock, text: `${countdown}s` }]
                  : [{ text: 'Loading...' }]
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Copy TOTP"
                    icon={Icon.CopyClipboard}
                    onAction={() => handleCopyTotp(item.id)}
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
