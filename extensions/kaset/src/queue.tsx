import {
	Action,
	ActionPanel,
	Color,
	Icon,
	Image,
	Keyboard,
	List,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeError, toastError } from "./lib/feedback";
import { artworkUrl, formatTime } from "./lib/format";
import {
	getPlayQueue,
	launch,
	type PlayQueue,
	type QueueTrack,
	playTrackAtIndex,
} from "./lib/kaset";
import { PlaybackActions } from "./lib/playback-actions";
import { usePlayer } from "./lib/use-player";

const ARTWORK_SIZE = 96;

/**
 * `get play queue` is a snapshot: its `currentIndex` is right when it is read and
 * wrong as soon as the track changes. The player is polled, so it is what decides
 * which track is playing; the snapshot only translates that video into a queue
 * position. Returns 0 when it cannot — the caller refetches the queue.
 */
function resolveCurrentIndex(
	queue: PlayQueue | null,
	playingVideoId: string | null,
): number {
	if (!queue) return 0;
	if (!playingVideoId) return queue.currentIndex;

	// Still the same track: keep the snapshot's index, which stays correct even
	// when the same video appears in the queue more than once.
	const atIndex = queue.tracks.find((t) => t.index === queue.currentIndex);
	if (atIndex?.videoId === playingVideoId) return queue.currentIndex;

	const matches = queue.tracks.filter((t) => t.videoId === playingVideoId);
	return matches.length === 1 ? matches[0].index : 0;
}

