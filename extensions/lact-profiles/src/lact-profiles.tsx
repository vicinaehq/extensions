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
	type AutoSwitchStatus,
	getAutoSwitchStatus,
	getCurrentProfile,
	getProfiles,
	setAutoSwitchEnabled,
	setProfile,
} from "./lact-cli";

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
			await setProfile(profile);
			const currentProfile = await getCurrentProfile();
			setActiveProfile(currentProfile);
			setAutoSwitchStatus(await getAutoSwitchStatus());

			if (currentProfile !== profile) {
				showToast({
					title: "Profile selection was overridden",
					message: `LACT reports “${currentProfile}”. Automatic switching may be enabled.`,
					style: Toast.Style.Failure,
				});
				return;
			}

			showToast({
				title: "LACT profile selected",
				message: profile,
				style: Toast.Style.Success,
			});
		} catch (changeError) {
			showToast({
				title: "Could not change LACT profile",
				message: errorMessage(changeError),
				style: Toast.Style.Failure,
			});
		}
	};

	const handleToggleAutoSwitch = async () => {
		if (!autoSwitchStatus?.available) return;

		const requestedState = !autoSwitchStatus.enabled;

		try {
			await setAutoSwitchEnabled(requestedState);
			const confirmedStatus = await getAutoSwitchStatus();
			setAutoSwitchStatus(confirmedStatus);

			if (!confirmedStatus.available) {
				throw new Error(confirmedStatus.error);
			}

			if (confirmedStatus.enabled !== requestedState) {
				throw new Error(
					"LACT did not confirm the requested auto-switch state.",
				);
			}

			showToast({
				title: requestedState
					? "Automatic profile switching enabled"
					: "Automatic profile switching disabled",
				style: Toast.Style.Success,
			});
		} catch (toggleError) {
			showToast({
				title: "Could not change automatic switching",
				message: errorMessage(toggleError),
				style: Toast.Style.Failure,
			});
		}
	};

	if (error) {
		return (
			<Detail
				markdown={`# LACT profiles unavailable\n\n${error}\n\nCheck that the LACT CLI is installed, the \`lactd\` service is running, and your desktop user can access its socket.`}
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
									title="Select profile"
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
									? "LACT rules may replace a manually selected profile"
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
