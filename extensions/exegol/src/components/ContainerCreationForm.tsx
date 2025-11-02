import {
	ActionPanel,
	Action,
	showToast,
	Icon,
	getPreferenceValues,
	useNavigation,
	Form,
} from "@vicinae/api";
import { parseExegolProfiles, startExegolContainer } from "../utils/cli";
import { useEffect, useState } from "react";

export const ContainerCreationForm = () => {
	const { pop } = useNavigation();
	const [isLoading, setIsLoading] = useState(true);
	const [profiles, setProfiles] = useState<Object>([]);

	const refreshProfiles = async () => {
		setIsLoading(true);

		try {
			const jsonProfileData = await parseExegolProfiles();
			setProfiles(jsonProfileData);
		} catch (error) {
			showToast({
				title: "Failed to list containers",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		refreshProfiles();
	}, []);

	const newContainer = async (values: {
		nameNewContainer?: string;
		profileNewContainer?: string;
	}) => {
		var { nameNewContainer, profileNewContainer } = values;
		const { terminal } = getPreferenceValues<Preferences>();

		if (nameNewContainer) {
			if (!profileNewContainer) {
				profileNewContainer = "default";
			}

			startExegolContainer(
				terminal,
				nameNewContainer,
				profileNewContainer,
				profiles,
			);
			pop();
		}
	};

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="New container"
						icon={Icon.Plus}
						onSubmit={newContainer}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField id="nameNewContainer" title="Container name" />
			<Form.Dropdown id="profileNewContainer" title="Profile">
				{Object.keys(profiles).map((profile) => (
					<Form.Dropdown.Item
						value={profile.toString()}
						title={profile.toString()}
					/>
				))}
			</Form.Dropdown>
		</Form>
	);
};
