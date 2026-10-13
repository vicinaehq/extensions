import { useEffect, useState } from "react";
import { List } from "@vicinae/api";
import { type AbendrotStatus, json } from "./lib/cli.ts";

function scheduleLabel(mode?: string): string {
	if (mode === "sunset") return "Sunset schedule";
	if (mode === "always-on") return "Always on";
	if (mode === "off") return "Off";
	return mode ?? "Unknown";
}

function percent(value?: number): string {
	return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

const accessory = (value: string): { text: string } => ({ text: value });

export default function Command() {
	const [state, setState] = useState<AbendrotStatus | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void json<AbendrotStatus>(["status"])
			.then(setState)
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
	}, []);

	if (error) {
		return (
			<List searchBarPlaceholder="Abendrot status">
				<List.EmptyView title="Cannot read Abendrot status" description={error} />
			</List>
		);
	}

	if (!state) {
		return <List isLoading searchBarPlaceholder="Abendrot status" />;
	}

	const running = state.running === true;
	const schedule = `${scheduleLabel(state.scheduleMode)}${
		state.isEnabled === true && state.isScheduleActiveNow ? " · warming now" : ""
	}`;

	return (
		<List searchBarPlaceholder="Abendrot status">
			<List.Section title={running ? "App" : "App (not running, saved settings)"}>
				<List.Item title="Warming" accessories={[accessory(state.isEnabled === true ? "Enabled" : "Disabled")]} />
				<List.Item title="Schedule" accessories={[accessory(schedule)]} />
				{state.cozy !== undefined && (
					<List.Item title="Cozy mode" accessories={[accessory(state.cozy ? "On" : "Off")]} />
				)}
				{state.appVersion && (
					<List.Item
						title="Version"
						accessories={[accessory(`${state.appVersion} (${state.appBuild ?? "?"})`)]}
					/>
				)}
				{state.updatedAt && <List.Item title="Updated" accessories={[accessory(state.updatedAt)]} />}
			</List.Section>

			<List.Section title="Warmth">
				<List.Item
					title="Strength"
					subtitle="0 = none, 1 = warmest"
					accessories={[accessory(percent(state.globalWarmthStrength))]}
				/>
				{state.globalKelvin !== undefined && (
					<List.Item title="Effective color" accessories={[accessory(`${state.globalKelvin}K`)]} />
				)}
				{state.warmestPointKelvin !== undefined && (
					<List.Item title="Warmest point" accessories={[accessory(`${state.warmestPointKelvin}K`)]} />
				)}
				{state.revealMode && (
					<List.Item
						title="Reveal mode"
						accessories={[accessory(state.revealMode === "hold" ? "Hold" : "Toggle")]}
					/>
				)}
				{state.isRevealing === true && <List.Item title="Revealing true color" accessories={[accessory("Now")]} />}
			</List.Section>

			{state.displays !== undefined && (
				<List.Section title="Displays">
					{state.displays.length === 0 ? (
						<List.Item title="(none reported)" />
					) : (
						state.displays.map((display) => (
							<List.Item
								key={display.id ?? display.name ?? "-"}
								title={display.name ?? "Display"}
								subtitle={display.appliedMethod}
								accessories={[
									accessory(percent(display.warmthStrength)),
									...(display.isHardwareDDCEnabled ? [accessory("DDC")] : []),
									...(display.warmthOverridden ? [accessory("custom")] : []),
									...(display.lastError ? [accessory(display.lastError)] : []),
								]}
							/>
						))
					)}
				</List.Section>
			)}

			{state.excludedApps !== undefined && (
				<List.Section title="Excluded apps">
					{state.excludedApps.length === 0 ? (
						<List.Item title="(none)" />
					) : (
						state.excludedApps.map((bundleId) => <List.Item key={bundleId} title={bundleId} />)
					)}
				</List.Section>
			)}
		</List>
	);
}