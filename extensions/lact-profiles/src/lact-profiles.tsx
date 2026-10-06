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
	getAutoSwitchEnabled,
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
	const [autoSwitchEnabled, setAutoSwitchEnabledState] = useState<
		boolean | null
	>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = async () => {
		setIsLoading(true);
		setError(null);

		try {
			const [availableProfiles, currentProfile, autoSwitch] = await Promise.all(
				[getProfiles(), getCurrentProfile(), getAutoSwitchEnabled()],
			);

			if (availableProfiles.length === 0) {
				throw new Error("LACT returned no profiles.");
			}

			setProfiles(availableProfiles);
			setActiveProfile(currentProfile);
			setAutoSwitchEnabledState(autoSwitch);
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
			setAutoSwitchEnabledState(await getAutoSwitchEnabled());

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
		if (autoSwitchEnabled === null) return;

		const requestedState = !autoSwitchEnabled;

		try {
			await setAutoSwitchEnabled(requestedState);
			const confirmedState = await getAutoSwitchEnabled();
			setAutoSwitchEnabledState(confirmedState);

			if (confirmedState !== requestedState) {
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
						autoSwitchEnabled === null
							? "Status unavailable"
							: autoSwitchEnabled
								? "Enabled"
								: "Disabled"
					}
					subtitle={
						autoSwitchEnabled
							? "LACT rules may replace a manually selected profile"
							: autoSwitchEnabled === false
								? "Manual profile selections will remain in effect"
								: "This LACT version may not expose auto-switch status"
					}
					icon={Icon.Cog}
					actions={
						autoSwitchEnabled === null ? undefined : (
							<ActionPanel>
								<Action
									title={
										autoSwitchEnabled
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
