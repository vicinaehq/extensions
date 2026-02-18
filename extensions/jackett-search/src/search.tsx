import React, { useEffect } from 'react';
import {
  List,
  ActionPanel,
  Action,
  Icon,
  getPreferenceValues,
} from '@vicinae/api';
import type { PreferenceValues } from './types/preferences';
import { useDebounce } from './hooks/useDebounce';
import { useJackettSearch } from './hooks/useJackettSearch';
import { formatBytes } from './utils/jackett';

export default function JackettSearch() {
  const preferences = getPreferenceValues<PreferenceValues>();
  const {
    query,
    setQuery,
    torrents,
    isLoading,
    error,
    currentSortBy,
    dropdownOptions,
    performSearch,
    handleDropdownChange,
    showTorrentDetail,
    handleDefaultAction,
  } = useJackettSearch(preferences);

  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (debouncedQuery.length >= 3) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery, performSearch]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search torrents (min 3 characters)..."
      onSearchTextChange={setQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter"
          value={currentSortBy}
          onChange={handleDropdownChange}
        >
          <List.Dropdown.Section title='Sort by'>
            {dropdownOptions.map((option) => (
              <List.Dropdown.Item key={option.value} title={option.title} value={option.value} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {(() => {
        if (debouncedQuery.length < 3) {
          return (
            <List.EmptyView
              title="Jackett Search"
              description="Enter at least 3 characters to search for torrents"
              icon={Icon.MagnifyingGlass}
            />
          );
        }

        if (error) {
          return (
            <List.EmptyView
              title="Error"
              description={error}
              icon={Icon.Warning}
            />
          );
        }

        if (torrents.length === 0 && !isLoading) {
          return (
            <List.EmptyView
              title="No results found"
              description="Try adjusting your search query or filters"
              icon={Icon.MagnifyingGlass}
            />
          );
        }

        return (
          <List.Section title={`${torrents.length} torrents found`}>
            {torrents.map((torrent, index) => (
              <List.Item
                key={`${torrent.Guid}-${index}`}
                id={`torrent-${index}`}
                title={torrent.Title}
                subtitle={torrent.CategoryDesc || ''}
                icon={Icon.Download}
                accessories={[
                  {
                    text: `${torrent.Seeders} seeds`,
                    icon: Icon.ArrowUp,
                  },
                  {
                    text: `${torrent.Peers} peers`,
                    icon: Icon.ArrowDown,
                  },
                  {
                    text: formatBytes(torrent.Size),
                    icon: Icon.HardDrive,
                  },
                  {
                    text: torrent.Tracker || torrent.TrackerId,
                    icon: Icon.Globe,
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Show Details"
                      icon={Icon.Eye}
                      onAction={() => showTorrentDetail(torrent)}
                      shortcut={{ modifiers: ['cmd'], key: 'd' }}
                    />
                    {torrent.MagnetUri && (
                      <>
                        <Action
                          title="Open Magnet"
                          icon={Icon.ArrowUpCircle}
                          onAction={() => handleDefaultAction(torrent)}
                        />
                        <Action.CopyToClipboard
                          title="Copy Magnet"
                          icon={Icon.Clipboard}
                          content={torrent.MagnetUri}
                          shortcut={{ modifiers: ['cmd'], key: 'c' }}
                        />
                      </>
                    )}
                    {torrent.Link && (
                      <Action.OpenInBrowser
                        title="Download Torrent File"
                        icon={Icon.Download}
                        url={torrent.Link}
                      />
                    )}
                    {torrent.Details && (
                      <Action.OpenInBrowser
                        title="Open Details"
                        icon={Icon.Globe}
                        url={torrent.Details}
                      />
                    )}
                    <ActionPanel.Section>
                      <Action
                        title="Refresh Results"
                        icon={Icon.ArrowClockwise}
                        shortcut={{ modifiers: ['cmd'], key: 'r' }}
                        onAction={() => debouncedQuery.length >= 3 && performSearch(debouncedQuery)}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })()}
    </List>
  );
}
