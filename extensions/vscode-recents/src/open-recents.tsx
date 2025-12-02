import {
	Icon,
	List,
	Action,
	ActionPanel,
	closeMainWindow,
	showInFileBrowser,
} from "@vicinae/api";

import {
	getIcon,
	getTypeLabel,
	RecentProject,
	showErrorToast,
	openCodeAtPath,
	getRecentProjects,
	initializeDatabase,
} from "./utils";

import { useEffect, useState } from "react";

export default function Command() {
	const [query, setQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [projects, setProjects] = useState<RecentProject[]>([]);

	useEffect(() => {
		(async () => {
			setIsLoading(true);
			try {
				await initializeDatabase();
				const recentProjects = getRecentProjects();
				recentProjects.sort((a, b) => b.lastOpened - a.lastOpened);

				setProjects(recentProjects);
				if (recentProjects.length === 0) {
					showErrorToast(
						"No Recent Projects Found",
						"No recent VS Code projects detected.",
					);
				}
			} catch (error) {
				showErrorToast("Error loading recent projects", String(error));
				setProjects([]);
			}
			setIsLoading(false);
		})();
	}, []);

	const filteredProjects = projects.filter((project) => {
		const searchText = query.toLowerCase();
		return (
			project.label.toLowerCase().includes(searchText) ||
			project.path.toLowerCase().includes(searchText)
		);
	});

	return (
		<List
			isLoading={isLoading}
			onSearchTextChange={setQuery}
			searchBarPlaceholder="Search recent VS Code projects"
		>
			{filteredProjects.map((project, index) => (
				<List.Item
					title={project.label}
					subtitle={project.path}
					icon={getIcon(project.type)}
					key={`${project.path}-${index}`}
					accessories={[
						{
							icon: getIcon(project.type),
							tag: getTypeLabel(project.type),
						},
					]}
					actions={createProjectActions(project.path)}
				/>
			))}
			<List.EmptyView
				icon={Icon.Document}
				title="No Recent Projects Found"
				description="No recent VS Code projects available."
			/>
		</List>
	);
}

export function createProjectActions(projectPath: string) {
	return (
		<ActionPanel>
			<Action
				icon={Icon.Code}
				title="Open in VS Code"
				onAction={() => {
					closeMainWindow();
					openCodeAtPath(projectPath);
				}}
				shortcut={{ modifiers: [], key: "enter" }}
			/>
			<Action
				icon={Icon.Folder}
				title="Show in File Manager"
				onAction={() => {
					closeMainWindow();
					showInFileBrowser(projectPath);
				}}
				shortcut={{ modifiers: ["shift"], key: "enter" }}
			/>
			{/* TODO: add removal logid */}
			{/* <Action
        icon={Icon.Trash}
        title="Remove Recent Project"
        onAction={() => {
          removeRecentProject(projectPath);
        }}
        shortcut={{ modifiers: ["ctrl"], key: "x" }}
      /> */}
			<Action.CopyToClipboard
				title="Copy Path"
				content={projectPath}
				icon={Icon.Clipboard}
				shortcut={{ modifiers: ["ctrl"], key: "c" }}
			/>
		</ActionPanel>
	);
}