function useQueue() {
	const [queue, setQueue] = useState<PlayQueue | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [isLoading, setIsLoading] = useState(true);
	const mounted = useRef(true);
	/** Whether a queue has ever loaded, so the view has something on screen. */
	const loaded = useRef(false);
	/** Whether the current run of failures has already been announced. */
	const reported = useRef(false);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const refresh = useCallback(async () => {
		try {
			const next = await getPlayQueue();
			if (!mounted.current) return;
			setQueue(next);
			setError(null);
			loaded.current = true;
			reported.current = false;
		} catch (caught) {
			if (!mounted.current) return;
			setError(caught);
			// The error view only renders when there is nothing to show, so a failure
			// over a queue that is already on screen would otherwise go unnoticed. One
			// toast per run of failures, so a retry does not say it twice.
			if (loaded.current && !reported.current) {
				reported.current = true;
				await toastError(caught);
			}
		} finally {
			if (mounted.current) setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { queue, error, isLoading, refresh };
}

export default function Queue() {
	// The queue itself rarely changes, so it is only refetched on demand; the
	// player is polled so the "now playing" marker and the controls stay honest.
	const player = usePlayer({ pollMs: 3_000, tickMs: 0 });
	const { queue, error, isLoading, refresh } = useQueue();

	const failure = error ?? player.error;
	const tracks = queue?.tracks ?? [];

	const playingVideoId = player.info?.track?.videoId ?? null;
	const currentIndex = resolveCurrentIndex(queue, playingVideoId);

	// Refetch on every track change: a new track can mean the queue itself changed
	// (radio autoplay, a new playlist), not just its position. Seeded from the
	// first player reading that lands, so the queue loaded on mount is not
	// immediately fetched a second time.
	const hasPlayerInfo = player.info !== null;
	const lastVideoId = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		if (!hasPlayerInfo) return;
		if (lastVideoId.current === undefined) {
			lastVideoId.current = playingVideoId;
			return;
		}
		if (lastVideoId.current === playingVideoId) return;
		lastVideoId.current = playingVideoId;
		void refresh();
	}, [hasPlayerInfo, playingVideoId, refresh]);

	const playerRefresh = player.refresh;
	const reload = useCallback(() => {
		void refresh();
		playerRefresh();
	}, [refresh, playerRefresh]);

	const play = useCallback(
		async (index: number) => {
			try {
				await playTrackAtIndex(index);
				// `play track at index` is applied asynchronously by Kaset, so give it a
				// moment before asking what the queue looks like now.
				await new Promise((resolve) => setTimeout(resolve, 400));
				reload();
			} catch (caught) {
				await toastError(caught);
			}
		},
		[reload],
	);

	if (failure && tracks.length === 0) {
		const { title, message } = describeError(failure);
		return (
			<List navigationTitle="Play Queue">
				<List.EmptyView
					icon={Icon.Music}
					title={title}
					description={message}
					actions={
						<ActionPanel>
							<Action
								title="Open Kaset"
								icon={Icon.Music}
								onAction={async () => {
									await launch();
									reload();
								}}
							/>
							<Action
								title="Retry"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={reload}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	// Vicinae cannot scroll or select a list item programmatically, so the queue is
	// ordered to put the playing track first instead. `track.index` keeps the real
	// queue position, so what is sent to `play track at index` is unaffected.
	const sections =
		currentIndex > 0
			? [
					{
						title: "Now Playing",
						items: tracks.filter((t) => t.index === currentIndex),
					},
					{
						title: "Up Next",
						items: tracks.filter((t) => t.index > currentIndex),
					},
					{
						title: "Earlier",
						items: tracks.filter((t) => t.index < currentIndex),
					},
				]
			: [{ title: "Queue", items: tracks }];

	const renderItem = (track: QueueTrack) => {
		const artwork = artworkUrl(track.artworkUrl, ARTWORK_SIZE);
		const isCurrent = track.index === currentIndex;
		const accessories: List.Item.Accessory[] = [];

		if (isCurrent) {
			accessories.push({
				tag: {
					value: player.info?.state === "paused" ? "Paused" : "Now Playing",
					color: Color.Green,
				},
			});
		}
		if (track.duration > 0)
			accessories.push({ text: formatTime(track.duration) });

		return (
			<List.Item
				key={`${track.index}-${track.videoId}`}
				title={track.name}
				subtitle={track.artist}
				keywords={[track.artist, track.album].filter(Boolean)}
				icon={
					artwork
						? {
								source: artwork,
								fallback: Icon.Music,
								mask: Image.Mask.RoundedRectangle,
							}
						: Icon.Music
				}
				accessories={accessories}
				actions={
					<ActionPanel>
						<ActionPanel.Section title={track.name}>
							<Action
								title={isCurrent ? "Restart This Track" : "Play This Track"}
								icon={Icon.Play}
								onAction={() => play(track.index)}
							/>
							{track.videoId ? (
								<Action.CopyToClipboard
									title="Copy Track Link"
									content={`https://music.youtube.com/watch?v=${track.videoId}`}
									shortcut={Keyboard.Shortcut.Common.Copy}
								/>
							) : null}
						</ActionPanel.Section>

						<PlaybackActions player={player} />

						<ActionPanel.Section title="Kaset">
							<Action
								title="Open Kaset"
								icon={Icon.Music}
								shortcut={Keyboard.Shortcut.Common.Open}
								onAction={() => launch()}
							/>
							<Action
								title="Refresh"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={reload}
							/>
						</ActionPanel.Section>
					</ActionPanel>
				}
			/>
		);
	};

	return (
		<List
			navigationTitle="Play Queue"
			isLoading={isLoading}
			searchBarPlaceholder="Search the queue…"
		>
			<List.EmptyView
				icon={Icon.Music}
				title="The queue is empty"
				description="Start playing something in Kaset."
				actions={
					<ActionPanel>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							onAction={reload}
						/>
					</ActionPanel>
				}
			/>

			{sections
				.filter((section) => section.items.length > 0)
				.map((section) => (
					<List.Section
						key={section.title}
						title={section.title}
						subtitle={
							section.items.length > 1
								? String(section.items.length)
								: undefined
						}
					>
						{section.items.map(renderItem)}
					</List.Section>
				))}
		</List>
	);
}
