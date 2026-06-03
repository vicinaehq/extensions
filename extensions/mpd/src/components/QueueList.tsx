import { useEffect, useState, useCallback, useRef } from 'react';
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
} from '@vicinae/api';
import { withClient } from '../mpd/client.js';
import {
  getQueue,
  playSong,
  removeSong,
  type QueueItem,
  type CurrentSong,
} from '../mpd/queue.js';
import {
  fetchAlbumArtBatchViaMpc,
  fetchStreamArtViaMpc,
} from '../mpd/albumart.js';
import {
  formatDuration,
  basename,
  sectionTitle,
  formatTrackNumber,
} from '../util/format.js';
import { isStreamUri, streamHost } from '../util/uri.js';
import {
  lookupStations,
  downloadStationFavicon,
  type StationInfo,
} from '../util/radio-browser.js';
import { createBufferedRecordSetter } from '../util/buffered-setter.js';
import { errorMessage } from '../util/errors.js';
import { mergeArt, type ArtEntry } from '../util/art-source.js';
import { findStreamArt } from '../mpd/stream-art-paths.js';
import { cacheDir } from '../mpd/albumart-paths.js';
import { downloadWebradioDbPicture } from '../util/webradiodb.js';

type PlayState = 'play' | 'pause' | 'stop';

// Poll cadence while a stream is the active queue item. Tuned to surface
// ICY title changes promptly without flooding MPD with status requests.
// Polling is paused whenever the active item is a local file (zero cost
// for library-only users).
const STREAM_POLL_INTERVAL_MS = 5000;

