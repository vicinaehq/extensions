import React, { useState, useEffect } from "react";
import {
	List,
	ActionPanel,
	Action,
	Icon,
	Toast,
	showToast,
} from "@vicinae/api";
import {
	changeProfile,
	getAllProfiles,
	getActiveProfile,
} from "../utils/powerprofilesctl-cli";

const PROFILE_CHANGE_TIMEOUT_MS = 2000;

export const ProfileSelector = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [profiles, setProfiles] = useState<string[]>([]);
	const [activeProfile, setActiveProfile] = useState<string>("");

	const handleChangeProfile = async (profile: string) => {
		const oldProfile = activeProfile;

		const result = await changeProfile(profile, PROFILE_CHANGE_TIMEOUT_MS);

		if (result === "timeout") {
			showToast({
				title: "Timeout",
				message:
					"The profile change timed out, is the power-profiles-daemon running?",
				style: Toast.Style.Failure,
			});
			return;
		}

		const newActive = await getActiveProfile();

		if (newActive === oldProfile) {
			showToast({
				title: "The profile change failed",
				style: Toast.Style.Failure,
			});
			return;
		}

		showToast({
			title: "Success",
			style: Toast.Style.Success,
		});
		setActiveProfile(newActive);
	};

	useEffect(() => {
		Promise.all([getAllProfiles(), getActiveProfile()]).then(
			([profiles, activeProfile]) => {
				setProfiles(profiles);
				setActiveProfile(activeProfile);
				setIsLoading(false);
			},
		);
	}, []);

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Select your power profile..."
		>
			<List.Section title={"Profiles"}>
				{profiles.map((profile) => (
					<List.Item
						key={profile}
						title={profile}
						icon={profile === activeProfile ? Icon.Checkmark : Icon.Cog}
						keywords={[profile]}
						actions={
							<ActionPanel>
								<Action
									title="Select"
									icon={Icon.Cog}
									onAction={() => handleChangeProfile(profile)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
};
