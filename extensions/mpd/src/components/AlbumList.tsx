import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  closeMainWindow,
} from '@vicinae/api';
import { withClient } from '../mpd/client.js';
import {
  loadAlbumsTwoStep,
  playAlbum,
  addAlbumToQueue,
  getDbUpdate,
} from '../mpd/albums.js';
import { matchesAlbumQuery, type Album } from '../util/albums.js';
import { fetchAlbumArtBatchViaMpc } from '../mpd/albumart.js';
import {
  albumsCachePath,
  readAlbumsCache,
  writeAlbumsCache,
} from '../mpd/albums-cache.js';
import { formatDuration } from '../util/format.js';
import { createBufferedRecordSetter } from '../util/buffered-setter.js';
import { errorMessage } from '../util/errors.js';

// Read the persisted album list once at module load. This runs in the
// extension's startup phase before React mounts; the synchronous fs read is
// in the low-millisecond range for a few-thousand-album library and means
// the first paint already has rows in it — perceived load time is effectively
// zero on repeat opens.
const initialSnapshot = (() => {
  try {
    return readAlbumsCache(albumsCachePath(process.env));
  } catch {
    return null;
  }
})();

export interface AlbumListProps {
  // Optional dropdown to render as the search-bar accessory (passed in by the
  // BrowseList parent). When absent, no accessory is rendered.
  //
  // Note: the search input is intentionally uncontrolled — the host owns the
  // displayed value so keystrokes render instantly without a React/IPC
  // round-trip. We only listen via onSearchTextChange to drive filtering.
  // That means cross-mode text preservation (when switching the dropdown
  // between Albums and Songs) is intentionally NOT supported.
  searchBarAccessory?: React.ReactNode;
}