export default function QueueList() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [currentSongId, setCurrentSongId] = useState<number | null>(null);
  const [state, setState] = useState<PlayState>('stop');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artByUri, setArtByUri] = useState<Record<string, ArtEntry>>({});
  const [stationByUri, setStationByUri] = useState<
    Record<string, StationInfo | null>
  >({});

  // We remember the last URI we kicked a stream-art fetch for so the
  // polling loop doesn't re-issue readpicture every tick — only when the
  // current playing URI changes. The negative cache in fetchStreamArtViaMpc
  // short-circuits anyway, but this avoids even the function call.
  const streamArtRequested = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = await withClient((mpc) => getQueue(mpc));

      // Overlay live ICY metadata onto the currently playing row IFF it is
      // a stream. For local files we trust playlistinfo's tags — they're
      // canonical and overlaying could clobber properly-tagged data.
      let nextItems = q.items;
      if (q.currentSong && q.currentSongId !== null) {
        const idx = q.items.findIndex((it) => it.id === q.currentSongId);
        if (idx !== -1 && isStreamUri(q.items[idx]!.file)) {
          const overlay = mergeStreamMetadata(q.items[idx]!, q.currentSong);
          if (overlay !== q.items[idx]) {
            nextItems = q.items.slice();
            nextItems[idx] = overlay;
          }
        }
      }

      setItems(nextItems);
      setCurrentSongId(q.currentSongId);
      setState(q.state);
      setError(null);

      // Split art fetches into two paths:
      //   1. Local files: batched through the existing fetcher.
      //   2. Streams: only the currently-playing one, via `readpicture`
      //      with a hard timeout. MPD's `albumart` command is local-file-
      //      only, and `readpicture` against a stream URI scans the live
      //      decoder's tags for embedded pictures (FLAC streams often
      //      carry one). We never fetch art for non-playing stream rows.
      const fileUris = Array.from(
        new Set(nextItems.map((it) => it.file).filter((u) => !isStreamUri(u))),
      );
      void loadArtInBatches(fileUris, setArtByUri);

      const streamItems = Array.from(
        new Map(
          nextItems
            .filter((it) => isStreamUri(it.file))
            .map((it) => [it.file, { uri: it.file, name: it.name }]),
        ).values(),
      );

      // Probe disk once per stream URI and reuse the result for both the
      // instant-seed step and the webradiodb candidate list. refresh() runs
      // every ~5s during stream playback; each findStreamArt is ~12 existsSync
      // calls, so probing once (not twice) matters.
      const artCacheDir = cacheDir(process.env);
      const streamSeeds = streamItems.map((s) => ({
        uri: s.uri,
        hit: findStreamArt(artCacheDir, s.uri),
      }));

      // Seed already-cached icons instantly. The updater is pure: it only runs
      // mergeArt over the precomputed probe results (no fs I/O inside setState).
      const seeded = streamSeeds.filter(
        (s): s is { uri: string; hit: NonNullable<typeof s.hit> } =>
          s.hit !== null,
      );
      if (seeded.length > 0) {
        setArtByUri((prev) => {
          let nextState = prev;
          for (const { uri, hit } of seeded) {
            nextState = mergeArt(nextState, uri, hit.path, hit.source);
          }
          return nextState;
        });
      }

      void loadStationInfo(streamItems, setStationByUri, setArtByUri);

      // Refetch webradiodb only for URIs lacking a webradiodb/embedded slot
      // (absent, or only a weak favicon slot), reusing the probe results.
      const webradioCandidates = streamSeeds
        .filter((s) => !s.hit || s.hit.source === 'favicon')
        .map((s) => s.uri);
      void loadWebradioArt(webradioCandidates, setArtByUri);

      const playingStreamUri =
        q.currentSongId !== null && q.state !== 'stop'
          ? nextItems.find(
              (it) => it.id === q.currentSongId && isStreamUri(it.file),
            )?.file
          : undefined;
      if (
        playingStreamUri &&
        streamArtRequested.current !== playingStreamUri
      ) {
        streamArtRequested.current = playingStreamUri;
        void loadStreamArt(playingStreamUri, setArtByUri);
      } else if (!playingStreamUri) {
        streamArtRequested.current = null;
      }
    } catch (e) {
      console.error('MPD queue load failed:', e);
      setError(errorMessage(e));
      setItems([]);
      setCurrentSongId(null);
      setState('stop');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll the queue while a stream is active so ICY title updates surface.
  // The polling is gated on `state === 'play'` AND the playing item being a
  // stream — for local files (or while stopped/paused) we don't poll, which
  // keeps the cost at zero for the common case.
  useEffect(() => {
    if (state !== 'play') return;
    if (currentSongId === null) return;
    const playing = items.find((it) => it.id === currentSongId);
    if (!playing || !isStreamUri(playing.file)) return;

    const handle = setInterval(() => {
      void refresh();
    }, STREAM_POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [state, currentSongId, items, refresh]);

  const onPlay = useCallback(
    async (id: number) => {
      try {
        await withClient((mpc) => playSong(mpc, id));
      } catch (e) {
        console.error('MPD playSong failed:', e);
        await showToast({
          style: Toast.Style.Failure,
          title: 'Play failed',
          message: errorMessage(e),
        });
      }
      // Fire-and-forget the refresh so the action returns instantly and the
      // UI updates whenever MPD responds. `refresh()` itself sets
      // isLoading so the user sees a spinner during the round-trip.
      void refresh();
    },
    [refresh],
  );

  const onRemove = useCallback(
    async (id: number) => {
      try {
        await withClient((mpc) => removeSong(mpc, id));
      } catch (e) {
        console.error('MPD removeSong failed:', e);
        await showToast({
          style: Toast.Style.Failure,
          title: 'Remove failed',
          message: errorMessage(e),
        });
      }
      void refresh();
    },
    [refresh],
  );

  if (error) {
    return (
      <List>
        <List.EmptyView
          title="Cannot connect to MPD"
          description={`${error}\n\nCheck that MPD is running and MPD_HOST / MPD_PORT are set correctly.`}
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading}>
      {items.length === 0 && !isLoading ? (
        <List.EmptyView title="The play queue is empty." />
      ) : (
        <List.Section title={sectionTitle(state, items.length)}>
          {items.map((it) => {
            const stream = isStreamUri(it.file);
            const art = artByUri[it.file]?.path;
            const isCurrent = currentSongId === it.id;

            // `?? null` collapses two states into one: undefined means
            // "lookup not yet kicked or still in flight"; null means
            // "lookup completed, no match in radio-browser". Both render
            // via renderStreamLabels' MPD-then-host fallback chain, so
            // the renderer doesn't need to distinguish them.
            const { title: displayTitle, subtitle } = stream
              ? renderStreamLabels(it, stationByUri[it.file] ?? null)
              : renderFileLabels(it);

            const accessories: List.Item.Accessory[] = [];

            // Right side: Playing pill (current row only), Live pill for
            // streams, track-number pill, duration.
            if (isCurrent) {
              if (state === 'play') {
                accessories.push({
                  tag: { value: 'Playing', color: Color.Green },
                });
              } else if (state === 'pause') {
                accessories.push({
                  tag: { value: 'Paused', color: Color.Yellow },
                });
              } else {
                accessories.push({
                  tag: { value: 'Stopped', color: Color.SecondaryText },
                });
              }
            }

            if (stream) {
              // Stream rows: show a Live tag and suppress duration (always 0
              // for streams; rendering "0:00" is misleading).
              accessories.push({
                tag: { value: 'Live', color: Color.Red },
              });
            } else {
              accessories.push({ text: formatDuration(it.duration) });
            }

            // Track-number pill: neutral grey, only when the song has a
            // track tag. Streams skip this branch naturally.
            if (typeof it.track === 'number') {
              accessories.push({ tag: formatTrackNumber(it.track) });
            }

            // Icon: streams fall back to a network glyph when readpicture
            // returned nothing; local files use cached art if present.
            const icon = art ?? (stream ? Icon.Wifi : Icon.Music);

            return (
              <List.Item
                key={it.id}
                id={String(it.id)}
                icon={icon}
                title={displayTitle}
                subtitle={subtitle}
                accessories={accessories}
                actions={
                  <ActionPanel>
                    <Action
                      title="Play"
                      icon={Icon.Play}
                      onAction={() => void onPlay(it.id)}
                    />
                    <Action
                      title="Remove from Queue"
                      icon={Icon.Trash}
                      shortcut={{ modifiers: ['ctrl'], key: 'x' }}
                      onAction={() => void onRemove(it.id)}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}

// Merge live currentSong metadata into a queue item. We never clobber
// non-empty playlistinfo fields — they may have come from a .pls/.m3u and
// be more accurate than the live ICY blob. Returns the same reference if
// nothing changed, so callers can do reference comparison to decide
// whether to spread.
function mergeStreamMetadata(item: QueueItem, cs: CurrentSong): QueueItem {
  const wantsTitle = (!item.title || item.title.length === 0) && cs.title;
  const wantsName = (!item.name || item.name.length === 0) && cs.name;
  if (!wantsTitle && !wantsName) return item;
  return {
    ...item,
    title: wantsTitle ? cs.title : item.title,
    name: wantsName ? cs.name : item.name,
  };
}

// Resolve title/subtitle for a stream row.
//
// Priority: MPD's own tags always win where non-empty. radio-browser's
// `station` (when present) fills the gaps — when MPD has neither title
// nor name, the station name becomes the title. URL host is the final
// fallback. We never let title and subtitle be identical.
function renderStreamLabels(
  it: QueueItem,
  station: StationInfo | null,
): { title: string; subtitle: string } {
  const title = it.title?.trim() ?? '';
  const name = it.name?.trim() ?? '';
  const stationName = station?.name?.trim() ?? '';
  const host = streamHost(it.file);

  // Pick a non-duplicate subtitle from a candidate list.
  const subtitleFrom = (chosenTitle: string, candidates: string[]): string => {
    for (const c of candidates) {
      if (c && c !== chosenTitle) return c;
    }
    return '';
  };

  if (title) {
    // ICY/playlistinfo title is the strongest signal. Subtitle prefers
    // MPD's own name, then station name, then host.
    return {
      title,
      subtitle: subtitleFrom(title, [name, stationName, host]),
    };
  }
  if (name) {
    return {
      title: name,
      subtitle: subtitleFrom(name, [stationName, host]),
    };
  }
  if (stationName) {
    return {
      title: stationName,
      subtitle: subtitleFrom(stationName, [host]),
    };
  }
  // Last resort: host (or the raw URL when unparseable).
  return { title: host || it.file, subtitle: '' };
}

// Resolve title/subtitle for a local-file row. Unchanged behavior from
// pre-stream-support code; extracted only to keep the JSX readable.
function renderFileLabels(it: QueueItem): {
  title: string;
  subtitle: string;
} {
  const title =
    it.title && it.title.length > 0 ? it.title : basename(it.file);
  let subtitle = '';
  if (it.album && it.artist) {
    subtitle = `${it.album} \u00B7 ${it.artist}`;
  } else if (it.album) {
    subtitle = it.album;
  } else if (it.artist) {
    subtitle = it.artist;
  }
  return { title, subtitle };
}

// Stream queue-row art into state through a single shared MPD connection.
// Same approach as AlbumList: cached hits come back grouped as one setState,
// misses stream through the buffered setter.
async function loadArtInBatches(
  uris: string[],
  setArtByUri: React.Dispatch<React.SetStateAction<Record<string, ArtEntry>>>,
): Promise<void> {
  const buffer = createBufferedRecordSetter<ArtEntry>(setArtByUri);
  try {
    const result = await fetchAlbumArtBatchViaMpc(uris, (uri, path) => {
      if (path) buffer.push(uri, { path, source: 'local' });
    });
    if (result.cached.size > 0) {
      setArtByUri((prev) => {
        let changed = false;
        for (const [uri, path] of result.cached) {
          if (prev[uri]?.path !== path) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const next = { ...prev };
        for (const [uri, path] of result.cached) {
          next[uri] = { path, source: 'local' };
        }
        return next;
      });
    }
  } finally {
    buffer.flush();
  }
}

// Best-effort embedded-picture fetch for the currently playing stream.
// Errors and timeouts are swallowed silently — the row already has a
// sensible fallback icon. Cache hits inside fetchStreamArtViaMpc make
// subsequent calls free.
async function loadStreamArt(
  uri: string,
  setArtByUri: React.Dispatch<React.SetStateAction<Record<string, ArtEntry>>>,
): Promise<void> {
  try {
    const path = await fetchStreamArtViaMpc(uri);
    if (path) {
      setArtByUri((prev) => mergeArt(prev, uri, path, 'embedded'));
    }
  } catch (e) {
    console.error('MPD stream art fetch failed:', e);
  }
}

// Mirror of loadArtInBatches but for radio-browser station metadata.
// Cached hits go through one grouped setState; misses stream through a
// buffered setter. Favicon downloads are kicked per-resolved-entry and
// write into the existing artByUri state via a functional setter (so
// we never read stale state inside the async callback).
async function loadStationInfo(
  items: Array<{ uri: string; name?: string }>,
  setStationByUri: React.Dispatch<
    React.SetStateAction<Record<string, StationInfo | null>>
  >,
  setArtByUri: React.Dispatch<
    React.SetStateAction<Record<string, ArtEntry>>
  >,
): Promise<void> {
  if (items.length === 0) return;

  // Buffer streamed misses going into stationByUri so we don't render
  // once per network response.
  const buffer = createBufferedRecordSetter<StationInfo | null>(
    setStationByUri,
  );

  // Queue of (uri, faviconUrl) pairs to download. We drain it through a
  // small worker pool to bound the parallel HTTP fan-out: on first run
  // with a populated station cache but cold albumart cache, a queue with
  // N streams would otherwise fire N simultaneous favicon GETs to N
  // different CDNs. The miss path of lookupStations is already capped
  // by MAX_CONCURRENCY; matching that cap here keeps the worst case
  // symmetric. Warm-disk-cache calls short-circuit inside
  // downloadStationFavicon so the steady-state cost is zero either way.
  const faviconQueue: Array<{ uri: string; faviconUrl: string }> = [];
  const FAVICON_CONCURRENCY = 4;
  let faviconWorkersRunning = 0;

  const startFaviconWorkers = (): void => {
    while (faviconWorkersRunning < FAVICON_CONCURRENCY && faviconQueue.length > 0) {
      faviconWorkersRunning++;
      void (async () => {
        try {
          while (true) {
            const job = faviconQueue.shift();
            if (!job) return;
            const path = await downloadStationFavicon(job.uri, job.faviconUrl);
            if (path) {
              setArtByUri((prev) => mergeArt(prev, job.uri, path, 'favicon'));
            }
          }
        } finally {
          faviconWorkersRunning--;
        }
      })();
    }
  };

  const enqueueFavicon = (uri: string, info: StationInfo | null): void => {
    if (!info?.faviconUrl) return;
    faviconQueue.push({ uri, faviconUrl: info.faviconUrl });
    startFaviconWorkers();
  };

  try {
    const result = await lookupStations(items, (uri, info) => {
      // Buffer drops nulls (per its contract) but we DO want to record
      // negative results in stationByUri so the renderer knows we've
      // looked. Do that via a direct setState here.
      if (info === null) {
        setStationByUri((prev) =>
          prev[uri] === null ? prev : { ...prev, [uri]: null },
        );
      } else {
        buffer.push(uri, info);
      }
      enqueueFavicon(uri, info);
    });
    if (result.cached.size > 0) {
      setStationByUri((prev) => {
        let changed = false;
        for (const [uri, info] of result.cached) {
          if (prev[uri] !== info) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const next = { ...prev };
        for (const [uri, info] of result.cached) {
          next[uri] = info;
        }
        return next;
      });
      for (const [uri, info] of result.cached) {
        enqueueFavicon(uri, info);
      }
    }
  } catch (e) {
    console.error('radio-browser: lookup failed:', e);
  } finally {
    buffer.flush();
  }
}

// Fetch curated WebradioDB images for the given stream URIs (already filtered
// by the caller to those lacking a webradiodb/embedded slot). Bounded worker
// pool; mergeArt enforces priority so a weaker favicon already shown is
// replaced by the better image.
async function loadWebradioArt(
  uris: string[],
  setArtByUri: React.Dispatch<React.SetStateAction<Record<string, ArtEntry>>>,
): Promise<void> {
  if (uris.length === 0) return;
  let next = 0;
  const CONCURRENCY = 4;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= uris.length) return;
      const uri = uris[i]!;
      try {
        const path = await downloadWebradioDbPicture(uri);
        if (path) {
          setArtByUri((prev) => mergeArt(prev, uri, path, 'webradiodb'));
        }
      } catch (e) {
        console.error('webradiodb fetch failed:', e);
      }
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, uris.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}
