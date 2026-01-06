import { useState, useCallback, useMemo, createElement } from 'react';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  showToast,
  Toast,
  useNavigation,
} from '@vicinae/api';
import { searchTorrents, sortTorrents, filterTorrents, formatTrackers } from '../utils/jackett';
import { JackettTorrent } from '../types/torrent';
import type { PreferenceValues } from '../types/preferences';
import TorrentDetail from '../torrent-detail';

const execAsync = promisify(exec);

export function useJackettSearch(preferences: PreferenceValues) {
  const { push } = useNavigation();
  const [query, setQuery] = useState('');
  const [torrents, setTorrents] = useState<JackettTorrent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSortBy, setCurrentSortBy] = useState<'seeders' | 'peers' | 'size' | 'date'>('seeders');

  const { 'jackett-url': jackettUrl, 'api-key': apiKey, 'min-seeders': minSeedersStr, 'default-action': defaultAction, trackers } = preferences;

  const minSeeders = parseInt(minSeedersStr, 10) || 0;

  const dropdownOptions = useMemo(() => {
    const options = [
      { title: 'By seeders', value: 'seeders' },
      { title: 'By peers', value: 'peers' },
      { title: 'By size', value: 'size' },
      { title: 'By date', value: 'date' },
    ];
    return options;
  }, []);

  const handleDropdownChange = useCallback((value: string) => {
    setCurrentSortBy(value as 'seeders' | 'peers' | 'size' | 'date');
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!jackettUrl || !apiKey) {
      setError('Please configure Jackett URL and API Key in preferences');
      showToast({
        title: 'Configuration Required',
        message: 'Please configure Jackett URL and API Key',
        style: Toast.Style.Failure,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await searchTorrents({
        query: searchQuery,
        url: jackettUrl,
        apiKey,
        categories: preferences.categories,
        trackers: formatTrackers(trackers),
      });

      const filtered = filterTorrents(results, minSeeders);
      const sorted = sortTorrents(filtered, currentSortBy);

      setTorrents(sorted);

      if (sorted.length === 0) {
        showToast({
          title: 'No results found',
          style: Toast.Style.Failure,
        });
      } else {
        showToast({
          title: `Found ${sorted.length} torrents`,
          style: Toast.Style.Success,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search torrents';
      setError(errorMessage);
      showToast({
        title: 'Search failed',
        message: errorMessage,
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [jackettUrl, apiKey, preferences.categories, currentSortBy, minSeeders]);

  const openMagnetLink = useCallback(async (magnetUri: string) => {
    try {
      await execAsync(`xdg-open "${magnetUri}"`);
      showToast({
        title: 'Opening torrent...',
        style: Toast.Style.Success,
      });
    } catch (err) {
      showToast({
        title: 'Failed to open magnet link',
        style: Toast.Style.Failure,
      });
    }
  }, []);


  const showTorrentDetail = useCallback((torrent: JackettTorrent) => {
    push(createElement(TorrentDetail, { torrent: torrent }));
  }, [push]);

  const handleDefaultAction = useCallback((torrent: JackettTorrent) => {
    switch (defaultAction) {
      case 'magnet':
        if (torrent.MagnetUri) {
          openMagnetLink(torrent.MagnetUri);
        } else {
          showToast({
            title: 'No magnet link available',
            style: Toast.Style.Failure,
          });
        }
        break;
      case 'torrent':
        if (torrent.Link) {
          showToast({
            title: 'Opening torrent file...',
            style: Toast.Style.Success,
          });
          execAsync(`xdg-open "${torrent.Link}"`);
        } else {
          showToast({
            title: 'No torrent file available',
            style: Toast.Style.Failure,
          });
        }
        break;
      default:
        showTorrentDetail(torrent);
        break;
    }
  }, [defaultAction, openMagnetLink, showTorrentDetail]);

  return {
    query,
    setQuery,
    torrents,
    isLoading,
    error,
    currentSortBy,
    dropdownOptions,
    performSearch,
    openMagnetLink,
    showTorrentDetail,
    handleDefaultAction,
    handleDropdownChange,
  };
}
