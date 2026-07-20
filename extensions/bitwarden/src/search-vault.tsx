import { Action, ActionPanel, Icon, List, useNavigation } from '@vicinae/api';
import * as bw from './bw-executor';
import { itemActions as getItemActions } from './item-actions';
import { itemIcon } from './item-icons';
import { itemSubtitle, itemTypeLabel } from './item-list';
import { useVaultSearch } from './use-vault-search';
import ItemDetailView, { renderItemActionElements } from './item-detail-view';
import EditItem from './edit-item';
import type { BwFolder, BwItem } from './bitwarden-types';

export default function SearchVault() {
  const {
    state,
    session,
    searchText,
    setSearchText,
    faviconMap,
    vaultFolders,
    handleSync,
    handleCopyTotp,
    gateRender,
    isLoading,
    sortedSections,
  } = useVaultSearch();

  const { push } = useNavigation();

  if (gateRender) return gateRender;

  function renderVaultContent() {
    if (sortedSections.length === 0) {
      return (
        <List.EmptyView
          title={searchText ? 'No matching items' : 'No items in vault'}
          description={
            searchText
              ? 'Try a different search or Sync to refresh your vault'
              : 'Sync to pull your vault data, or create an item'
          }
        />
      );
    }

    return sortedSections.map(([folderId, { folderName, items: sectionItems }]) => (
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
                {renderItemActions(item, session, handleCopyTotp, push, vaultFolders, handleSync)}
                <Action title="Sync Vault" icon={Icon.ArrowClockwise} onAction={handleSync} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    ));
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={state.kind === 'vault' ? setSearchText : undefined}
      searchBarPlaceholder="Search vault by name..."
      throttle
    >
      {state.kind === 'vault' ? renderVaultContent() : <List.EmptyView title="Loading..." />}
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
      {renderItemActionElements(actions, onCopyTotp, item.id, session)}
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
