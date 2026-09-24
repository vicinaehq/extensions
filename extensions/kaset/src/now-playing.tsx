import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	Keyboard,
} from "@vicinae/api";
import { describeError } from "./lib/feedback";
import {
	artworkUrl,
	formatTime,
	likeLabel,
	playbackLabel,
	progressBar,
	repeatLabel,
	volumeIcon,
} from "./lib/format";
import { launch } from "./lib/kaset";
import { PlaybackActions } from "./lib/playback-actions";
import { usePlayer } from "./lib/use-player";
import Queue from "./queue";

const ARTWORK_SIZE = 280;

export default function NowPlaying() {
	const player = usePlayer({ pollMs: 2_000, tickMs: 1_000 });
	const { info, position, error, isLoading, unavailable, refresh } = player;

	if (unavailable) {
		const { title, message } = describeError(error);
		return (
			<Detail
				navigationTitle="Now Playing"
				markdown={`# ${title}\n\n${message ?? ""}`}
				actions={
					<ActionPanel>
						<Action
							title="Open Kaset"
							icon={Icon.Music}
							onAction={async () => {
								await launch();
								refresh();
							}}
						/>
						<Action
							title="Retry"
							icon={Icon.ArrowClockwise}
							shortcut={Keyboard.Shortcut.Common.Refresh}
							onAction={refresh}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	if (!info) {
		return (
			<Detail
				navigationTitle="Now Playing"
				markdown={
					isLoading
						? "# Connecting to Kaset…"
						: "# No player state\n\nKaset did not report anything to show."
				}
				actions={
					<ActionPanel>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							shortcut={Keyboard.Shortcut.Common.Refresh}
							onAction={refresh}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	if (!info.track) {
		return (
			<Detail
				navigationTitle="Now Playing"
				markdown="# Nothing is playing\n\nStart something in Kaset, or pick a track from the play queue."
				actions={
					<ActionPanel>
						<Action.Push
							title="Show Play Queue"
							icon={Icon.AppWindowList}
							target={<Queue />}
						/>
						<Action
							title="Open Kaset"
							icon={Icon.Music}
							onAction={async () => {
								await launch();
								refresh();
							}}
						/>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							shortcut={Keyboard.Shortcut.Common.Refresh}
							onAction={refresh}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	const track = info.track;
	const artwork = artworkUrl(track.artworkUrl, ARTWORK_SIZE);
	const duration = info.duration || track.duration;
	const watchUrl = track.videoId
		? `https://music.youtube.com/watch?v=${track.videoId}`
		: undefined;

	const markdown = [
		artwork ? `![${track.name}](${artwork})` : undefined,
		`# ${track.name}`,
		`**${track.artist}**${track.album ? ` · ${track.album}` : ""}`,
		`\`${progressBar(position, duration)}\` ${formatTime(position)} / ${formatTime(duration)}`,
	]
		.filter(Boolean)
		.join("\n\n");

	return (
		<Detail
			navigationTitle="Now Playing"
			markdown={markdown}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Status"
						text={playbackLabel(info.state)}
						icon={info.state === "playing" ? Icon.PlayFilled : Icon.PauseFilled}
					/>
					<Detail.Metadata.Label
						title="Artist"
						text={track.artist}
						icon={Icon.Person}
					/>
					{track.album ? (
						<Detail.Metadata.Label
							title="Album"
							text={track.album}
							icon={Icon.Music}
						/>
					) : null}
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label
						title="Volume"
						text={info.muted ? "Muted" : `${info.volume}%`}
						icon={volumeIcon(info.volume, info.muted)}
					/>
					<Detail.Metadata.Label
						title="Shuffle"
						text={{
							value: info.shuffling ? "On" : "Off",
							color: info.shuffling ? Color.Green : Color.SecondaryText,
						}}
						icon={Icon.Shuffle}
					/>
					<Detail.Metadata.Label
						title="Repeat"
						text={{
							value: repeatLabel(info.repeating),
							color:
								info.repeating === "off" ? Color.SecondaryText : Color.Green,
						}}
						icon={Icon.Repeat}
					/>
					<Detail.Metadata.Label
						title="Rating"
						text={{
							value: likeLabel(info.likeStatus),
							color:
								info.likeStatus === "liked"
									? Color.Green
									: info.likeStatus === "disliked"
										? Color.Red
										: Color.SecondaryText,
						}}
						icon={
							info.likeStatus === "disliked" ? Icon.HeartDisabled : Icon.Heart
						}
					/>
					{watchUrl ? (
						<>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Link
								title="Video"
								target={watchUrl}
								text={track.videoId}
							/>
						</>
					) : null}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<PlaybackActions player={player} />
					<ActionPanel.Section title="Kaset">
						<Action.Push
							title="Show Play Queue"
							icon={Icon.AppWindowList}
							shortcut={{ modifiers: ["cmd"], key: "u" }}
							target={<Queue />}
						/>
						{watchUrl ? (
							<Action.CopyToClipboard
								title="Copy Track Link"
								content={watchUrl}
								shortcut={Keyboard.Shortcut.Common.Copy}
							/>
						) : null}
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
							onAction={refresh}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
