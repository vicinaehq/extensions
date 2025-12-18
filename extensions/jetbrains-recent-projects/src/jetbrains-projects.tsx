import {
	Action,
	ActionPanel,
	closeMainWindow,
	Color,
	Icon,
	Keyboard,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	loadProjectsWithLaunchersAndIcons,
	ToolboxNotFoundError,
	InvalidPathError,
	type LoadedProjectData,
} from "./lib/jetbrains/load-projects";
import { getIdeIcon } from "./lib/jetbrains/ide-icons";
import { getResolvedPreferences } from "./lib/preferences";
import type { IdeId, ProjectEntry } from "./lib/types";

function formatLastOpened(ts?: number): Date | undefined {
	if (!ts) return undefined;
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return undefined;
	return d;
}

async function openProject(p: ProjectEntry): Promise<void> {
	const launcher = p.toolboxScriptPath ?? p.toolboxAppPath;
	if (!launcher) {
		await showToast({
			style: Toast.Style.Failure,
			title: "JetBrains Toolbox launcher not found",
			message: "Toolbox scripts/apps not found.",
		});
		return;
	}

	await closeMainWindow();

	const child = spawn(launcher, [p.projectPath], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
}

type DataState = {
	projects: ProjectEntry[];
	iconPaths: Map<IdeId, string>;
	isLoading: boolean;
	error?: string;
	toolboxNotFound?: boolean;
	invalidPath?: { path: string; type: string };
};

export default function JetBrainsProjects() {
	const [data, setData] = useState<DataState>({
		projects: [],
		iconPaths: new Map(),
		isLoading: true,
	});
	const [reloadToken, setReloadToken] = useState(0);

	const prefs = useMemo(() => getResolvedPreferences(), []);

	useEffect(() => {
		let cancelled = false;

		const loadData = async () => {
			setData((prev) => ({
				...prev,
				isLoading: true,
				error: undefined,
				toolboxNotFound: false,
				invalidPath: undefined,
			}));

			try {
				const result: LoadedProjectData =
					await loadProjectsWithLaunchersAndIcons({
						homeDir: prefs.homeDir,
						toolboxAppsDir: prefs.toolboxAppsDir,
						toolboxScriptsDir: prefs.toolboxScriptsDir,
						dotDesktopIconsDir: prefs.dotDesktopIconsDir,
					});

				if (!cancelled) {
					setData({
						projects: result.projects,
						iconPaths: result.iconPaths,
						isLoading: false,
					});
				}
			} catch (e) {
				if (!cancelled) {
					if (e instanceof ToolboxNotFoundError) {
						setData({
							projects: [],
							iconPaths: new Map(),
							isLoading: false,
							toolboxNotFound: true,
						});
					} else if (e instanceof InvalidPathError) {
						const errorMessage = e.message;
						setData({
							projects: [],
							iconPaths: new Map(),
							isLoading: false,
							error: errorMessage,
							invalidPath: {
								path: errorMessage.match(/path: (.+) -/)?.[1]?.trim() ?? "",
								type: errorMessage.match(/Invalid (.+) path:/)?.[1] ?? "",
							},
						});
						await showToast({
							style: Toast.Style.Failure,
							title: "Invalid Path Configuration",
							message: errorMessage,
						});
					} else {
						const errorMessage = e instanceof Error ? e.message : String(e);
						setData({
							projects: [],
							iconPaths: new Map(),
							isLoading: false,
							error: errorMessage,
						});
						await showToast({
							style: Toast.Style.Failure,
							title: "Failed to load JetBrains recent projects",
							message: errorMessage,
						});
					}
				}
			}
		};

		loadData();

		return () => {
			cancelled = true;
		};
	}, [reloadToken, prefs]);

	const handleReload = useCallback(() => {
		setReloadToken((x) => x + 1);
	}, []);

	const getIcon = useCallback(
		(ideId: IdeId): string | Icon => {
			return data.iconPaths.get(ideId) ?? getIdeIcon(ideId);
		},
		[data.iconPaths],
	);

	const globalActions = useMemo(
		() => (
			<ActionPanel>
				<Action
					title="Reload"
					icon={Icon.RotateClockwise}
					shortcut={Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common}
					onAction={handleReload}
				/>
			</ActionPanel>
		),
		[handleReload],
	);

	const toolboxNotFoundView = useMemo(
		() => (
			<List.EmptyView
				icon={Icon.Warning}
				title="JetBrains Toolbox Not Found"
				description="JetBrains Toolbox is not installed or the scripts/apps directory could not be found. Please install Toolbox or manually specify the directory paths in settings."
				actions={
					<ActionPanel>
						<Action.OpenInBrowser
							title="Download JetBrains Toolbox"
							url="https://www.jetbrains.com/toolbox-app/"
						/>
						<Action
							title="Reload"
							icon={Icon.RotateClockwise}
							shortcut={Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common}
							onAction={handleReload}
						/>
					</ActionPanel>
				}
			/>
		),
		[handleReload],
	);

	const invalidPathView = useMemo(
		() => (
			<List.EmptyView
				icon={Icon.XMarkCircle}
				title="Invalid Path Configuration"
				description={data.error ?? "The specified directory path does not exist. Please check your settings and provide a valid path."}
				actions={
					<ActionPanel>
						<Action.Open
							title="Open Vicinae Settings"
							target="vicinae://settings"
							icon={Icon.Gear}
						/>
						<Action
							title="Reload"
							icon={Icon.RotateClockwise}
							shortcut={Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common}
							onAction={handleReload}
						/>
					</ActionPanel>
				}
			/>
		),
		[data.error, handleReload],
	);

	const emptyView = useMemo(
		() => (
			<List.EmptyView
				icon={Icon.Folder}
				title="No recent projects found"
				description={
					data.error ??
					"Could not read recentProjects.xml from ~/.config/JetBrains or it is empty."
				}
				actions={globalActions}
			/>
		),
		[data.error, globalActions],
	);

	return (
		<List
			isLoading={data.isLoading}
			searchBarPlaceholder="Search JetBrains recent projects..."
			navigationTitle="JetBrains Projects"
			actions={globalActions}
		>
			{data.invalidPath && !data.isLoading ? invalidPathView : null}
			{!data.invalidPath &&
			data.toolboxNotFound &&
			!data.isLoading
				? toolboxNotFoundView
				: null}
			{!data.invalidPath &&
			!data.toolboxNotFound &&
			data.projects.length === 0 &&
			!data.isLoading
				? emptyView
				: null}

			{data.projects.map((p) => (
				<List.Item
					key={p.id}
					title={p.title}
					subtitle={p.projectPath}
					icon={getIcon(p.ideId)}
					accessories={[
						{ tag: { value: p.ideName, color: Color.Blue } },
						{ text: formatLastOpened(p.lastOpened) },
					]}
					actions={
						<ActionPanel>
							<Action
								title="Open Project"
								icon={Icon.ArrowRight}
								shortcut={Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common}
								onAction={() => openProject(p)}
							/>
							<Action.ShowInFinder
								title="Show in File Browser"
								path={p.projectPath}
							/>
							<Action.CopyToClipboard
								title="Copy Path"
								shortcut={Keyboard.Shortcut.Common.CopyPath as Keyboard.Shortcut.Common}
								content={p.projectPath}
							/>
							<Action
								title="Reload"
								icon={Icon.RotateClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common}
								onAction={handleReload}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
