import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
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
  searchSongsViaMpc,
  addSongToQueueViaMpc,
  playSongNow,
  SONG_SEARCH_LIMIT,
  type Song,
} from '../mpd/songs.js';
import { fetchAlbumArtBatchViaMpc } from '../mpd/albumart.js';
import { formatDuration, basename } from '../util/format.js';
import { createBufferedRecordSetter } from '../util/buffered-setter.js';
import { errorMessage } from '../util/errors.js';

// Minimum query length before we hit MPD. One character can match a huge slice
// of any moderately-sized library and isn't useful; two is a sensible floor.
const MIN_QUERY_LENGTH = 2;

// Wait this long after the last keystroke before actually firing the MPD
// search. Each search is non-trivial (one connect + three parallel queries
// per token), so without this debounce typing feels sluggish — the host's
// own `throttle` only batches search-bar events, it doesn't cancel work.
//
// 250 ms is short enough to feel responsive when you stop typing, but long
// enough to let a normal-speed typist finish a word before any query fires.
const SEARCH_DEBOUNCE_MS = 250;

export interface SongSearchListProps {
  // Optional dropdown to render as the search-bar accessory (passed in by the
  // BrowseList parent). When absent, no accessory is rendered.
  //
  // Note: the search input is intentionally uncontrolled — the host owns the
  // displayed value so keystrokes render instantly without a React/IPC
  // round-trip. We only listen via onSearchTextChange to drive the debounced
  // MPD search. Cross-mode text preservation (when switching the dropdown
  // between Albums and Songs) is intentionally NOT supported.
  searchBarAccessory?: React.ReactNode;
}

