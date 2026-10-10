import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { listRemotePlayers, mprisAction } from "./lib/client";
import { formatDuration } from "./lib/devices/format";
import { useDevices } from "./lib/devices/store";
import { showKcdError } from "./lib/errors";
import type { MprisRemotePlayer } from "./lib/types";

/** kcd's CLI converts seek offsets with `Duration.Milliseconds()`. */
const SEEK_STEP_MS = 10_000;

export default function MediaControlCommand() {
	const { devices, daemonDown } = useDevices();
	const [players, setPlayers] = useState<MprisRemotePlayer[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		setIsLoading(true);
		try {
			setPlayers(await listRemotePlayers());
		} catch (error) {
			await showKcdError(error, "Could not load players");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function act(
		player: MprisRemotePlayer,
		options: { action?: string; seek?: number; volume?: number },
		failureTitle: string,
	) {
		try {
			await mprisAction({
				deviceId: player.deviceId,
				player: player.player,
				...options,
			});
			// Some phone MPRIS implementations stop playback on a track change.
			if (options.action === "Next" || options.action === "Previous") {
				await mprisAction({
					deviceId: player.deviceId,
					player: player.player,
					action: "Play",
				});
			}
			await load();
		} catch (error) {
			await showKcdError(error, failureTitle);
		}
	}

	if (daemonDown) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="kcd daemon is not running"
					description="Start it with: systemctl --user start kcd"
				/>
			</List>
		);
	}

	if (!isLoading && players.length === 0) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Music}
					title="Nothing is playing"
					description="Start playback on a connected device, then refresh."
					actions={
						<ActionPanel>
							<Action
								title="Refresh"
								icon={Icon.ArrowClockwise}
								onAction={load}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	const byDevice = new Map<string, MprisRemotePlayer[]>();
	for (const player of players) {
		const list = byDevice.get(player.deviceId) ?? [];
		list.push(player);
		byDevice.set(player.deviceId, list);
	}

	const deviceName = (id: string) =>
		devices.find((d) => d.id === id)?.name ?? id;

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search players…">
			{[...byDevice.entries()].map(([deviceId, devicePlayers]) => (
				<List.Section key={deviceId} title={deviceName(deviceId)}>
					{devicePlayers.map((player) => (
						<List.Item
							key={`${deviceId}:${player.player}`}
							icon={{
								source: player.isPlaying ? Icon.Play : Icon.Pause,
								tintColor: player.isPlaying ? Color.Green : Color.SecondaryText,
							}}
							title={player.title || "Unknown track"}
							subtitle={[player.artist, player.album]
								.filter(Boolean)
								.join(" — ")}
							accessories={[
								...(player.length > 0
									? [
											{
												text: `${formatDuration(player.pos)} / ${formatDuration(player.length)}`,
											},
										]
									: []),
								{ tag: player.player },
							]}
							actions={
								<ActionPanel>
									<ActionPanel.Section title="Playback">
										{player.canPause || player.canPlay ? (
											<Action
												title={player.isPlaying ? "Pause" : "Play"}
												icon={player.isPlaying ? Icon.Pause : Icon.Play}
												onAction={() =>
													act(
														player,
														{ action: "PlayPause" },
														"Could not control playback",
													)
												}
											/>
										) : null}
										{player.canGoNext ? (
											<Action
												title="Next Track"
												icon={Icon.Forward}
												onAction={() =>
													act(
														player,
														{ action: "Next" },
														"Could not skip track",
													)
												}
											/>
										) : null}
										{player.canGoPrevious ? (
											<Action
												title="Previous Track"
												icon={Icon.Rewind}
												onAction={() =>
													act(
														player,
														{ action: "Previous" },
														"Could not skip track",
													)
												}
											/>
										) : null}
										{player.canSeek ? (
											<>
												<Action
													title="Forward 10 Seconds"
													icon={Icon.ArrowRight}
													onAction={() =>
														act(
															player,
															{ seek: SEEK_STEP_MS },
															"Could not seek",
														)
													}
												/>
												<Action
													title="Back 10 Seconds"
													icon={Icon.ArrowLeft}
													onAction={() =>
														act(
															player,
															{ seek: -SEEK_STEP_MS },
															"Could not seek",
														)
													}
												/>
											</>
										) : null}
									</ActionPanel.Section>

									<ActionPanel.Section title="Volume">
										{[25, 50, 75, 100].map((level) => (
											<Action
												key={level}
												title={`Set Volume to ${level}%`}
												icon={Icon.SpeakerHigh}
												onAction={() =>
													act(player, { volume: level }, "Could not set volume")
												}
											/>
										))}
									</ActionPanel.Section>

									<ActionPanel.Section>
										<Action
											title="Refresh"
											icon={Icon.ArrowClockwise}
											onAction={load}
										/>
										{player.url ? (
											<Action.CopyToClipboard
												title="Copy Track URL"
												content={player.url}
												icon={Icon.CopyClipboard}
											/>
										) : null}
									</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			))}
		</List>
	);
}