export default function AlbumList(props: AlbumListProps = {}) {
  const [albums, setAlbums] = useState<Album[]>(
    initialSnapshot?.albums ?? [],
  );
  // If we have a persisted snapshot we render immediately; the spinner only
  // shows on a true cold start (no cache file).
  const [isLoading, setIsLoading] = useState(!initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [artByUri, setArtByUri] = useState<Record<string, string>>({});
  // Internal-only — drives the filteredAlbums memo. The <List> itself does
  // NOT receive this as `searchText`, so the host renders keystrokes locally
  // without waiting for us to echo the value back through the IPC bridge.
  const [searchText, setSearchText] = useState('');

  const filteredAlbums = useMemo(
    () => albums.filter((a) => matchesAlbumQuery(a, searchText)),
    [albums, searchText],
  );

  const refresh = useCallback(async () => {
    // Don't flash a spinner if we already have rows from the persisted cache;
    // the existing list stays visible while we revalidate.
    if (!initialSnapshot) setIsLoading(true);
    try {
      const result = await withClient(async (mpc) => {
        // Validate the persisted snapshot against MPD's dbUpdate timestamp.
        // If they match the library hasn't changed since we wrote it, so we
        // can skip both the `list` and `find` queries entirely.
        const remoteDbUpdate = await getDbUpdate(mpc);
        if (
          initialSnapshot &&
          initialSnapshot.dbUpdate !== undefined &&
          remoteDbUpdate !== undefined &&
          initialSnapshot.dbUpdate === remoteDbUpdate
        ) {
          return { albums: initialSnapshot.albums, dbUpdate: remoteDbUpdate, refreshed: false };
        }
        const enriched = await loadAlbumsTwoStep(mpc, (fast) => {
          // Only push the fast partial result if we don't already have a
          // better (cached) list on screen — otherwise the user would see
          // their durations/sort briefly disappear.
          if (!initialSnapshot) {
            setAlbums(fast);
            setError(null);
            setIsLoading(false);
          }
        });
        return { albums: enriched, dbUpdate: remoteDbUpdate, refreshed: true };
      });
      setAlbums(result.albums);
      setError(null);
      setIsLoading(false);
      if (result.refreshed) {
        // Persist for next time. Failure here is non-fatal — we just won't
        // get an instant render next launch.
        try {
          writeAlbumsCache(albumsCachePath(process.env), {
            dbUpdate: result.dbUpdate,
            albums: result.albums,
          });
        } catch {
          /* ignore */
        }
      }
      const uniqueUris = Array.from(
        new Set(result.albums.map((a) => a.sampleUri).filter((u) => u.length > 0)),
      );
      void loadArt(uniqueUris, setArtByUri);
    } catch (e) {
      console.error('MPD album load failed:', e);
      setError(errorMessage(e));
      // Keep stale cached rows if we have them; only blank the list on a
      // cold-start error so the user sees the error message.
      if (!initialSnapshot) setAlbums([]);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPlay = useCallback(async (album: Album) => {
    try {
      await withClient((mpc) => playAlbum(mpc, album.name));
      await showToast({
        style: Toast.Style.Success,
        title: `Playing ${album.name}`,
      });
      await closeMainWindow();
    } catch (e) {
      console.error('MPD playAlbum failed:', e);
      await showToast({
        style: Toast.Style.Failure,
        title: 'Play failed',
        message: errorMessage(e),
      });
    }
  }, []);

  const onAdd = useCallback(async (album: Album) => {
    try {
      await withClient((mpc) => addAlbumToQueue(mpc, album.name));
      await showToast({
        style: Toast.Style.Success,
        title: `Added ${album.name} to queue`,
      });
    } catch (e) {
      console.error('MPD addAlbumToQueue failed:', e);
      await showToast({
        style: Toast.Style.Failure,
        title: 'Add to queue failed',
        message: errorMessage(e),
      });
    }
  }, []);

  if (error) {
    return (
      <List
        filtering={false}
        onSearchTextChange={setSearchText}
        searchBarAccessory={props.searchBarAccessory as never}
      >
        <List.EmptyView
          title="Cannot connect to MPD"
          description={`${error}\n\nCheck that MPD is running and MPD_HOST / MPD_PORT are set correctly.`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchBarPlaceholder="Search albums..."
      onSearchTextChange={setSearchText}
      searchBarAccessory={props.searchBarAccessory as never}
    >
      {filteredAlbums.length === 0 && !isLoading ? (
        <List.EmptyView title="No albums found." />
      ) : (
        filteredAlbums.map((album) => (
          <AlbumRow
            key={album.name}
            album={album}
            art={artByUri[album.sampleUri]}
            onPlay={onPlay}
            onAdd={onAdd}
          />
        ))
      )}
    </List>
  );
}

// Memoized row. Each row only re-renders when one of its own props changes
// (album object identity, art string, or the stable onPlay/onAdd callbacks),
// instead of every time the parent re-renders for any unrelated reason
// (search text change, art update for a different album, etc.).
//
// Why this matters: the album list typically has ~1,000 items. Without memo
// every parent render rebuilds 1,000 <List.Item> elements with fresh
// accessories arrays and ActionPanel children — even when nothing about
// those rows changed. The vicinae host then sees "children changed" and
// (empirically) loses scroll position. With memo, unchanged rows reuse
// their prior React element references, so the rendered tree is stable
// across art-load setStates.
interface AlbumRowProps {
  album: Album;
  art: string | undefined;
  onPlay: (album: Album) => void;
  onAdd: (album: Album) => void;
}

const AlbumRow = memo(function AlbumRow({
  album,
  art,
  onPlay,
  onAdd,
}: AlbumRowProps) {
  const accessories: List.Item.Accessory[] = [];
  accessories.push({ text: formatDuration(album.totalDuration) });
  if (album.year) {
    // Plain string Tag (AccessoryBase form) -> neutral grey pill.
    // The {value, color} object form requires an explicit color.
    accessories.push({ tag: album.year });
  }
  return (
    <List.Item
      id={album.name}
      icon={art ?? Icon.Music}
      title={album.name}
      subtitle={album.artist}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action
            title="Play Album"
            icon={Icon.Play}
            onAction={() => onPlay(album)}
          />
          <Action
            title="Add to Queue"
            icon={Icon.Plus}
            shortcut={{ modifiers: ['ctrl'], key: 'enter' }}
            onAction={() => onAdd(album)}
          />
        </ActionPanel>
      }
    />
  );
});

// Stream album art into state through a single shared MPD connection.
//
// Cache hits come back grouped in `cached` and are written in a single
// setState — turning what was previously ~1,000 individual buffered
// setStates (for warm-cache albums) into exactly ONE. This is the
// dominant fix for the scroll-resetting symptom: on a warm cache the
// post-mount re-render count drops from ~7-per-second (buffered flushes)
// to zero.
//
// Misses still stream through the buffered setter so the UI fills in
// progressively as new art is fetched from MPD.
async function loadArt(
  uris: string[],
  setArtByUri: React.Dispatch<React.SetStateAction<Record<string, string>>>,
): Promise<void> {
  const buffer = createBufferedRecordSetter<string>(setArtByUri);
  try {
    const result = await fetchAlbumArtBatchViaMpc(uris, (uri, path) => {
      // Streamed misses (MPD fetch completions) go through the buffer so
      // multiple completions in the same 150 ms window coalesce.
      buffer.push(uri, path);
    });
    if (result.cached.size > 0) {
      // Cached hits land all at once. We commit them as one setState BEFORE
      // any misses arrive (the await above already returned cached hits
      // synchronously in the no-miss case, and in the mixed case cached are
      // populated up-front by fetchAlbumArtBatch).
      setArtByUri((prev) => {
        // Avoid creating a new reference if nothing actually changes.
        let changed = false;
        for (const [uri, path] of result.cached) {
          if (prev[uri] !== path) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const next = { ...prev };
        for (const [uri, path] of result.cached) {
          next[uri] = path;
        }
        return next;
      });
    }
  } finally {
    buffer.flush();
  }
}
