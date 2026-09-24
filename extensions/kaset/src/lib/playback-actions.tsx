import { Action, ActionPanel, Color, Icon } from "@vicinae/api";
import { settings } from "./feedback";
import { nextRepeatMode, repeatLabel, volumeIcon } from "./format";
import {
	changeTrack,
	clampVolume,
	mutateAndRead,
	setVolumeAndRead,
} from "./kaset";
import type { Player } from "./use-player";

/**
 * The playback controls shared by every view.
 *
 * Each action reads the resulting state back from Kaset in the same call, so the
 * view updates to what actually happened rather than to what we assumed would.
 */
export function PlaybackActions({ player }: { player: Player }) {
	const { info, perform } = player;
	const step = settings().volumeStep;
	const isPlaying = info?.state === "playing";
	const volume = info?.volume ?? 0;

	return (
		<>
			<ActionPanel.Section title="Playback">
				<Action
					title={isPlaying ? "Pause" : "Play"}
					icon={isPlaying ? Icon.Pause : Icon.Play}
					onAction={() => perform(() => mutateAndRead("playPause"))}
				/>
				<Action
					title="Next Track"
					icon={Icon.Forward}
					shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
					onAction={() => perform(() => changeTrack("nextTrack"))}
				/>
				<Action
					title="Previous Track"
					icon={Icon.Rewind}
					shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
					onAction={() => perform(() => changeTrack("previousTrack"))}
				/>
			</ActionPanel.Section>

			<ActionPanel.Section title="Options">
				<Action
					title={info?.shuffling ? "Turn Shuffle Off" : "Turn Shuffle On"}
					icon={{
						source: Icon.Shuffle,
						tintColor: info?.shuffling ? Color.Green : undefined,
					}}
					shortcut={{ modifiers: ["cmd"], key: "s" }}
					onAction={() => perform(() => mutateAndRead("toggleShuffle"))}
				/>
				<Action
					title={`Repeat: ${repeatLabel(nextRepeatMode(info?.repeating ?? "off"))}`}
					icon={{
						source: Icon.Repeat,
						tintColor:
							info && info.repeating !== "off" ? Color.Green : undefined,
					}}
					shortcut={{ modifiers: ["cmd"], key: "r" }}
					onAction={() => perform(() => mutateAndRead("cycleRepeat"))}
				/>
				<Action
					title={info?.muted ? "Unmute" : "Mute"}
					icon={volumeIcon(volume, info?.muted)}
					shortcut={{ modifiers: ["cmd"], key: "m" }}
					onAction={() => perform(() => mutateAndRead("toggleMute"))}
				/>
				<Action
					title={`Volume Up (${step}%)`}
					icon={Icon.SpeakerUp}
					shortcut={{ modifiers: ["cmd"], key: "arrowUp" }}
					onAction={() =>
						perform(() => setVolumeAndRead(clampVolume(volume + step)))
					}
				/>
				<Action
					title={`Volume Down (${step}%)`}
					icon={Icon.SpeakerDown}
					shortcut={{ modifiers: ["cmd"], key: "arrowDown" }}
					onAction={() =>
						perform(() => setVolumeAndRead(clampVolume(volume - step)))
					}
				/>
			</ActionPanel.Section>

			<ActionPanel.Section title="Rating">
				<Action
					title={info?.likeStatus === "liked" ? "Remove Like" : "Like Track"}
					icon={{
						source: Icon.Heart,
						tintColor: info?.likeStatus === "liked" ? Color.Green : undefined,
					}}
					shortcut={{ modifiers: ["cmd"], key: "l" }}
					onAction={() => perform(() => mutateAndRead("likeTrack"))}
				/>
				<Action
					title={
						info?.likeStatus === "disliked" ? "Remove Dislike" : "Dislike Track"
					}
					icon={{
						source: Icon.HeartDisabled,
						tintColor: info?.likeStatus === "disliked" ? Color.Red : undefined,
					}}
					shortcut={{ modifiers: ["cmd"], key: "d" }}
					onAction={() => perform(() => mutateAndRead("dislikeTrack"))}
				/>
			</ActionPanel.Section>
		</>
	);
}