export default function SongSearchList(props: SongSearchListProps = {}) {
  // Internal-only — drives the debounced search effect. The <List> does NOT
  // receive this as `searchText`, so the host renders keystrokes locally
  // without waiting for us to echo the value back through IPC.
  const [searchText, setSearchText] = useState('');

  const [songs, setSongs] = useState<Song[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artByUri, setArtByUri] = useState<Record<string, string>>({});

  // Concurrency guard: every request gets a monotonically increasing id; we
  // only commit a response if it's still the latest one in flight. Prevents
  // an older slow query from clobbering a newer fast one.
  const requestSeq = useRef(0);

  const trimmed = searchText.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const empty = trimmed.length === 0;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Clear any stale results so a backspace-to-empty doesn't keep the
      // previous match list visible. Synchronous (not debounced) so the
      // user gets immediate feedback when they wipe the input.
      setSongs([]);
      setTruncated(false);
      setIsLoading(false);
      setError(null);
      return;
    }
    // Bump the request id immediately so any in-flight callback from a
    // previous keystroke that somehow races to completion sees it's stale
    // and drops its result. The actual MPD work is deferred below.
    const seq = ++requestSeq.current;
    // Show the spinner the instant the user types, even though we won't
    // actually hit MPD for SEARCH_DEBOUNCE_MS — otherwise the UI feels
    // even more sluggish than before because the loading state itself
    // would be delayed.
    setIsLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await withClient((mpc) =>
            searchSongsViaMpc(mpc, trimmed),
          );
          if (seq !== requestSeq.current) return; // newer search supersedes us
          setSongs(result.songs);
          setTruncated(result.truncated);
          setError(null);
          setIsLoading(false);
          const uniqueUris = Array.from(
            new Set(result.songs.map((s) => s.file).filter((u) => u.length > 0)),
          );
          void loadArt(uniqueUris, setArtByUri, seq, requestSeq);
        } catch (e) {
          if (seq !== requestSeq.current) return;
          // Log full error for dev-console diagnostics; surface just the message.
          console.error('MPD song search failed:', e);
          setError(errorMessage(e));
          setSongs([]);
          setTruncated(false);
          setIsLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed]);

  const onAdd = useCallback(async (song: Song) => {
    try {
      const result = await withClient((mpc) =>
        addSongToQueueViaMpc(mpc, song.file),
      );
      const label = song.title && song.title.length > 0
        ? song.title
        : basename(song.file);
      await showToast({
        style: Toast.Style.Success,
        title: result.started ? `Playing ${label}` : `Added ${label}`,
      });
      // Intentionally do NOT close the window. The user can keep searching
      // and queueing.
    } catch (e) {
      console.error('MPD addSongToQueue failed:', e);
      await showToast({
        style: Toast.Style.Failure,
        title: 'Add to queue failed',
        message: errorMessage(e),
      });
    }
  }, []);

  const onPlayNow = useCallback(async (song: Song) => {
    try {
      await withClient((mpc) => playSongNow(mpc, song.file));
      const label = song.title && song.title.length > 0
        ? song.title
        : basename(song.file);
      await showToast({
        style: Toast.Style.Success,
        title: `Playing ${label}`,
      });
      await closeMainWindow();
    } catch (e) {
      console.error('MPD playSongNow failed:', e);
      await showToast({
        style: Toast.Style.Failure,
        title: 'Play failed',
        message: errorMessage(e),
      });
    }
  }, []);

  const sectionTitle = useMemo(() => {
    if (truncated) return `Songs — showing first ${SONG_SEARCH_LIMIT}`;
    if (songs.length === 1) return 'Songs — 1 song';
    return `Songs — ${songs.length} songs`;
  }, [songs.length, truncated]);

  if (error) {
    return (
      <List
        filtering={false}
        searchBarPlaceholder="Search songs..."
        onSearchTextChange={setSearchText}
        searchBarAccessory={props.searchBarAccessory as never}
      >
        <List.EmptyView
          title="Search failed"
          description={`${error}\n\nThis is usually a transient MPD or connectivity issue. Try a different query, or check that MPD is running and reachable.`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchBarPlaceholder="Search songs..."
      onSearchTextChange={setSearchText}
      searchBarAccessory={props.searchBarAccessory as never}
    >
      {empty ? (
        <List.EmptyView
          title="Search the MPD library"
          description="Type at least 2 characters to search by song title, artist, or album."
          icon={Icon.MagnifyingGlass}
        />
      ) : tooShort ? (
        <List.EmptyView
          title="Keep typing..."
          description={`Type at least ${MIN_QUERY_LENGTH} characters.`}
          icon={Icon.MagnifyingGlass}
        />
      ) : songs.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No songs match"
          description={`Nothing in the library matches "${trimmed}".`}
        />
      ) : (
        <List.Section title={sectionTitle}>
          {songs.map((song) => (
            <SongRow
              key={song.file}
              song={song}
              art={artByUri[song.file]}
              onAdd={onAdd}
              onPlayNow={onPlayNow}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

interface SongRowProps {
  song: Song;
  art: string | undefined;
  onAdd: (song: Song) => void;
  onPlayNow: (song: Song) => void;
}

const SongRow = memo(function SongRow({ song, art, onAdd, onPlayNow }: SongRowProps) {
  const title = song.title && song.title.length > 0 ? song.title : basename(song.file);

  // Subtitle: Artist · Album — same middle-dot rule as the queue view.
  let subtitle = '';
  if (song.artist && song.album) {
    subtitle = `${song.artist} \u00B7 ${song.album}`;
  } else if (song.artist) {
    subtitle = song.artist;
  } else if (song.album) {
    subtitle = song.album;
  }

  const accessories: List.Item.Accessory[] = [];
  accessories.push({ text: formatDuration(song.duration) });
  if (song.year) {
    accessories.push({ tag: song.year });
  }

  return (
    <List.Item
      id={song.file}
      icon={art ?? Icon.Music}
      title={title}
      subtitle={subtitle}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action
            title="Add to Queue"
            icon={Icon.Plus}
            onAction={() => onAdd(song)}
          />
          <Action
            title="Play Now"
            icon={Icon.Play}
            shortcut={{ modifiers: ['ctrl'], key: 'enter' }}
            onAction={() => onPlayNow(song)}
          />
        </ActionPanel>
      }
    />
  );
});

// Same buffered-art-loading pattern used by AlbumList / QueueList: cached
// hits land in one big setState, misses stream through the buffer. The seq
// guard ensures we don't keep filling art for a search the user has moved
// past.
async function loadArt(
  uris: string[],
  setArtByUri: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  seq: number,
  requestSeqRef: { current: number },
): Promise<void> {
  if (uris.length === 0) return;
  const buffer = createBufferedRecordSetter<string>(setArtByUri);
  try {
    const result = await fetchAlbumArtBatchViaMpc(uris, (uri, path) => {
      if (seq !== requestSeqRef.current) return;
      buffer.push(uri, path);
    });
    if (seq !== requestSeqRef.current) return;
    if (result.cached.size > 0) {
      setArtByUri((prev) => {
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
