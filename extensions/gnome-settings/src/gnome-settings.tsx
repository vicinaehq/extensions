import {
	Action,
	ActionPanel,
	closeMainWindow,
	Icon,
	List,
	showToast,
} from "@vicinae/api";
import { useMemo, useState } from "react";
import { executeCommand } from "./utils/command-executor";
import { gnomePanels } from "./utils/panels-data";

export default function GnomeSettingsList() {
	const [searchText, setSearchText] = useState("");

	const filterPanels = (query: string) => {
		return gnomePanels.filter(
			(panel) =>
				panel.name.toLowerCase().includes(query.toLowerCase()) ||
				panel.description.toLowerCase().includes(query.toLowerCase()) ||
				panel.keywords.some((keyword) =>
					keyword.toLowerCase().includes(query.toLowerCase()),
				),
		);
	};

	const filteredPanels = useMemo(() => filterPanels(searchText), [searchText]);

	const openPanel = async (panelName: string) => {
		try {
			await showToast({
				title: `Opening ${panelName} panel...`,
				message: "Launching GNOME Control Center",
			});

			// Launch gnome-control-center in the background
			const result = await executeCommand(`gnome-control-center ${panelName}`, {
				timeout: 5000,
			});

			if (!result.success) {
				throw new Error(
					result.error ||
						result.stderr ||
						"Failed to launch GNOME Control Center",
				);
			}

			await showToast({
				title: "Success",
				message: `${panelName} panel opened successfully`,
			});

			await closeMainWindow();
		} catch (error) {
			await showToast({
				title: "Error",
				message: `Failed to open ${panelName} panel: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	return (
		<List
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder="Search GNOME settings panels..."
		>
			<List.Section
				title={`Available GNOME Settings Panels (${filteredPanels.length})`}
			>
				{filteredPanels.length === 0 ? (
					<List.Item
						title="No panels found"
						subtitle="Try adjusting your search terms"
						icon={Icon.MagnifyingGlass}
					/>
				) : (
					filteredPanels.map((panel) => (
						<List.Item
							key={panel.name}
							title={panel.displayName}
							subtitle={panel.description}
							icon={panel.icon}
							keywords={panel.keywords}
							actions={
								<ActionPanel>
									<Action
										title="Open Panel"
										icon={Icon.Gear}
										onAction={() => openPanel(panel.name)}
									/>
									<Action.CopyToClipboard
										title="Copy Panel Name"
										content={panel.name}
									/>
									<Action.CopyToClipboard
										title="Copy Command"
										content={`gnome-control-center ${panel.name}`}
									/>
								</ActionPanel>
							}
						/>
					))
				)}
			</List.Section>
		</List>
	);
}
