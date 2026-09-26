import {
	Action,
	ActionPanel,
	Icon,
	List,
	openExtensionPreferences,
	showToast,
	Toast,
} from "@vicinae/api";
import { useState } from "react";
import {
	BinError,
	loadAsusdSnapshot,
	type ProfilePower,
	setChargeLimit,
	setDgpuDisabled,
	setProfile,
} from "./asusd";
import type { AsusdSnapshot } from "./asusd-parse";
import {
	ChargeLimitSection,
	DgpuFirmwareSection,
	ProfileSection,
} from "./asusd-sections";
import { RefreshAction } from "./refresh-action";

type ViewState =
	| { kind: "loading" }
	| { kind: "missing-cli"; message: string }
	| { kind: "error"; message: string }
	| { kind: "ready"; snapshot: AsusdSnapshot };

async function refreshSnapshot(
	setState: (state: ViewState) => void,
): Promise<void> {
	try {
		const snapshot = await loadAsusdSnapshot();
		setState({ kind: "ready", snapshot });
	} catch (error) {
		if (error instanceof BinError && error.kind === "missing-cli") {
			setState({ kind: "missing-cli", message: error.message });
			return;
		}
		setState({
			kind: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export default function SetAsusState() {
	const [state, setState] = useState<ViewState>({ kind: "loading" });
	const [reload] = useState(() => {
		const run = () => refreshSnapshot(setState);
		void run();
		return run;
	});

	const handleSetProfile = async (profile: string, power: ProfilePower) => {
		if (state.kind !== "ready") {
			return;
		}
		if (
			alreadyUsingProfile({ profile, power, status: state.snapshot.profiles })
		) {
			await showToast({
				title: toastTitleForProfile({ profile, power, done: true }),
			});
			return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: toastTitleForProfile({ profile, power }),
		});
		try {
			await setProfile(profile, power);
			toast.style = Toast.Style.Success;
			toast.title = toastTitleForProfile({ profile, power, done: true });
			await reload();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to set profile";
			toast.message = error instanceof Error ? error.message : String(error);
		}
	};

	const handleSetLimit = async (limit: number) => {
		if (state.kind !== "ready") {
			return;
		}
		if (limit === state.snapshot.chargeLimit) {
			await showToast({ title: `Already ${limit}%` });
			return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Setting charge limit to ${limit}%`,
		});
		try {
			await setChargeLimit(limit);
			toast.style = Toast.Style.Success;
			toast.title = `Charge limit ${limit}%`;
			await reload();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to set charge limit";
			toast.message = error instanceof Error ? error.message : String(error);
		}
	};

	const handleSetDgpuDisabled = async (disabled: boolean) => {
		if (state.kind !== "ready" || !state.snapshot.dgpuDisable) {
			return;
		}
		const already = state.snapshot.dgpuDisable.current === (disabled ? 1 : 0);
		if (already) {
			await showToast({
				title: disabled
					? "Firmware dGPU already disabled"
					: "Firmware dGPU already enabled",
			});
			return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: disabled ? "Disabling firmware dGPU" : "Enabling firmware dGPU",
		});
		try {
			await setDgpuDisabled(disabled);
			toast.style = Toast.Style.Success;
			toast.title = disabled
				? "Firmware dGPU disabled"
				: "Firmware dGPU enabled";
			await reload();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to set firmware dGPU";
			toast.message = error instanceof Error ? error.message : String(error);
		}
	};

	return (
		<List
			isLoading={state.kind === "loading"}
			searchBarPlaceholder="Search ASUS controls"
			navigationTitle={
				state.kind === "ready"
					? `ASUS: ${state.snapshot.profiles.active}`
					: "ASUS"
			}
		>
			{state.kind === "missing-cli" ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="asusctl not found"
					description={state.message}
					actions={
						<ActionPanel>
							<Action
								title="Open extension preferences"
								icon={Icon.Cog}
								onAction={openExtensionPreferences}
							/>
						</ActionPanel>
					}
				/>
			) : null}

			{state.kind === "error" ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Could not read asusd state"
					description={state.message}
					actions={
						<ActionPanel>
							<RefreshAction onReload={reload} />
						</ActionPanel>
					}
				/>
			) : null}

			{state.kind === "ready" ? (
				<>
					<ProfileSection
						status={state.snapshot.profiles}
						onSetProfile={handleSetProfile}
						onReload={reload}
					/>
					<ChargeLimitSection
						current={state.snapshot.chargeLimit}
						onSetLimit={handleSetLimit}
						onReload={reload}
					/>
					{state.snapshot.dgpuDisable ? (
						<DgpuFirmwareSection
							choices={state.snapshot.dgpuDisable}
							onSetDisabled={handleSetDgpuDisabled}
							onReload={reload}
						/>
					) : null}
				</>
			) : null}
		</List>
	);
}

function toastTitleForProfile({
	profile,
	power,
	done,
}: {
	profile: string;
	power: ProfilePower;
	done?: boolean;
}): string {
	switch (power) {
		case "active":
			return done ? `Now ${profile}` : `Switching to ${profile}`;
		case "ac":
			return done
				? `AC profile ${profile}`
				: `Setting AC profile to ${profile}`;
		case "battery":
			return done
				? `Battery profile ${profile}`
				: `Setting battery profile to ${profile}`;
		default: {
			const _exhaustive: never = power;
			return _exhaustive;
		}
	}
}

function alreadyUsingProfile({
	profile,
	power,
	status,
}: {
	profile: string;
	power: ProfilePower;
	status: AsusdSnapshot["profiles"];
}): boolean {
	switch (power) {
		case "active":
			return profile === status.active;
		case "ac":
			return profile === status.ac;
		case "battery":
			return profile === status.battery;
		default: {
			const _exhaustive: never = power;
			return _exhaustive;
		}
	}
}
