import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@vicinae/api";
import { useState } from "react";
import { describeError } from "./lib/feedback";
import { volumeIcon } from "./lib/format";
import {
	clampVolume,
	launch,
	mutateAndRead,
	setVolumeAndRead,
} from "./lib/kaset";
import { usePlayer } from "./lib/use-player";

const PRESETS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Parse a typed volume, accepting "40", "40%" and " 40 ". */
function parseTypedVolume(text: string): number | null {
	const match = text.trim().match(/^(\d{1,3})\s*%?$/);
	if (!match) return null;
	const value = Number.parseInt(match[1], 10);
	return value >= 0 && value <= 100 ? value : null;
}

export default function Volume() {
	const player = usePlayer({ pollMs: 3_000, tickMs: 0 });
	const [searchText, setSearchText] = useState("");
	const { info, error, isLoading, unavailable, perform, refresh } = player;

	if (unavailable) {
		const { title, message } = describeError(error);
		return (
			<List navigationTitle="Set Volume">
				<List.EmptyView
					icon={Icon.SpeakerOff}
					title={title}
					description={message}
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
			</List>
		);
	}

	const current = info?.volume ?? null;
	const typed = parseTypedVolume(searchText);
	const query = searchText.trim().toLowerCase();
	const presets = query
		? PRESETS.filter(
				(level) =>
					`${level}%`.startsWith(query) || `${level}`.startsWith(query),
			)
		: PRESETS;

	const hasCustom = typed !== null && !PRESETS.includes(typed);
	const hasResults = hasCustom || presets.length > 0;

	const setTo = (level: number) =>
		perform(() => setVolumeAndRead(clampVolume(level)));

	const extraActions = (
		<ActionPanel.Section title="Kaset">
			<Action
				title={info?.muted ? "Unmute" : "Mute"}
				icon={volumeIcon(info?.volume ?? 0, info?.muted)}
				shortcut={{ modifiers: ["cmd"], key: "m" }}
				onAction={() => perform(() => mutateAndRead("toggleMute"))}
			/>
			<Action
				title="Refresh"
				icon={Icon.ArrowClockwise}
				shortcut={Keyboard.Shortcut.Common.Refresh}
				onAction={refresh}
			/>
		</ActionPanel.Section>
	);

	return (
		<List
			navigationTitle="Set Volume"
			isLoading={isLoading}
			filtering={false}
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder={
				current === null
					? "Type a volume between 0 and 100…"
					: `Currently ${current}% — type any value`
			}
		>
			{!hasResults && (
				<List.EmptyView
					icon={Icon.SpeakerOn}
					title="No matching volume"
					description="Type a number between 0 and 100 to set the volume directly."
					actions={<ActionPanel>{extraActions}</ActionPanel>}
				/>
			)}

			{hasCustom && typed !== null ? (
				<List.Section title="Custom">
					<List.Item
						key="custom"
						title={`Set volume to ${typed}%`}
						icon={volumeIcon(typed)}
						actions={
							<ActionPanel>
								<Action
									title={`Set Volume to ${typed}%`}
									icon={Icon.SpeakerOn}
									onAction={() => setTo(typed)}
								/>
								{extraActions}
							</ActionPanel>
						}
					/>
				</List.Section>
			) : null}

			{presets.length > 0 && (
				<List.Section title="Levels">
					{presets.map((level) => (
						<List.Item
							key={level}
							title={`${level}%`}
							icon={volumeIcon(level)}
							accessories={
								level === current
									? [
											{
												icon: Icon.Checkmark,
												tag: { value: "Current", color: Color.Green },
											},
										]
									: []
							}
							actions={
								<ActionPanel>
									<Action
										title={`Set Volume to ${level}%`}
										icon={Icon.SpeakerOn}
										onAction={() => setTo(level)}
									/>
									{extraActions}
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
