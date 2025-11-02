import {
	ActionPanel,
	Action,
	List,
	showToast,
	Icon,
	getPreferenceValues,
	open,
	useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { listExegolContainers, startExegolContainer } from "./utils/cli";
import { ContainerCreationForm } from "./components/ContainerCreationForm";
import { ExegolContainer } from "./models/ExegolContainer";
import { homedir } from "os";
import { join } from "path";

export default function ListDetail() {
	const { terminal } = getPreferenceValues<Preferences>();
	const [containers, setExegolContainers] = useState<ExegolContainer[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const { push } = useNavigation();

	const refreshContainers = async () => {
		setIsLoading(true);
		try {
			const newContainers = await listExegolContainers();
			setExegolContainers(newContainers);
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
		refreshContainers();
	}, []);

	return (
		<List isLoading={isLoading} searchBarPlaceholder={"Search containers..."}>
			{containers.length === 0 && !isLoading ? (
				<List.Section title="No Exegol containers found">
					<List.Item
						key="empty"
						title=""
						actions={
							<ActionPanel>
								<Action
									title="Create a new container"
									icon={Icon.Plus}
									onAction={() => push(<ContainerCreationForm />)}
								/>
								<Action
									title="Refresh lists"
									icon={Icon.ArrowClockwise}
									onAction={() => {
										refreshContainers();
									}}
								/>
							</ActionPanel>
						}
					/>
				</List.Section>
			) : (
				<List.Section title={"Exegol containers:"}>
					{containers.map((container) => (
						<List.Item
							key={container.name}
							title={container.name}
							icon={Icon.AppWindow}
							actions={
								<ActionPanel>
									<Action
										title="Start the selected container"
										icon={Icon.Play}
										onAction={() =>
											startExegolContainer(
												terminal,
												container.name,
												"",
												undefined,
											)
										}
									/>
									<Action
										title="Open workspace of the selected container"
										icon={Icon.Folder}
										onAction={() =>
											open(
												join(
													homedir(),
													`/.exegol/workspaces/${container.name}`,
												),
											)
										}
									/>
									<Action
										title="Create a new container"
										icon={Icon.Plus}
										onAction={() => {
											push(<ContainerCreationForm />);
										}}
									/>
									<Action
										title="Refresh lists"
										icon={Icon.ArrowClockwise}
										onAction={() => {
											refreshContainers();
										}}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
