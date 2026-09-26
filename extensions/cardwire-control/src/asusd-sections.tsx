import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import type {
	ArmouryChoices,
	ProfilePower,
	ProfileStatus,
} from "./asusd-parse";
import {
	chargeLimits,
	dgpuFirmwarePresentation,
	profileAccessories,
	profilePresentation,
} from "./asusd-presentation";
import { RefreshAction } from "./refresh-action";

export function ProfileSection({
	status,
	onSetProfile,
	onReload,
}: {
	status: ProfileStatus;
	onSetProfile: (profile: string, power: ProfilePower) => void;
	onReload: () => void;
}) {
	return (
		<List.Section title="Platform profiles">
			{status.available.map((profile) => {
				const active = profile === status.active;
				const presentation = profilePresentation(profile);
				return (
					<List.Item
						key={profile}
						id={`profile-${profile}`}
						title={presentation.title}
						subtitle={presentation.subtitle}
						icon={active ? Icon.Checkmark : presentation.icon}
						keywords={[profile, "asus", "asusd"]}
						accessories={profileAccessories(profile, status)}
						actions={
							<ActionPanel>
								<Action
									title={
										active
											? `Already ${presentation.title}`
											: `Switch to ${presentation.title}`
									}
									icon={active ? Icon.Checkmark : Icon.Gauge}
									onAction={() => onSetProfile(profile, "active")}
								/>
								<Action
									title={`Use ${presentation.title} on AC`}
									icon={Icon.Plug}
									onAction={() => onSetProfile(profile, "ac")}
								/>
								<Action
									title={`Use ${presentation.title} on battery`}
									icon={Icon.Battery}
									onAction={() => onSetProfile(profile, "battery")}
								/>
								<RefreshAction onReload={onReload} />
							</ActionPanel>
						}
					/>
				);
			})}
		</List.Section>
	);
}

export function ChargeLimitSection({
	current,
	onSetLimit,
	onReload,
}: {
	current: number;
	onSetLimit: (limit: number) => void;
	onReload: () => void;
}) {
	return (
		<List.Section title="Charge limit">
			{chargeLimits(current).map((limit) => {
				const active = limit === current;
				return (
					<List.Item
						key={limit}
						id={`charge-${limit}`}
						title={`${limit}%`}
						subtitle={
							limit === 100 ? "Charge fully" : `Stop charging at ${limit}%`
						}
						icon={active ? Icon.Checkmark : Icon.BatteryCharging}
						keywords={["battery", "charge", "asus"]}
						accessories={
							active ? [{ tag: { value: "Active", color: Color.Green } }] : []
						}
						actions={
							<ActionPanel>
								<Action
									title={
										active
											? `Already ${limit}%`
											: `Set charge limit to ${limit}%`
									}
									icon={active ? Icon.Checkmark : Icon.Battery}
									onAction={() => onSetLimit(limit)}
								/>
								<RefreshAction onReload={onReload} />
							</ActionPanel>
						}
					/>
				);
			})}
		</List.Section>
	);
}

export function DgpuFirmwareSection({
	choices,
	onSetDisabled,
	onReload,
}: {
	choices: ArmouryChoices;
	onSetDisabled: (disabled: boolean) => void;
	onReload: () => void;
}) {
	return (
		<List.Section title="Firmware dGPU">
			{choices.options.map((value) => {
				const disabled = value === 1;
				const active = value === choices.current;
				const presentation = dgpuFirmwarePresentation(disabled);
				return (
					<List.Item
						key={value}
						id={`dgpu-${value}`}
						title={presentation.title}
						subtitle={presentation.subtitle}
						icon={active ? Icon.Checkmark : presentation.icon}
						keywords={["dgpu", "armoury", "firmware", "asus"]}
						accessories={
							active ? [{ tag: { value: "Active", color: Color.Green } }] : []
						}
						actions={
							<ActionPanel>
								<Action
									title={
										active
											? `Already ${presentation.title}`
											: `Set firmware dGPU ${presentation.title.toLowerCase()}`
									}
									icon={active ? Icon.Checkmark : presentation.icon}
									onAction={() => onSetDisabled(disabled)}
								/>
								<RefreshAction onReload={onReload} />
							</ActionPanel>
						}
					/>
				);
			})}
		</List.Section>
	);
}
