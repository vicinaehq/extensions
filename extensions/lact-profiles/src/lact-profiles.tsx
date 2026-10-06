import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	getAutoSwitchStatus,
	getCurrentProfile,
	getProfiles,
	selectProfileAndRefresh,
	setAutoSwitchEnabledPreservingProfile,
} from "./lact-cli.js";

type AutoSwitchStatus = Awaited<ReturnType<typeof getAutoSwitchStatus>>;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function LactProfiles() {
	const [isLoading, setIsLoading] = useState(true);
	const [profiles, setProfiles] = useState<string[]>([]);
	const [activeProfile, setActiveProfile] = useState("");
	const [autoSwitchStatus, setAutoSwitchStatus] =
		useState<AutoSwitchStatus | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = async () => {
		setIsLoading(true);
		setError(null);

		try {
			const [availableProfiles, currentProfile, autoSwitch] = await Promise.all(
				[getProfiles(), getCurrentProfile(), getAutoSwitchStatus()],
			);

			if (availableProfiles.length === 0) {
				throw new Error("LACT returned no profiles.");
			}

			setProfiles(availableProfiles);
			setActiveProfile(currentProfile);
			setAutoSwitchStatus(autoSwitch);
		} catch (loadError) {
			setError(errorMessage(loadError));
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	const handleSelectProfile = async (profile: string) => {
		try {
			const {
				currentProfile,
				autoSwitchStatus: actualStatus,
				error: selectionError,
				warning: selectionWarning,
			} = await selectProfileAndRefresh(profile);
			setActiveProfile(currentProfile ?? "");
			setAutoSwitchStatus(actualStatus);
			const actualSwitchState = actualStatus.available
				? actualStatus.enabled
					? "enabled"
					: "disabled"
				: "unavailable";

			if (selectionError) {
				showToast({
					title: "Could not complete profile selection",
					message: `${selectionError} Current profile: ${currentProfile ?? "unavailable"}; automatic switching is ${actualSwitchState}.`,
					style: Toast.Style.Failure,
				});
				return;
			}

			showToast({
				title: selectionWarning
					? "Profile state verified"
					: "LACT profile selected",
				message: selectionWarning
					? `${profile}; automatic switching is disabled. LACT returned an error, but readback confirms the requested state: ${selectionWarning}`
					: `${profile}; automatic switching is now disabled.`,
				style: Toast.Style.Success,
			});
		} catch (changeError) {
			const [actualStatus, currentProfile] = await Promise.all([
				getAutoSwitchStatus(),
				getCurrentProfile().catch(() => null),
			]);
			setActiveProfile(currentProfile ?? "");
			setAutoSwitchStatus(actualStatus);
			const actualSwitchState = actualStatus.available
				? actualStatus.enabled
					? "enabled"
					: "disabled"
				: "unavailable";

			showToast({
				title: "Could not complete profile selection",
				message: `${errorMessage(changeError)} Current profile: ${currentProfile ?? "unavailable"}; automatic switching is ${actualSwitchState}.`,
				style: Toast.Style.Failure,
			});
		}
	};

	const handleToggleAutoSwitch = async () => {
		if (!autoSwitchStatus?.available) return;

		const requestedState = !autoSwitchStatus.enabled;

		try {
			const { status: confirmedStatus, currentProfile } =
				await setAutoSwitchEnabledPreservingProfile(requestedState);
			setAutoSwitchStatus(confirmedStatus);
			setActiveProfile(currentProfile);

			showToast({
				title: requestedState
					? "Automatic profile switching enabled"
					: "Automatic profile switching disabled",
				style: Toast.Style.Success,
			});
		} catch (toggleError) {
			const [actualStatus, currentProfile] = await Promise.all([
				getAutoSwitchStatus(),
				getCurrentProfile().catch(() => null),
			]);
			setAutoSwitchStatus(actualStatus);
			if (currentProfile !== null) setActiveProfile(currentProfile);
			const actualSwitchState = actualStatus.available
				? actualStatus.enabled
					? "enabled"
					: "disabled"
				: "unavailable";

			showToast({
				title: "Could not complete automatic-switch change",
				message: `${errorMessage(toggleError)} Current profile: ${currentProfile ?? "unavailable"}; automatic switching is ${actualSwitchState}.`,
				style: Toast.Style.Failure,
			});
		}
	};

	if (error) {
		return (
			<Detail
				markdown={`# LACT profiles unavailable\n\n${error}\n\nThe profile CLI requires LACT v0.8.2 or later. Check that the lact command is on PATH, lactd is running, and your desktop user can access its socket.`}
			/>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Choose a LACT profile…">
			<List.Section title="Profiles">
				{profiles.map((profile) => (
					<List.Item
						key={profile}
						title={profile}
						subtitle={profile === activeProfile ? "Active profile" : undefined}
						icon={profile === activeProfile ? Icon.Checkmark : Icon.Cog}
						actions={
							<ActionPanel>
								<Action
									title="Select profile (disables auto-switch)"
									icon={Icon.Checkmark}
									onAction={() => handleSelectProfile(profile)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
			<List.Section title="Automatic switching">
				<List.Item
					title={
						autoSwitchStatus === null
							? "Checking status…"
							: !autoSwitchStatus.available
								? "Status unavailable"
								: autoSwitchStatus.enabled
									? "Enabled"
									: "Disabled"
					}
					subtitle={
						autoSwitchStatus === null
							? "Reading LACT profile-switch settings"
							: !autoSwitchStatus.available
								? `Could not read automatic-switch status: ${autoSwitchStatus.error}`
								: autoSwitchStatus.enabled
									? "Selecting a profile turns automatic switching off"
									: "Manual profile selections will remain in effect"
					}
					icon={Icon.Cog}
					actions={
						!autoSwitchStatus?.available ? undefined : (
							<ActionPanel>
								<Action
									title={
										autoSwitchStatus.enabled
											? "Disable automatic switching"
											: "Enable automatic switching"
									}
									icon={Icon.Cog}
									onAction={handleToggleAutoSwitch}
								/>
							</ActionPanel>
						)
					}
				/>
			</List.Section>
		</List>
	);
}
