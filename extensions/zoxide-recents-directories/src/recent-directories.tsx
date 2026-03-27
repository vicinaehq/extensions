import { open, Cache, Clipboard, getPreferenceValues, List, Icon, ActionPanel, Action, showToast, Toast, getApplications, Application } from '@vicinae/api';
import { useEffect, useState } from 'react';
import { execa } from "execa";
import path from 'path';

export default function Directories() {
	const cache = new Cache();
	const gitProjects: boolean = getPreferenceValues().defaultFilter;
	const application = getPreferenceValues().application;
	const alternativeApplication = getPreferenceValues().alternativeApplication;

	const [isLoading, setIsLoading] = useState(true);
	const [dirs, setDirs] = useState<string[]>(() => {
		if (cache.isEmpty) return [];
		const strData = (gitProjects ? cache.get("gitProjects") : cache.get("directories")) ?? "";
		return JSON.parse(strData);
	});
	// Load apps once, not per-render
	const [apps, setApps] = useState<Application[]>([]);

	async function getDirectories(): Promise<string[]> {
		try {
			const { stdout } = await execa("zoxide", ["query", "-l"]);
			const directories = stdout.split("\n").filter(Boolean);
			cache.set("directories", JSON.stringify(directories));
			return directories;
		} catch (e) {
			return [];
		}
	}

	async function getGitProjects(): Promise<string[]> {
		const directories = await getDirectories();
		// fix: map then filter, async filter doesn't work
		const results = await Promise.all(
			directories.map(async (directory) => {
				try {
					const { exitCode } = await execa("test", ["-d", path.join(directory, ".git")]);
					return exitCode === 0 ? directory : null;
				} catch {
					return null;
				}
			})
		);
		const filtered = results.filter((d): d is string => d !== null);
		cache.set("gitProjects", JSON.stringify(filtered));
		return filtered;
	}

	// ← dependency array added, runs once
	useEffect(() => {
		if (gitProjects) {
			getGitProjects().then((directories) => {
				setDirs(directories);
				setIsLoading(false);
			})
		} else {
			getDirectories().then((directories) => {
				setDirs(directories)
				setIsLoading(false);
			})
		};
		getApplications().then((apps) => (setApps(apps)));
	}, []);

	async function openProject(projectPath: string, app: string) {
		try {
			await open(projectPath, app);
		} catch (error) {
			await showToast({ style: Toast.Style.Failure, title: "Failed to open project", message: String(error) });
		}
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search recent directories or projects">
			{dirs.map((dir) => (
				<List.Item
					key={dir}
					icon={Icon.Folder}
					title={dir.split("/").pop() || ""}
					subtitle={dir}
					actions={
						<ActionPanel>
							<Action title="Open Project" onAction={() => openProject(dir, application)} />
							{alternativeApplication && (
								<Action
									title="Open Alternative"
									shortcut={{ modifiers: ["shift"], key: "enter" }}
									onAction={() => openProject(dir, alternativeApplication)}
								/>
							)}
							<Action
								title="Copy Path"
								shortcut={{ modifiers: ["ctrl"], key: "enter" }}
								onAction={async () => {
									await Clipboard.copy(dir);
									showToast({ style: Toast.Style.Success, title: "Copied Path" });
								}}
							/>
							{gitProjects && (
								<Action
									title="Copy Repository Name"
									shortcut={{ modifiers: ["ctrl", "shift"], key: "enter" }}
									onAction={async () => {
										const basename = dir.split("/").pop() || "";
										await Clipboard.copy(basename);
										showToast({ style: Toast.Style.Success, title: "Copied Repository Name" });
									}}
								/>
							)}
							{apps.map((app) => (
								<Action
									key={app.id}
									title={`Open with ${app.name}`}
									icon={app.icon}
									onAction={() => openProject(dir, app.path)}
								/>
							))}
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
